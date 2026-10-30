-- db/supabase-rls.sql
-- Lock the Supabase data API down to you.
--
-- Supabase publishes every table in this schema on the internet through
-- its data API (the hosted PostgREST). The "anon" key in the dashboard
-- isn't a secret, so access is controlled here instead:
--   * Row-level security is switched on for every table.
--   * The only policy allows signed-in users whose email is listed in
--     dashboard_users. Anonymous requests see nothing; other signed-in
--     users see nothing.
--   * The Python API connects as the table owner (postgres), so these
--     rules don't apply to it.
--
-- Applied by `python -m scripts.setup_db` (which also adds your email to
-- dashboard_users). Idempotent; re-run it after adding new tables.

CREATE TABLE IF NOT EXISTS dashboard_users (
  email       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SECURITY DEFINER so policies can check the list without the caller
-- being able to read it.
CREATE OR REPLACE FUNCTION is_dashboard_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT EXISTS (
    SELECT 1 FROM dashboard_users
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dashboard_user_all ON %I', t);
    IF t <> 'dashboard_users' THEN  -- the allow-list itself stays unreadable through the API
      EXECUTE format(
        'CREATE POLICY dashboard_user_all ON %I FOR ALL TO authenticated '
        'USING (is_dashboard_user()) WITH CHECK (is_dashboard_user())', t);
    END IF;
  END LOOP;
END $$;
