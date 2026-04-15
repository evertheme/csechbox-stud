-- =============================================================================
--  @poker/csechbox-stud — session-based tracking
--  Migration: 20260415000000_sessions
-- =============================================================================
--
--  What this migration does
--  ────────────────────────
--   1. users          — drop chips_balance; add aggregate session-stat columns
--   2. games          — add buy-in config, creator FK, session metadata;
--                       fix stakes default to $1/$2
--   3. game_sessions  — per-player record for every game they sit in
--   4. session_summaries — end-of-game leaderboard snapshot
--   5. Indexes        — covering the most common access patterns
--   6. Trigger        — roll user-level stats forward on session close
--   7. Function       — calculate_session_stats(game_uuid)
--   8. RLS + grants   — extend existing policies to new tables
--
--  Rollback
--  ────────
--   Run 20260415000000_sessions_rollback.sql to undo every change below.
--
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. users — session statistics
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the chips_balance column (chips are now unlimited / free in a friendly
-- game; individual session stacks are tracked in game_sessions instead).
ALTER TABLE public.users DROP COLUMN IF EXISTS chips_balance;

-- Add aggregate session-stat columns.
-- All default to 0 / NULL so existing rows are valid immediately.
--
-- worst_session_loss stores the most negative net_profit seen across sessions
-- (a negative integer means the player lost chips).  Initialising at 0 means
-- "no losing session recorded yet".
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS total_sessions_played INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_profit          BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_session_profit   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worst_session_loss    INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_session_profit DECIMAL(10,2);

COMMENT ON COLUMN public.users.total_sessions_played  IS 'Lifetime count of completed game sessions.';
COMMENT ON COLUMN public.users.total_profit           IS 'Cumulative net chip profit across all sessions (can be negative).';
COMMENT ON COLUMN public.users.best_session_profit    IS 'Highest single-session net_profit recorded.';
COMMENT ON COLUMN public.users.worst_session_loss     IS 'Lowest single-session net_profit recorded (0 = no losing session yet).';
COMMENT ON COLUMN public.users.average_session_profit IS 'Running average of net_profit per session; NULL until first session completes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Update the auth-trigger: remove the now-deleted chips_balance column
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, username, created_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET last_login_at = NOW();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user IS
  'Automatically creates a public.users profile when a new auth.users row is inserted.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. games — buy-in config + metadata
-- ─────────────────────────────────────────────────────────────────────────────

-- Fix stakes default to the constant $1/$2 friendly-game structure.
ALTER TABLE public.games
  ALTER COLUMN stakes SET DEFAULT '{"ante": 1, "bringIn": 2}'::jsonb;

COMMENT ON COLUMN public.games.stakes IS
  'Fixed $1/$2 stake structure: {"ante": 1, "bringIn": 2}. Kept as JSONB for extensibility.';

-- Buy-in configuration.
-- DEFAULT 0 is a safe placeholder for any existing rows; the application
-- must always supply explicit values when creating new games.
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS starting_buy_in INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_rebuy       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_rebuy       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allow_rebuys   BOOLEAN NOT NULL DEFAULT true;

-- Session metadata.
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS max_players  INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS session_date DATE    NOT NULL DEFAULT CURRENT_DATE;

-- Creator FK.  Added as nullable so existing rows (without a known creator)
-- remain valid.  The application enforces created_by on every INSERT.
-- After a data-backfill you may run:
--   ALTER TABLE public.games ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS created_by UUID
    REFERENCES public.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.games.starting_buy_in IS 'Chip amount each player starts the session with.';
COMMENT ON COLUMN public.games.min_rebuy       IS 'Minimum chip amount for a single rebuy.';
COMMENT ON COLUMN public.games.max_rebuy       IS 'Maximum chip amount for a single rebuy (0 = unlimited).';
COMMENT ON COLUMN public.games.allow_rebuys    IS 'Whether mid-game rebuys are permitted.';
COMMENT ON COLUMN public.games.max_players     IS 'Seat capacity for this game.';
COMMENT ON COLUMN public.games.session_date    IS 'Calendar date of the session (defaults to creation date).';
COMMENT ON COLUMN public.games.created_by      IS 'User who created/hosts the room; NULL for legacy rows.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. game_sessions
-- ─────────────────────────────────────────────────────────────────────────────
--
-- One row per (game, user) pair.  This is the primary per-player ledger for
-- a single game session — buy-ins, chip counts, hand stats, achievements.
-- The existing game_players table remains for backward compatibility (seating /
-- final-hand data); game_sessions is the authoritative source for financials.

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  game_id     UUID        NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,

  -- ── Join / leave tracking ────────────────────────────────────────────────
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at     TIMESTAMPTZ,
  is_active   BOOLEAN     NOT NULL DEFAULT true,

  -- ── Buy-in tracking ───────────────────────────────────────────────────────
  -- buy_ins is an ordered JSON array of individual rebuy amounts,
  -- e.g. [1000, 1000] for two $1 000-chip buy-ins.
  buy_ins         JSONB   NOT NULL DEFAULT '[]'::jsonb,
  buy_in_count    INTEGER NOT NULL DEFAULT 1,
  total_buy_in    INTEGER NOT NULL
                            CONSTRAINT game_sessions_total_buy_in_positive
                              CHECK (total_buy_in > 0),

  -- ── Chip tracking ─────────────────────────────────────────────────────────
  starting_chips  INTEGER NOT NULL
                            CONSTRAINT game_sessions_starting_chips_non_negative
                              CHECK (starting_chips >= 0),
  current_chips   INTEGER NOT NULL
                            CONSTRAINT game_sessions_current_chips_non_negative
                              CHECK (current_chips >= 0),
  max_chips_held  INTEGER NOT NULL DEFAULT 0
                            CONSTRAINT game_sessions_max_chips_non_negative
                              CHECK (max_chips_held >= 0),
  final_chips     INTEGER           CONSTRAINT game_sessions_final_chips_non_negative
                              CHECK (final_chips IS NULL OR final_chips >= 0),

  -- ── Performance ───────────────────────────────────────────────────────────
  -- net_profit = final_chips - total_buy_in (negative means a loss).
  net_profit      INTEGER,
  hands_played    INTEGER NOT NULL DEFAULT 0
                            CONSTRAINT game_sessions_hands_played_non_negative
                              CHECK (hands_played >= 0),
  hands_won       INTEGER NOT NULL DEFAULT 0
                            CONSTRAINT game_sessions_hands_won_non_negative
                              CHECK (hands_won >= 0),
  win_rate        DECIMAL(5,2)
                            CONSTRAINT game_sessions_win_rate_range
                              CHECK (win_rate IS NULL OR (win_rate BETWEEN 0 AND 100)),

  -- ── Notable achievements ──────────────────────────────────────────────────
  biggest_pot_won INTEGER NOT NULL DEFAULT 0
                            CONSTRAINT game_sessions_biggest_pot_non_negative
                              CHECK (biggest_pot_won >= 0),
  best_hand       TEXT,
  best_hand_cards JSONB,

  -- ── Timestamps ────────────────────────────────────────────────────────────
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Integrity: hands_won cannot exceed hands_played.
  CONSTRAINT game_sessions_wins_lte_played
    CHECK (hands_won <= hands_played),

  -- One session record per player per game.
  CONSTRAINT game_sessions_unique_user_game
    UNIQUE (game_id, user_id)
);

COMMENT ON TABLE  public.game_sessions                  IS 'Per-player financial and statistical record for a single game session.';
COMMENT ON COLUMN public.game_sessions.buy_ins          IS 'Ordered array of individual buy-in amounts, e.g. [1000, 1000].';
COMMENT ON COLUMN public.game_sessions.buy_in_count     IS 'Total number of buy-ins (including initial buy-in).';
COMMENT ON COLUMN public.game_sessions.total_buy_in     IS 'Sum of all buy-in amounts for this session.';
COMMENT ON COLUMN public.game_sessions.starting_chips   IS 'Chip count at the start of the session (initial buy-in).';
COMMENT ON COLUMN public.game_sessions.current_chips    IS 'Live chip count; updated during the game.';
COMMENT ON COLUMN public.game_sessions.max_chips_held   IS 'Peak chip count at any point during the session.';
COMMENT ON COLUMN public.game_sessions.final_chips      IS 'Chip count at session end; NULL while session is active.';
COMMENT ON COLUMN public.game_sessions.net_profit       IS 'final_chips - total_buy_in; negative means a loss; NULL while active.';
COMMENT ON COLUMN public.game_sessions.win_rate         IS 'hands_won / hands_played × 100; NULL while no hands played.';
COMMENT ON COLUMN public.game_sessions.best_hand        IS 'Human-readable label of the best hand achieved, e.g. "Full House".';
COMMENT ON COLUMN public.game_sessions.best_hand_cards  IS 'Serialised card array for the best hand, e.g. [{"rank":"A","suit":"s"},…].';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. session_summaries
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Immutable end-of-game snapshot written once when a game completes.
-- Used for the session history feed and aggregate leaderboards without
-- requiring expensive joins across game_sessions.

CREATE TABLE IF NOT EXISTS public.session_summaries (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  game_id         UUID    NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  session_date    DATE    NOT NULL,
  game_type       TEXT    NOT NULL,

  -- Fixed $1/$2 stakes stored here for denormalisation / display purposes.
  stakes          JSONB   NOT NULL DEFAULT '{"ante": 1, "bringIn": 2}'::jsonb,
  starting_buy_in INTEGER NOT NULL,

  -- ── Player roster ─────────────────────────────────────────────────────────
  total_players   INTEGER NOT NULL
                            CONSTRAINT session_summaries_players_positive
                              CHECK (total_players > 0),
  player_names    TEXT[]  NOT NULL,
  player_ids      UUID[]  NOT NULL,

  -- ── Leaderboard ───────────────────────────────────────────────────────────
  -- JSON array sorted by profit DESC.
  -- Each element: { userId, username, profit, buyIns, finalChips }
  player_stats    JSONB   NOT NULL,

  -- ── Winner ────────────────────────────────────────────────────────────────
  winner_id       UUID    REFERENCES public.users (id) ON DELETE SET NULL,
  winner_name     TEXT,
  winner_profit   INTEGER,

  -- ── Game-wide stats ───────────────────────────────────────────────────────
  total_hands_played  INTEGER NOT NULL DEFAULT 0,
  total_pot_value     INTEGER NOT NULL DEFAULT 0,
  biggest_pot         INTEGER NOT NULL DEFAULT 0,
  duration_minutes    INTEGER           CONSTRAINT session_summaries_duration_positive
                                CHECK (duration_minutes IS NULL OR duration_minutes >= 0),

  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT session_summaries_ended_after_started
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

COMMENT ON TABLE  public.session_summaries              IS 'Immutable end-of-game snapshot used for history feeds and leaderboards.';
COMMENT ON COLUMN public.session_summaries.player_stats IS
  'JSON array sorted by profit DESC: [{userId, username, profit, buyIns, finalChips}, …]';
COMMENT ON COLUMN public.session_summaries.player_ids   IS 'GIN-indexed UUID array for fast "sessions involving user X" queries.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- game_sessions
CREATE INDEX IF NOT EXISTS idx_game_sessions_user
  ON public.game_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_game_sessions_game
  ON public.game_sessions (game_id);

-- Partial index: fast lookup of all sessions that are still running.
CREATE INDEX IF NOT EXISTS idx_game_sessions_active
  ON public.game_sessions (is_active)
  WHERE is_active = true;

-- session_summaries
CREATE INDEX IF NOT EXISTS idx_session_summaries_players
  ON public.session_summaries USING GIN (player_ids);

CREATE INDEX IF NOT EXISTS idx_session_summaries_date
  ON public.session_summaries (session_date DESC);

CREATE INDEX IF NOT EXISTS idx_session_summaries_game_type
  ON public.session_summaries (game_type);

-- games (new columns)
CREATE INDEX IF NOT EXISTS idx_games_created_by
  ON public.games (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_games_session_date
  ON public.games (session_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: auto-update updated_at on game_sessions writes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Trigger: roll user aggregate stats forward when a session closes
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Fires AFTER UPDATE on game_sessions whenever left_at transitions from NULL
-- to a timestamp (i.e. the moment the player's session is marked as ended).
--
-- Note on multi-column UPDATE evaluation:
--   PostgreSQL evaluates ALL right-hand expressions against the *pre-update*
--   row values before writing any column.  This means:
--     • total_profit     in the average expression = the OLD cumulative total
--     • total_sessions_played in the divisor      = the OLD session count
--   so the formula (old_total + new_profit) / (old_count + 1) is correct.

CREATE OR REPLACE FUNCTION public.update_user_session_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profit INTEGER;
BEGIN
  -- Only act when the session is being closed (left_at set for the first time).
  IF NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN

    -- Guard: treat a missing net_profit as zero for aggregation purposes.
    v_profit := COALESCE(NEW.net_profit, 0);

    UPDATE public.users
    SET
      total_sessions_played  = total_sessions_played + 1,
      total_profit           = total_profit + v_profit,
      best_session_profit    = GREATEST(best_session_profit, v_profit),
      worst_session_loss     = LEAST(worst_session_loss, v_profit),
      -- average uses OLD values of total_profit and total_sessions_played
      -- (see note above) which gives the correct new average.
      average_session_profit = (total_profit + v_profit)::DECIMAL(10,2)
                               / (total_sessions_played + 1)
    WHERE id = NEW.user_id;

  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_user_session_stats IS
  'Rolls up per-session results into the users table aggregate columns when a game_sessions row is closed.';

CREATE OR REPLACE TRIGGER trg_update_user_stats
  AFTER UPDATE ON public.game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_session_stats();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Function: calculate_session_stats
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Returns an ordered leaderboard for a completed (or in-progress) game.
-- Used by the server when building a session_summaries row and by the
-- stats API endpoint.

CREATE OR REPLACE FUNCTION public.calculate_session_stats(game_uuid UUID)
RETURNS TABLE (
  user_id       UUID,
  username      TEXT,
  profit        INTEGER,
  buy_in_count  INTEGER,
  total_buy_in  INTEGER,
  final_chips   INTEGER,
  hands_played  INTEGER,
  hands_won     INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.user_id,
    u.username,
    gs.net_profit       AS profit,
    gs.buy_in_count,
    gs.total_buy_in,
    gs.final_chips,
    gs.hands_played,
    gs.hands_won
  FROM public.game_sessions gs
  JOIN public.users          u  ON u.id = gs.user_id
  WHERE gs.game_id = game_uuid
  ORDER BY gs.net_profit DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.calculate_session_stats(UUID) IS
  'Returns a profit-ordered leaderboard for all players in a given game.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.game_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_summaries ENABLE ROW LEVEL SECURITY;

-- ── game_sessions ────────────────────────────────────────────────────────────

-- A player may read their own session rows.
CREATE POLICY "game_sessions: read own"
  ON public.game_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- A player may also see the session rows of other players in the same game
-- (so the in-game leaderboard works client-side).
CREATE POLICY "game_sessions: read co-players"
  ON public.game_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.game_sessions my_gs
      WHERE my_gs.game_id = game_sessions.game_id
        AND my_gs.user_id = auth.uid()
    )
  );

-- ── session_summaries ────────────────────────────────────────────────────────

-- Session summaries are publicly readable to any authenticated user so that
-- the session history feed can show results from games they weren't in.
CREATE POLICY "session_summaries: read all authenticated"
  ON public.session_summaries
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.game_sessions     TO authenticated;
GRANT SELECT ON public.session_summaries TO authenticated;

-- Deny unauthenticated access.
REVOKE ALL ON public.game_sessions     FROM anon;
REVOKE ALL ON public.session_summaries FROM anon;

COMMIT;
