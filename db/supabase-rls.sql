-- db/supabase-rls.sql
-- Lock the Supabase data API down to you.
--
-- Supabase publishes every table in the public schema on the internet
-- through its data API (the hosted PostgREST). The "anon"/publishable key
-- in the dashboard isn't a secret, so access is controlled here instead:
--   * Row-level security is switched on for every table.
--   * The only policy allows signed-in users whose email is listed in
--     private.dashboard_users. Anonymous requests see nothing; other
--     signed-in users see nothing.
--   * The allow-list and its check function live in a `private` schema,
--     which the data API doesn't publish, so neither is reachable from the
--     internet.
--   * The Python API connects as the table owner (postgres), so these
--     rules don't apply to it.
--
-- Applied by `python -m scripts.setup_db` (which also adds your email to
-- private.dashboard_users). Idempotent; re-run it after adding new tables.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.dashboard_users (
  email       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.dashboard_users FROM PUBLIC;

-- SECURITY DEFINER so policies can check the list without the caller
-- being able to read it.
CREATE OR REPLACE FUNCTION private.is_dashboard_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.dashboard_users
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
REVOKE EXECUTE ON FUNCTION private.is_dashboard_user() FROM PUBLIC;

-- Policies run as the caller, so signed-in users need to reach the function
-- (but nothing else in the private schema).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA private TO authenticated;
    GRANT EXECUTE ON FUNCTION private.is_dashboard_user() TO authenticated;
  END IF;
END $$;

-- Earlier versions kept the allow-list in the exposed schema: move it.
DO $$ BEGIN
  IF to_regclass(format('%I.dashboard_users', current_schema())) IS NOT NULL THEN
    EXECUTE format('INSERT INTO private.dashboard_users (email, created_at) '
                   'SELECT email, created_at FROM %I.dashboard_users ON CONFLICT DO NOTHING', current_schema());
    EXECUTE format('DROP TABLE %I.dashboard_users', current_schema());
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dashboard_user_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY dashboard_user_all ON %I FOR ALL TO authenticated '
      'USING ((SELECT private.is_dashboard_user())) WITH CHECK ((SELECT private.is_dashboard_user()))', t);
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure(format('%I.is_dashboard_user()', current_schema())) IS NOT NULL THEN
    EXECUTE format('DROP FUNCTION %I.is_dashboard_user()', current_schema());
  END IF;
END $$;
