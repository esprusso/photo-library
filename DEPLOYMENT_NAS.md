# NAS Deployment Guide

This guide covers deploying the Photo Library application on Network Attached Storage (NAS) devices like Synology, QNAP, etc.

## Quick Start

1. **Create a `.env` file** from the example:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** to set your photo library path:
   ```bash
   # Set this to where your photos are stored on the NAS
   LIBRARY_HOST_PATH=/volume1/photos
   
   # This should match the path inside the container
   LIBRARY_PATHS=/library
   ```

3. **Start the application**:
   ```bash
   docker compose up -d
   ```

4. **Access the web interface** at `http://your-nas-ip:8087`

## Important: Original GIF Display

This application serves **original animated GIF files** directly from your NAS for the browse page, not static thumbnails. This ensures you see the full animations while browsing. The original GIF files are served read-only from your mounted photo directory.

## Synology NAS Setup

### Option 1: Using Docker Compose (Recommended)

1. **SSH into your Synology** or use File Station to upload files
2. **Create project directory**:
   ```bash
   mkdir -p /volume1/docker/gif-library
   cd /volume1/docker/gif-library
   ```

3. **Upload/copy** all project files to this directory

4. **Create `.env` file** (replace with your actual photo path):
   ```bash
   LIBRARY_HOST_PATH="/volume1/homes/rheritage/Spicy Gif Library"
   LIBRARY_PATHS="/library"
   DB_URL=postgresql://postgres:GifLib2024!@db:5432/gif_library
   THUMBNAILS_DIR=/data/thumbnails
   DOWNLOADS_DIR=/data/downloads
   ```

5. **Start services**:
   ```bash
   docker compose up -d
   ```

### Option 2: Using Synology Docker GUI

1. **Download images** or build them first with docker compose
2. **Create containers** in Docker GUI with these volume mappings:
   - **Database**: postgres:15
     - Environment: `POSTGRES_DB=gif_library`, `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=GifLib2024!`
   - **Backend**: gif-library-backend:latest
     - Volume: `/volume1/photos` → `/library` (Read-only)
     - Volume: `/volume1/docker/gif-library/data` → `/data`
   - **Frontend**: gif-library-frontend:latest
     - Port: `8087` → `80`

## Path Configuration

### Important Paths to Configure

| Purpose | Host Path (Your NAS) | Container Path | Environment Variable |
|---------|---------------------|----------------|---------------------|
| Photo Library | `/volume1/photos` | `/library` | `LIBRARY_HOST_PATH` |
| App Data | `./data` | `/data` | N/A |
| Thumbnails | `./data/thumbnails` | `/data/thumbnails` | `THUMBNAILS_DIR` |

### Example Configurations

**For Synology DSM 7.x:**
```bash
LIBRARY_HOST_PATH=/volume1/photos
LIBRARY_PATHS=/library
```

**For QNAP:**
```bash
LIBRARY_HOST_PATH=/share/Multimedia/Photos
LIBRARY_PATHS=/library
```

**For Generic Linux NAS:**
```bash
LIBRARY_HOST_PATH=/mnt/storage/photos
LIBRARY_PATHS=/library
```

## Troubleshooting

### Common Issues

1. **"Bind mount failed: path does not exist"**
   - Check that `LIBRARY_HOST_PATH` points to an existing directory
   - Ensure Docker has permission to access the path
   - For Synology: Use paths starting with `/volume1/`, `/volume2/`, etc.

2. **No images found after scanning**
   - Verify your photo files are in the mounted directory
   - Check file permissions (container needs read access)
   - Look at logs: `docker compose logs backend`

3. **Cannot access web interface**
   - Check if port 8087 is available and not blocked by firewall
   - Verify containers are running: `docker compose ps`
   - Check logs: `docker compose logs frontend`

4. **Uploads fail with 413 (Request Entity Too Large)**
   - The frontend container proxies `/api` to the backend via nginx. Make sure the upload size limit is not blocked by any proxy in front of the backend.
   - This repo already sets `client_max_body_size 15M` inside `frontend/nginx.conf` (the app itself enforces 10MB). You must rebuild and restart the `frontend` image for changes to take effect:
     ```bash
     docker compose build frontend && docker compose up -d frontend
     ```
   - If you access the app through Synology’s built‑in Reverse Proxy, it also uses nginx and defaults to ~1MB. You need to raise the limit there too. Options:
     - Easiest: Bypass the Synology reverse proxy and access the app directly on `http://<nas-ip>:8087`.
     - Or, in the Synology Reverse Proxy entry for this app, add a custom nginx snippet that includes:
       ```
       client_max_body_size 15m;
       ```
       Synology GUI does not expose this field directly; consult Synology docs for adding custom nginx directives or edit the reverse‑proxy server block config (changes may be overwritten by DSM updates).
   - After changing nginx config on Synology, reload nginx or reboot the Reverse Proxy service.

### Logs and Debugging

```bash
# View all logs
docker compose logs

# View specific service logs
docker compose logs backend
docker compose logs frontend
docker compose logs db

# Follow logs in real-time
docker compose logs -f backend

## Import Watcher

The backend runs an Import Watcher that periodically scans your library paths (e.g., `/library` and `/clips`) and imports new media automatically.

- Configure via environment variables in your `.env` or compose:
  - `IMPORT_WATCH_ENABLED=true`
  - `IMPORT_WATCH_INTERVAL_SECONDS=60`  # adjust as desired
- Control and check status through the API (via the frontend proxy):
  - `GET http://<nas-ip>:8087/api/watch/status`
  - `POST http://<nas-ip>:8087/api/watch/scan-now`
  - `POST http://<nas-ip>:8087/api/watch/enable` / `disable`

Polling is used instead of filesystem events for reliability on NAS platforms.
```

## Performance Optimization

For NAS deployments, consider these optimizations:

1. **Reduce thumbnail size** for lower-powered NAS:
   ```bash
   THUMBNAIL_SIZE=128
   THUMBNAIL_SCALE=1
   ```

2. **Limit concurrent workers**:
   ```bash
   MAX_WORKERS=1
   THUMBNAIL_BATCH_SIZE=5
   ```

3. **Use SSD cache** if available on your NAS for the `/data` directory

## Security Notes

- The photo library is mounted **read-only** for safety
- Only thumbnails and metadata are stored in the writable `/data` directory
- Consider running behind a reverse proxy for external access
- Change default database password in production

## Backup

Important directories to backup:
- `./data/` - Contains all thumbnails, database, and app data
- `.env` - Contains your configuration

Your original photos are never modified by the application.
