# Archived: n8n workflows

**Not used any more.** On 2026-10-29 every workflow here was ported to the
Python API in [`backend/`](../../backend). These files are kept for
reference: the original prompts, the per-feature setup notes, and the
history of decisions.

| Here | Now |
|---|---|
| `workflows/*.json` | `backend/app/routers/*.py` + `backend/app/pipeline.py` |
| `exports/*.json` (live exports from the n8n UI) | same |
| `workflows/*.README.md` | `backend/README.md` (setup is now just `.env` + `docker compose up`) |
| `00-create-n8n-db.sql` (created n8n's own database) | not needed |
| `transcript-service/` sidecar (deleted; see git history) | `youtube_transcript()` in `backend/app/routers/tools.py` |

Still useful as plans, not code:
- `workflows/schedule-social.README.md`: Metricool API scheduling (paid tier).
- `workflows/regenerate-caption.README.md`: per-platform caption regeneration.

Your old n8n data stays in the `n8n_data` Docker volume and the `n8n`
database until you remove them (`docker volume rm <project>_n8n_data`).
Nothing reads them any more.
