-- =============================================================================
--  @poker/csechbox-stud — rollback for 20260415000000_sessions
-- =============================================================================
--
--  Run this script to fully reverse the sessions migration.
--  Order of operations (reverse dependency order):
--
--   1. Revoke grants / drop RLS policies on new tables
--   2. Drop triggers and functions added by the migration
--   3. Drop new tables (session_summaries → game_sessions)
--   4. Drop new indexes on games
--   5. Remove new columns from games; restore stakes default
--   6. Remove new columns from users; restore chips_balance
--   7. Restore handle_new_auth_user to reference chips_balance
--
--  ⚠  This is a destructive operation.
--     All data in game_sessions and session_summaries will be lost.
--     All user session-stat aggregates will be lost.
--     Back up any data you need before running this script.
--
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Revoke grants and drop RLS policies on new tables
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.game_sessions     FROM authenticated;
REVOKE ALL ON public.session_summaries FROM authenticated;

DROP POLICY IF EXISTS "game_sessions: read own"           ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions: read co-players"    ON public.game_sessions;
DROP POLICY IF EXISTS "session_summaries: read all authenticated" ON public.session_summaries;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop triggers and functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-session user-stats rollup
DROP TRIGGER  IF EXISTS trg_update_user_stats       ON public.game_sessions;
DROP FUNCTION IF EXISTS public.update_user_session_stats();

-- updated_at maintenance
DROP TRIGGER  IF EXISTS trg_game_sessions_updated_at ON public.game_sessions;
-- Note: set_updated_at() is intentionally kept if other tables use it.
-- Drop only if nothing else references it:
-- DROP FUNCTION IF EXISTS public.set_updated_at();

-- Session stats query helper
DROP FUNCTION IF EXISTS public.calculate_session_stats(UUID);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Drop new tables (child tables first to respect FK constraints)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.session_summaries CASCADE;
DROP TABLE IF EXISTS public.game_sessions     CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Drop new indexes on games
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_games_created_by;
DROP INDEX IF EXISTS public.idx_games_session_date;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Remove new columns from games; restore stakes default
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.games
  DROP COLUMN IF EXISTS starting_buy_in,
  DROP COLUMN IF EXISTS min_rebuy,
  DROP COLUMN IF EXISTS max_rebuy,
  DROP COLUMN IF EXISTS allow_rebuys,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS max_players,
  DROP COLUMN IF EXISTS session_date;

-- Restore the original empty-object default.
ALTER TABLE public.games
  ALTER COLUMN stakes SET DEFAULT '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Remove new columns from users; restore chips_balance
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  DROP COLUMN IF EXISTS total_sessions_played,
  DROP COLUMN IF EXISTS total_profit,
  DROP COLUMN IF EXISTS best_session_profit,
  DROP COLUMN IF EXISTS worst_session_loss,
  DROP COLUMN IF EXISTS average_session_profit;

-- Re-add chips_balance with its original definition.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS chips_balance INTEGER NOT NULL DEFAULT 1000
    CONSTRAINT users_chips_non_negative CHECK (chips_balance >= 0);

COMMENT ON COLUMN public.users.chips_balance IS 'Current chip balance; never negative.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Restore handle_new_auth_user to reference chips_balance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, username, chips_balance, created_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    1000,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET last_login_at = NOW();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user IS
  'Automatically creates a public.users profile when a new auth.users row is inserted.';

COMMIT;
