# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Photo Library is a self-hosted web application for browsing, organizing, and managing your photo collection. Built with Docker Compose, it features a FastAPI backend, React TypeScript frontend, and PostgreSQL database.

## Development Commands

### Docker Development
```bash
# Start all services in development
docker compose up -d

# View logs for specific services
docker compose logs backend
docker compose logs frontend
docker compose logs db

# Rebuild services after code changes
docker compose build backend
docker compose build frontend

# Stop all services
docker compose down
```

### Backend Development (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development (React + TypeScript)
```bash
cd frontend
npm install
npm run dev           # Development server
npm run build         # Production build
npm run type-check    # TypeScript checking
npm run lint          # ESLint checking
```

## Architecture

### Backend Structure (`/backend`)
- `main.py` - FastAPI application entry point with CORS, static file serving
- `models/` - SQLAlchemy database models (Image, Tag, Category, Job)
- `api/` - REST API route handlers organized by resource
- `services/` - Core business logic:
  - `image_scanner.py` - Scans library paths, extracts metadata
  - `metadata_extractor.py` - PNG chunks, EXIF, JSON sidecar parsing
  - `thumbnail_generator.py` - Creates optimized thumbnails
- Database: PostgreSQL with SQLAlchemy ORM, automatic schema migrations

### Frontend Structure (`/frontend`)
- React 18 + TypeScript + Tailwind CSS
- React Query for API state management
- React Router for navigation
- Components: Layout, Sidebar, SearchBar, ImageModal
- Pages: Browse, Tags, Categories, Jobs, Settings, ImageDetail

### Data Model
- **Images**: File paths, camera metadata (EXIF data), tags, favorites
- **Tags**: Global tag system with colors and usage counts
- **Categories**: Named collections for organization
- **Jobs**: Background task tracking (indexing, thumbnails)

## Key Environment Variables

Configure in `.env` file:
- `LIBRARY_PATHS`: Comma-separated photo directory paths (e.g., `/Volumes/Heritage/Photos`)
- `DB_URL`: Database connection (default: PostgreSQL in docker-compose.yml)
- `THUMBNAILS_DIR`: Thumbnail storage location (default: `/data/thumbnails`)
- `DOWNLOADS_DIR`: ZIP export location (default: `/data/downloads`)

## API Endpoints

- Frontend: http://localhost:8080
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

Key routes:
- `GET /images` - List photos with filtering/pagination
- `POST /scan` - Trigger library scan
- `GET /image-file/{id}` - Serve original photo files
- `GET /{id}.{ext}` - Serve photos/thumbnails by ID

## Photo Processing Pipeline

1. **Scanning**: Recursively finds photos in LIBRARY_PATHS
2. **Metadata Extraction**: EXIF data, camera settings, timestamps
3. **Thumbnails**: Generated at 256px (configurable) for fast browsing

## Testing & Development

- Backend tests: Use pytest (setup required)
- Frontend tests: Jest/React Testing Library (setup required)
- Debug endpoints available at `/debug/*` routes
- Use `simple-main.py` and `simple-index.html` for minimal testing

## NAS/Synology Integration

- Photo library mounted read-only to `/library` in container
- Application data (thumbnails, DB) in `/data` volume
- Supports Synology Docker package with volume mapping
- Path translation handles `/Volumes/Heritage/Photos` ↔ `/library` mounting