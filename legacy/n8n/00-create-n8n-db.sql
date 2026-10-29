-- ─────────────────────────────────────────────────────────
-- Create a SEPARATE database for n8n's internal tables, so the
-- application database (projectdigital) stays clean and only holds
-- our 3 app tables. Runs BEFORE schema.sql (alphabetical order) on
-- first DB boot, against the default POSTGRES_DB connection.
--
-- CREATE DATABASE can't run inside a transaction or IF NOT EXISTS,
-- so we use the psql \gexec trick to create it only when missing.
-- ─────────────────────────────────────────────────────────

SELECT 'CREATE DATABASE n8n'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec
