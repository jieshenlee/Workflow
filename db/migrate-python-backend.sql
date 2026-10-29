-- db/migrate-python-backend.sql
-- One-time switch from n8n to the Python API (backend/).
--
-- Approval gates store the URL the dashboard POSTs to on approve. Gates
-- opened by n8n point at n8n's Wait-node webhooks, which stop existing
-- once n8n is gone. This re-points every still-pending gate at the API,
-- which resumes the job purely from what's in the database, so jobs
-- waiting at a gate carry on where they were.
--
-- If the API isn't on http://localhost:8000 (PUBLIC_API_URL), change the
-- URL below first. Idempotent, and a no-op on a fresh database.
--
-- Apply:
--   Get-Content db\migrate-python-backend.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital

DO $$
BEGIN
  IF to_regclass('public.approval_stages') IS NOT NULL THEN
    UPDATE approval_stages
       SET resume_url = 'http://localhost:8000/api/approvals/' || id || '/resume'
     WHERE status = 'pending';
  END IF;
END $$;
