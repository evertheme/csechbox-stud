-- =============================================================================
--  @poker/csechbox-stud — timeout tracking ROLLBACK
--  Reverts: 20260415010000_timeouts.sql
-- =============================================================================
--
--  Run this script to completely undo the 20260415010000_timeouts migration.
--  Steps are executed in reverse-dependency order:
--    1. Revoke grants
--    2. Drop RLS policies
--    3. Drop timeout_history table (and its indexes via CASCADE)
--    4. Remove columns added to game_sessions
--
--  ⚠  This script is destructive. All data in timeout_history will be lost.
--
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Revoke grants
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE SELECT ON public.timeout_history FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "timeout_history: read own"        ON public.timeout_history;
DROP POLICY IF EXISTS "timeout_history: read co-players" ON public.timeout_history;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Drop timeout_history (indexes are dropped automatically via CASCADE)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.timeout_history;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Remove game_sessions columns added by this migration
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the cross-column constraint first; otherwise dropping the columns
-- that it references would leave a dangling constraint definition.
ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_sat_out_lte_timeouts;

ALTER TABLE public.game_sessions
  DROP COLUMN IF EXISTS timeout_count,
  DROP COLUMN IF EXISTS last_timeout_at,
  DROP COLUMN IF EXISTS auto_sat_out_count;

COMMIT;
