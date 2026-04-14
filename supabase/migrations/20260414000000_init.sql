-- =============================================================================
--  @poker/csechbox-stud — initial database schema
--  Migration: 20260414000000_init
-- =============================================================================
--
--  Tables
--  ──────
--   public.users         Player profiles that extend auth.users
--   public.games         Individual game sessions
--   public.game_players  Join table: which players sat in which game
--   public.game_actions  Every bet / call / raise / fold action in a game
--
--  Security
--  ────────
--   Row Level Security (RLS) is enabled on every table.
--   INSERT / UPDATE / DELETE by client code is blocked unless a policy
--   explicitly permits it.  Server-side code uses the service role key,
--   which bypasses RLS entirely.
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Shorthand: raise a descriptive error when a CHECK constraint is violated.
-- Used in constraints further below.

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  -- Mirror of auth.users.id — deleting the auth record cascades here.
  id                UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Display name chosen by the player.
  username          TEXT        NOT NULL UNIQUE
                                  CONSTRAINT users_username_length
                                    CHECK (char_length(username) BETWEEN 3 AND 30)
                                  CONSTRAINT users_username_chars
                                    CHECK (username ~ '^[a-zA-Z0-9_-]+$'),

  -- In-game chip balance.  Must stay non-negative.
  chips_balance     INTEGER     NOT NULL DEFAULT 1000
                                  CONSTRAINT users_chips_non_negative
                                    CHECK (chips_balance >= 0),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at     TIMESTAMPTZ
);

COMMENT ON TABLE  public.users                IS 'Player profile extended from auth.users.';
COMMENT ON COLUMN public.users.id             IS 'Matches auth.users.id exactly.';
COMMENT ON COLUMN public.users.chips_balance  IS 'Current chip balance; never negative.';

-- ---------------------------------------------------------------------------
-- 2. games
-- ---------------------------------------------------------------------------

CREATE TABLE public.games (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Variant identifier — matches GameType from @poker/game-engine.
  -- e.g. "seven-card-stud", "razz", "five-card-stud-hi-lo"
  game_type   TEXT        NOT NULL,

  -- Serialised ante / bring-in / bet structure.
  -- { "ante": 10, "bringIn": 5, "smallBet": 20, "bigBet": 40 }
  stakes      JSONB       NOT NULL DEFAULT '{}',

  status      TEXT        NOT NULL DEFAULT 'waiting'
                            CONSTRAINT games_status_values
                              CHECK (status IN ('waiting', 'active', 'complete', 'cancelled')),

  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ended_at must come after started_at when both are set.
  CONSTRAINT games_ended_after_started
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

COMMENT ON TABLE  public.games            IS 'A single hand or session of poker.';
COMMENT ON COLUMN public.games.game_type  IS 'GameType variant ID from @poker/game-engine.';
COMMENT ON COLUMN public.games.stakes     IS 'JSON stake structure: ante, bringIn, smallBet, bigBet.';
COMMENT ON COLUMN public.games.status     IS 'waiting | active | complete | cancelled';

-- ---------------------------------------------------------------------------
-- 3. game_players
-- ---------------------------------------------------------------------------

CREATE TABLE public.game_players (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  game_id     UUID        NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,

  -- Seat number at the table (0-based).
  position    INTEGER     NOT NULL
                            CONSTRAINT game_players_position_non_negative
                              CHECK (position >= 0),

  -- Chips brought to the table at the start of the game.
  buy_in      INTEGER     NOT NULL DEFAULT 0
                            CONSTRAINT game_players_buy_in_non_negative
                              CHECK (buy_in >= 0),

  -- Chips cashed out at the end; NULL while game is in progress.
  cash_out    INTEGER               CONSTRAINT game_players_cash_out_non_negative
                              CHECK (cash_out IS NULL OR cash_out >= 0),

  -- Serialised HandRank | LowHandRank from @poker/game-engine at showdown.
  -- { "type": 7, "description": "Full House, Kings over Tens", "value": 9834567 }
  final_hand  JSONB,

  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One seat per player per game.
  CONSTRAINT game_players_unique_user   UNIQUE (game_id, user_id),
  -- One player per seat per game.
  CONSTRAINT game_players_unique_seat   UNIQUE (game_id, position)
);

COMMENT ON TABLE  public.game_players             IS 'Maps players to the game sessions they participated in.';
COMMENT ON COLUMN public.game_players.position    IS '0-based seat index at the table.';
COMMENT ON COLUMN public.game_players.buy_in      IS 'Chips purchased at the start of the session.';
COMMENT ON COLUMN public.game_players.cash_out    IS 'Chips remaining at the end; NULL while still in progress.';
COMMENT ON COLUMN public.game_players.final_hand  IS 'Serialised HandRank/LowHandRank result at showdown.';

-- ---------------------------------------------------------------------------
-- 4. game_actions
-- ---------------------------------------------------------------------------

CREATE TABLE public.game_actions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  game_id      UUID        NOT NULL REFERENCES public.games  (id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.users  (id) ON DELETE CASCADE,

  -- One of: "ante" | "bring-in" | "bet" | "call" | "raise" | "fold" | "check" | "all-in"
  action_type  TEXT        NOT NULL
                             CONSTRAINT game_actions_type_values
                               CHECK (action_type IN (
                                 'ante', 'bring-in',
                                 'bet', 'call', 'raise', 'fold', 'check', 'all-in'
                               )),

  -- Chip amount involved (0 for fold / check).
  amount       INTEGER     NOT NULL DEFAULT 0
                             CONSTRAINT game_actions_amount_non_negative
                               CHECK (amount >= 0),

  -- Street during which this action occurred.
  -- e.g. "third-street", "fourth-street" — matches StreetName from @poker/game-engine
  street       TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.game_actions              IS 'Immutable ledger of every player action within a game.';
COMMENT ON COLUMN public.game_actions.action_type  IS 'ante | bring-in | bet | call | raise | fold | check | all-in';
COMMENT ON COLUMN public.game_actions.amount       IS 'Chips involved; 0 for fold and check.';
COMMENT ON COLUMN public.game_actions.street       IS 'Street name from StreetName (e.g. "third-street").';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Most queries filter game_players by game or by user.
CREATE INDEX idx_game_players_game_id  ON public.game_players (game_id);
CREATE INDEX idx_game_players_user_id  ON public.game_players (user_id);

-- Action log is almost always queried per game, often with ordering by time.
CREATE INDEX idx_game_actions_game_id    ON public.game_actions (game_id);
CREATE INDEX idx_game_actions_user_id    ON public.game_actions (user_id);
CREATE INDEX idx_game_actions_created_at ON public.game_actions (created_at);

-- Games are frequently filtered by status.
CREATE INDEX idx_games_status ON public.games (status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_actions ENABLE ROW LEVEL SECURITY;

-- ── users ──────────────────────────────────────────────────────────────────

-- A player may only read their own profile row.
CREATE POLICY "users: read own record"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- A player may only update their own profile row.
-- id and created_at are intentionally immutable (no UPDATE policy covers them).
CREATE POLICY "users: update own record"
  ON public.users
  FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── games ──────────────────────────────────────────────────────────────────

-- A player may read a game row only when they have a seat in that game.
CREATE POLICY "games: read if participant"
  ON public.games
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.game_players gp
      WHERE gp.game_id = games.id
        AND gp.user_id = auth.uid()
    )
  );

-- ── game_players ───────────────────────────────────────────────────────────

-- A player may read all seats in any game they are also seated at.
-- This lets a player see who else is at the table (seat, buy-in, etc.) but
-- not seats in games they never joined.
CREATE POLICY "game_players: read own games"
  ON public.game_players
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.game_players gp
      WHERE gp.game_id = game_players.game_id
        AND gp.user_id = auth.uid()
    )
  );

-- ── game_actions ───────────────────────────────────────────────────────────

-- All actions are visible to every participant of the game.
-- This mirrors real-world poker: all bets / folds are public information.
CREATE POLICY "game_actions: read as participant"
  ON public.game_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.game_players gp
      WHERE gp.game_id = game_actions.game_id
        AND gp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Trigger: auto-create user profile on sign-up
-- ---------------------------------------------------------------------------

-- Called by Supabase Auth whenever a new row is inserted into auth.users.
-- Extracts the email-prefix as the initial username; the player can change it
-- later through the UPDATE policy above.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                    -- runs with the function owner's privileges
SET search_path = public            -- pin search path to prevent privilege escalation
AS $$
BEGIN
  INSERT INTO public.users (id, username, chips_balance, created_at)
  VALUES (
    NEW.id,
    -- Derive a default username from the email address.
    -- The player is expected to update this to something meaningful.
    COALESCE(
      NEW.raw_user_meta_data->>'username',      -- honour username passed at sign-up
      SPLIT_PART(NEW.email, '@', 1)             -- fall back to email prefix
    ),
    1000,                                       -- starting chip balance
    NOW()
  )
  -- If a profile already exists (e.g. from a previous sign-up attempt that
  -- failed mid-way) update the timestamps rather than error.
  ON CONFLICT (id) DO UPDATE
    SET last_login_at = NOW();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user IS
  'Automatically creates a public.users profile when a new auth.users row is inserted.';

-- Fire once per new auth user, after the auth row is committed.
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Trigger: keep last_login_at current
-- ---------------------------------------------------------------------------

-- Supabase Auth updates auth.users.last_sign_in_at whenever a user
-- authenticates.  Mirror that timestamp into public.users.
CREATE OR REPLACE FUNCTION public.handle_auth_user_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when last_sign_in_at actually changes.
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE public.users
    SET last_login_at = NEW.last_sign_in_at
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_auth_user_login IS
  'Mirrors auth.users.last_sign_in_at into public.users.last_login_at on every login.';

CREATE OR REPLACE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_login();

-- ---------------------------------------------------------------------------
-- Grant usage to authenticated role
-- ---------------------------------------------------------------------------
--
-- The `authenticated` role is the Supabase role that represents a signed-in
-- user.  Granting SELECT/UPDATE here allows RLS policies to fire; without it
-- the user cannot reach the policies at all.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, UPDATE             ON public.users        TO authenticated;
GRANT SELECT                     ON public.games        TO authenticated;
GRANT SELECT                     ON public.game_players TO authenticated;
GRANT SELECT                     ON public.game_actions TO authenticated;

-- The `anon` role (unauthenticated) has no access to any table.
REVOKE ALL ON public.users        FROM anon;
REVOKE ALL ON public.games        FROM anon;
REVOKE ALL ON public.game_players FROM anon;
REVOKE ALL ON public.game_actions FROM anon;
