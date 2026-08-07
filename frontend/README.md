# Knowledge Platform — Frontend

An enterprise-grade React + Vite frontend for the Knowledge Platform backend. No authentication —
this is a single-tenant internal tool that talks straight to your FastAPI service.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # optional — or set the API URL from the in-app Settings page
npm run dev
```

The API base URL defaults to `http://localhost:8000`. Override it via `VITE_API_URL` at build time,
or change it live from **Settings → API endpoint** (stored in `localStorage`, takes effect immediately,
no rebuild needed).

## Pages

- **Overview** — pipeline explainer, connection status, quick actions, recent ingestion jobs.
- **Search & Ask** — one query bar, two modes: hybrid `/search` with the full 7-field metadata filter
  set (department, year, author, language, tags, access_level, file_type), and `/ask` for local RAG
  Q&A with numbered citations. Search history is remembered per browser.
- **Graph Explorer** — force-directed canvas over `/graph/related/{doc_id}` and `/graph/entity/{name}`,
  with a breadcrumb trail of explored seeds, node inspector, and PNG export.
- **Ingestion** — drag-and-drop multi-file upload against `POST /ingest`, live progress, and job-state
  polling against `GET /ingest/status/{job_id}` that survives page reloads (job history is kept in
  `localStorage`).
- **Clusters** — `GET /clusters`, rendered defensively since the exact response shape can vary.
- **Settings** — API endpoint, theme, and local-data controls. No login, no accounts.

## Notes

- Every endpoint and parameter name matches the backend exactly — see `src/lib/api.js` for the single
  source of truth.
- `Cmd/Ctrl + K` opens a command palette for quick navigation or jumping straight into a search.
- Dark and light themes are both fully supported (`Settings → Appearance`, or the topbar toggle).
