# Photo Library

A self‑hosted web app to browse, search, tag, categorize, favorite, rate, and download photos stored on local or NAS storage. It is designed for large libraries, extracts camera metadata from EXIF data, and provides fast browsing and organization.

## Highlights

- Browse fast with thumbnails, lazy loading, and a focused photo viewer
- Organize with free‑form tags, color‑coded categories, favorites, and star ratings
- Search and filter by filename, camera metadata, tags, categories, and dimensions
- Background jobs for library indexing and thumbnail generation
- Batch actions for favorite/rate/download/tag; ZIP export of selected photos
- Robust metadata extraction from EXIF data including camera settings and timestamps
- Support for common photo formats including RAW files (CR2, NEF, ARW, DNG)
- NAS‑friendly path mapping and local media copies for reliable serving
- Simple Docker Compose stack (PostgreSQL, FastAPI backend, React frontend)

## Architecture

- Backend: FastAPI + SQLAlchemy
  - Models: `Image`, `Tag`, `Category`, `Job`
  - Services: image scanner, thumbnail generator, metadata extractor, media manager, AI tagger (full + lite)
  - Static mounts: `THUMBNAILS_DIR` → `/thumbnails`, `DOWNLOADS_DIR` → `/download`, `MEDIA_DIR` → `/media`
  - API docs: `http://localhost:8000/docs`
- Frontend: React + TypeScript + Tailwind
  - Pages: Browse, Image Detail, Tags, Categories, Jobs, Settings
  - State/data: React Query; keyboard shortcuts; adjustable grid sizes

## Features

- Library Scanning and Indexing:
  - Recursively scans `LIBRARY_PATHS` for images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.tiff`, `.bmp`)
  - Extracts file info, image dimensions, and AI metadata (PNG chunks, EXIF, sidecars)
  - Auto‑categorizes images based on folder structure; cleans up orphaned DB records

- Metadata Extraction:
  - PNG text chunks, EXIF/IPTC (with `piexif`), JSON/TXT sidecars (Stable Diffusion/ComfyUI)
  - Normalizes fields like `prompt`, `negative_prompt`, `model_name`, `seed`, `steps`, `cfg_scale`, `sampler`
  - HEIC/HEIF supported when `pillow-heif` is available

- Thumbnails:
  - Generates JPEG thumbnails (size configurable via `THUMBNAIL_SIZE`)
  - Robust fallbacks for tricky AI images; optional ffmpeg decoding fallback

- Browsing UI:
  - Responsive grid (small/medium/large), lazy loading, dark mode
  - Image viewer with full‑res file serving, graceful fallback to thumbnail
  - Favorites and 1–5 star ratings; quick toggles in grid and modal

- Organization:
  - Tags: CRUD, color, usage counts, bulk delete, auto‑tagging entry points
  - Categories: CRUD, descriptions, bulk delete, auto‑categorize‑by‑folders

- Search and Filters:
  - Query over filename, prompt, negative prompt
  - Filter by tags, categories, favorite, rating, model name
  - Sort by `created_at`, `filename`, `width`, `height`
  - Autocomplete search suggestions for tags and models

- Batch Operations:
  - Favorite, rate, smart AI tag, and ZIP download of selected images

- AI Auto‑Tagging:
  - Full mode: BLIP‑2 (caption → tags)
  - Lite mode: no heavy models; filename + basic image property analysis
  - Resource‑aware: automatically falls back to lite mode for large files/low resources
  - Endpoints for single image, batch, and “all untagged” with background job tracking

- Media Manager:
  - Creates stable local copies of originals under `MEDIA_DIR` and serves from there when available
  - Helpful with NAS path mapping and permission differences

- Reliability and Ops:
  - Health check (`/health`), debug endpoints (`/debug/*`), library stats (`/stats`, `/media-stats`)
  - Job tracking model with progress, status, parameters, and results
  - Schema auto‑upgrade on startup for backward‑compatible columns

## Quick Start (Docker Compose)

1) Copy and edit environment:

```
cp .env.example .env
# edit LIBRARY_PATHS and (optionally) DB_URL, THUMBNAIL_SIZE, etc.
```

2) Start services:

```
docker-compose up -d
```

3) Open the app:

- Frontend: http://localhost:8080
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs

By default the compose file mounts:

- A read‑only NAS library at `/library` (adjust to your NAS path)
- An app data directory for thumbnails, downloads, and media at `/data`
- Optional: host `ffmpeg` binary inside the backend for fallback decoding

## Configuration

Environment variables (via `.env` or compose `environment`):

- `LIBRARY_PATHS`: Comma‑separated roots to scan (default `/library`).
- `DB_URL`: SQLAlchemy URL; Postgres and SQLite supported (`postgresql://…` or `sqlite:////cache/app.db`).
- `THUMBNAILS_DIR`: Directory for generated thumbnails (default `/thumbnails` in app; compose maps to `/data/thumbnails`).
- `DOWNLOADS_DIR`: Directory for generated ZIPs (default `/downloads`; compose maps to `/data/downloads`).
- `MEDIA_DIR`: Directory for local media copies (default `/data/media`).
- `THUMBNAIL_SIZE`: Max thumbnail dimension in pixels (default `256`).
- `ENABLE_FFMPEG_FALLBACK`: Set to `true` to allow ffmpeg fallback when PIL fails.
- `TZ`: Time zone (e.g., `Etc/UTC`).
- Optional: `SECRET_KEY`, `ALLOWED_HOSTS` for deployments where you add auth/proxy layers.

Notes:
- The backend contains a convenience path mapper from a Synology‑style path (`/volume1/Heritage/AI Art`) to `/library`. Update volume mounts and/or adjust code if your NAS uses different roots.
- When using SQLite (`DB_URL` starts with `sqlite:`), the backend ensures the DB path exists under the container.

## API Overview

Base path: both with and without `/api` prefix for backward compatibility.

- Images (`/api/images`):
  - `GET /` list with pagination, filters, sorting
  - `GET /{id}` detail
  - `POST /{id}/favorite` toggle
  - `POST /{id}/rating?rating=<0..5>` set rating
  - `POST /{id}/tags` add tags; `DELETE /{id}/tags` remove tags
  - `POST /download` ZIP export selected images
  - `GET /search/suggestions?query=…` autocomplete (tags, models)
- Image files and thumbnails:
  - `GET /image-file/{id}` serve original file; `?download=true` to force download
  - `GET /{id}.{ext}` thumbnail if exists, otherwise original (jpg/jpeg/png/webp/gif/bmp/tiff)
  - Static mounts: `/thumbnails`, `/download`, `/media`
- Tags (`/api/tags`): list/create/update/delete, bulk create; AI auto‑tag single/batch/all‑untagged
- Categories (`/api/categories`): list/create/update/delete, bulk delete; add/remove images; auto‑categorize by folders
- Jobs (`/api/jobs`): list, get, start indexing/thumbnailing/tagging, cancel pending
- Library utils: `POST /scan` (scan now), `GET /stats`, `GET /media-stats`, `GET /health`
- Debug: `GET /debug/simple`, `GET /debug/images`, `GET /debug/filesystem`

Explore and try responses at `http://localhost:8000/docs`.

## Data Model

- Images: path, local_path, filename, size, width/height/aspect, format; prompts and generation parameters; favorite/rating; tags and categories; timestamps.
- Tags: name, color; many‑to‑many with images; usage counts exposed in responses.
- Categories: name, description, color; many‑to‑many with images.
- Jobs: type (`indexing`, `thumbnailing`, `tagging`, `ai_tagging`), status, progress, counts, parameters, result, timestamps.
- Schema upgrades run on startup to add new columns idempotently.

## Development

Backend (FastAPI):

```
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend (Vite + React):

```
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` (default Vite dev server) and point the frontend API base (`/api`) at a running backend (proxy via Vite or run both with Docker).

## NAS and File Serving Notes

- Mount your library read‑only into the backend as `/library` (or set your own `LIBRARY_PATHS`).
- Ensure the backend user can read the library and write to the configured `THUMBNAILS_DIR`, `DOWNLOADS_DIR`, and `MEDIA_DIR`.
- The app prefers serving from `local_path` (copied under `MEDIA_DIR`) for reliability; falls back to original path and simple path mapping (`/volume1/…` → `/library`).
- `pillow-heif` enables HEIC/HEIF support; install it or include in your image if your library contains HEIF files.
- To enable ffmpeg fallback decoding for problematic files, bind `ffmpeg` into the backend and set `ENABLE_FFMPEG_FALLBACK=true`.

## Troubleshooting

- No images shown:
  - Verify `LIBRARY_PATHS` mapping and container can see files (`GET /debug/filesystem`).
  - Trigger `POST /scan` or start an indexing job (`POST /api/jobs/indexing`).
- Thumbnails not rendering:
  - Check write access to `THUMBNAILS_DIR` and logs of thumbnail job.
  - Try forcing regeneration via `POST /api/jobs/thumbnails` with `{ force_regenerate: true }`.
- Original file won’t open:
  - Use `GET /image-file/{id}`; ensure NAS mapping and/or create local media copies (`POST /create-media-copies`).
- AI auto‑tagging slow or failing:
  - Lite mode is automatic for large files/low resources; consider using batch endpoints and let it run in the background.

## Contributing

Issues and PRs are welcome. Please open an issue to discuss significant changes first.

## License

MIT

# photo-library
