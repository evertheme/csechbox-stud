-- =============================================================================
--  @poker/csechbox-stud — timeout tracking
--  Migration: 20260415010000_timeouts
-- =============================================================================
--
--  What this migration does
--  ────────────────────────
--   1. game_sessions  — add timeout_count, last_timeout_at, auto_sat_out_count
--   2. timeout_history — new table recording every individual timeout event
--   3. Indexes         — covering the common access patterns on timeout_history
--   4. RLS + grants    — consistent with the sessions migration
--
--  Rollback
--  ────────
--   Run 20260415010000_timeouts_rollback.sql to undo every change below.
--
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. game_sessions — timeout counters
-- ─────────────────────────────────────────────────────────────────────────────
--
-- timeout_count      — total number of times the player's action timer expired
--                      during this session (regardless of whether they were
--                      sat out automatically).
--
-- last_timeout_at    — timestamp of the most recent timeout; NULL until the
--                      first one occurs.  Useful for detecting players who have
--                      been inactive for a long stretch without checking the
--                      full timeout_history table.
--
-- auto_sat_out_count — subset of timeout_count where the game engine
--                      automatically sat the player out (i.e. consecutive
--                      timeouts hit the threshold).

ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS timeout_count      INTEGER     NOT NULL DEFAULT 0
    CONSTRAINT game_sessions_timeout_count_non_negative
      CHECK (timeout_count >= 0),
  ADD COLUMN IF NOT EXISTS last_timeout_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_sat_out_count INTEGER     NOT NULL DEFAULT 0
    CONSTRAINT game_sessions_auto_sat_out_non_negative
      CHECK (auto_sat_out_count >= 0);

-- auto_sat_out_count can never exceed total timeout_count.
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_sat_out_lte_timeouts
    CHECK (auto_sat_out_count <= timeout_count);

COMMENT ON COLUMN public.game_sessions.timeout_count      IS 'Total action-timer expirations for this player in this session.';
COMMENT ON COLUMN public.game_sessions.last_timeout_at    IS 'Timestamp of the most recent timeout; NULL until first timeout occurs.';
COMMENT ON COLUMN public.game_sessions.auto_sat_out_count IS 'Number of consecutive-timeout sequences that resulted in the player being auto-sat-out.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. timeout_history
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Append-only audit log: one row per timeout event.
-- Foreign keys to both games and users give two natural read paths:
--   • All timeouts in a specific game   → WHERE game_id = ?
--   • All timeouts for a specific player → WHERE user_id = ?
--
-- Columns that capture the game state at the moment of the timeout
-- (hand_number, pot_size_at_timeout, current_bet, street, position) are stored
-- here so historical analysis doesn't require replaying game logs.

CREATE TABLE IF NOT EXISTS public.timeout_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  game_id     UUID        NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,

  -- ── Timeout details ───────────────────────────────────────────────────────
  timed_out_at          TIMESTAMPTZ NOT NULL,
  hand_number           INTEGER     NOT NULL
                                      CONSTRAINT timeout_history_hand_number_positive
                                        CHECK (hand_number > 0),

  -- chips_forfeited: the chips the player lost by not acting (e.g. a forced
  -- fold that cost them a live bet or dead blind).  0 if the timeout did not
  -- directly cost chips (e.g. a check-behind timeout).
  chips_forfeited       INTEGER     NOT NULL DEFAULT 0
                                      CONSTRAINT timeout_history_chips_forfeited_non_negative
                                        CHECK (chips_forfeited >= 0),

  pot_size_at_timeout   INTEGER     NOT NULL
                                      CONSTRAINT timeout_history_pot_size_non_negative
                                        CHECK (pot_size_at_timeout >= 0),

  -- current_bet: the bet the player failed to match (0 if checking was an
  -- option, i.e. there was no open bet).
  current_bet           INTEGER     NOT NULL DEFAULT 0
                                      CONSTRAINT timeout_history_current_bet_non_negative
                                        CHECK (current_bet >= 0),

  -- ── Action context ────────────────────────────────────────────────────────
  -- street: the betting round during which the timeout occurred.
  -- For 5-card stud:  'third', 'fourth', 'fifth'
  -- For 7-card stud:  'third', 'fourth', 'fifth', 'sixth', 'seventh'
  -- NULL is allowed for legacy rows or game variants without named streets.
  street                TEXT
                          CONSTRAINT timeout_history_street_check
                            CHECK (street IN (
                              'third', 'fourth', 'fifth', 'sixth', 'seventh'
                            ) OR street IS NULL),

  -- position: 0-based seat index of the player when the timeout fired.
  -- Helps identify whether certain seats are consistently slower.
  position              INTEGER
                          CONSTRAINT timeout_history_position_non_negative
                            CHECK (position IS NULL OR position >= 0),

  -- ── Result ────────────────────────────────────────────────────────────────
  -- auto_sat_out: TRUE when this specific timeout triggered an automatic
  -- sit-out (i.e. consecutive-timeout threshold was reached).
  auto_sat_out          BOOLEAN     NOT NULL DEFAULT true,

  -- ── Timestamps ────────────────────────────────────────────────────────────
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.timeout_history                            IS 'Append-only audit log of every action-timer expiration, one row per event.';
COMMENT ON COLUMN public.timeout_history.timed_out_at              IS 'Wall-clock timestamp when the action timer expired.';
COMMENT ON COLUMN public.timeout_history.hand_number               IS 'Sequential hand number within the game at the time of the timeout.';
COMMENT ON COLUMN public.timeout_history.chips_forfeited           IS 'Chips lost directly due to the timeout (0 if no chips were forfeited).';
COMMENT ON COLUMN public.timeout_history.pot_size_at_timeout       IS 'Total chips in the pot at the moment the timeout fired.';
COMMENT ON COLUMN public.timeout_history.current_bet               IS 'The open bet the player failed to match; 0 if checking was an option.';
COMMENT ON COLUMN public.timeout_history.street                    IS 'Betting round: third/fourth/fifth/sixth/seventh; NULL for unknown.';
COMMENT ON COLUMN public.timeout_history.position                  IS '0-based seat index of the timed-out player.';
COMMENT ON COLUMN public.timeout_history.auto_sat_out              IS 'TRUE when this timeout crossed the consecutive-timeout threshold and auto-sat the player out.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary read paths: look up all timeouts for a game or a user.
CREATE INDEX IF NOT EXISTS idx_timeout_history_game
  ON public.timeout_history (game_id);

CREATE INDEX IF NOT EXISTS idx_timeout_history_user
  ON public.timeout_history (user_id);

-- Chronological feed (most-recent first), used by analytics / admin views.
CREATE INDEX IF NOT EXISTS idx_timeout_history_date
  ON public.timeout_history (timed_out_at DESC);

-- Compound index for the most common analytical query:
-- "All timeouts for user X across their sessions, newest first."
CREATE INDEX IF NOT EXISTS idx_timeout_history_user_date
  ON public.timeout_history (user_id, timed_out_at DESC);

-- Partial index for auto-sat-out events only; useful for behaviour reports.
CREATE INDEX IF NOT EXISTS idx_timeout_history_auto_sat_out
  ON public.timeout_history (game_id, user_id)
  WHERE auto_sat_out = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.timeout_history ENABLE ROW LEVEL SECURITY;

-- A player may read their own timeout events.
CREATE POLICY "timeout_history: read own"
  ON public.timeout_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- A player may also read timeout events that occurred in games they participated
-- in (needed for the in-game timeline / post-game recap screen).
CREATE POLICY "timeout_history: read co-players"
  ON public.timeout_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.game_sessions gs
      WHERE gs.game_id = timeout_history.game_id
        AND gs.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.timeout_history TO authenticated;
REVOKE ALL   ON public.timeout_history FROM anon;

COMMIT;
