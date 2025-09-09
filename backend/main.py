from fastapi import FastAPI, Depends, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from backend.models import get_db, Base, engine, Image, Tag, Category, Job, SessionLocal
from sqlalchemy import or_ as sa_or
from backend.models.schema_upgrade import ensure_schema
from backend.api import images, tags, categories, jobs
from backend.api import watch as watch_api
from backend.services.image_scanner import ImageScanner
from backend.services.thumbnail_generator import ThumbnailGenerator
from backend.services.media_manager import MediaManager
from PIL import ImageFile

# Support HEIC/HEIF if pillow-heif is installed
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

# Allow truncated images to load rather than fail
ImageFile.LOAD_TRUNCATED_IMAGES = True

# Create/upgrade tables
Base.metadata.create_all(bind=engine)
ensure_schema(engine)

app = FastAPI(
    title="AI Image Library API",
    description="API for managing AI-generated image collections",
    version="1.0.0"
)

# Test endpoint right after app creation
@app.get("/api/early-test")
async def early_test_endpoint():
    return {"message": "Early test - app created successfully", "timestamp": "2025-01-07"}

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers with /api prefix only to avoid conflicts  
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(watch_api.router, prefix="/api/watch", tags=["watch"])

# Ensure required directories exist (important for NAS/local)
THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")
DOWNLOADS_DIR = os.getenv("DOWNLOADS_DIR", "/downloads")
MEDIA_DIR = os.getenv("MEDIA_DIR", "/data/media")

os.makedirs(THUMBNAILS_DIR, exist_ok=True)
os.makedirs(os.path.join(THUMBNAILS_DIR, "previews"), exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(MEDIA_DIR, exist_ok=True)

# Static file serving
app.mount("/thumbnails", StaticFiles(directory=THUMBNAILS_DIR), name="thumbnails")
app.mount("/download", StaticFiles(directory=DOWNLOADS_DIR), name="download")
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")

@app.get("/")
async def root():
    return {"message": "AI Image Library API", "version": "1.0.0"}

@app.get("/debug/simple")
async def debug_simple():
    """Simple debug endpoint to test basic functionality"""
    import os
    return {
        "status": "working",
        "library_paths_env": os.getenv('LIBRARY_PATHS', 'NOT_SET'),
        "library_exists": os.path.exists('/library'),
        "library_is_dir": os.path.isdir('/library') if os.path.exists('/library') else False
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/api/health")
async def api_health_check():
    return {"status": "healthy"}

@app.get("/api/test")
async def test_endpoint():
    return {"message": "API routes are working", "timestamp": "2025-01-07"}

# Start ImportWatcher on startup
from backend.services.import_watcher import get_import_watcher

@app.on_event("startup")
async def _start_import_watcher():
    try:
        iw = get_import_watcher()
        iw.start()
        print(f"ImportWatcher started with status: {iw.status()}")
    except Exception as e:
        print(f"Failed to start ImportWatcher: {e}")

@app.post("/scan")
async def scan_library_root(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Root-level scan endpoint for backwards compatibility"""
    scanner = ImageScanner()
    def _run_scan():
        session = SessionLocal()
        try:
            scanner.scan_library(session)
        finally:
            session.close()
    background_tasks.add_task(_run_scan)
    return {"message": "Library scan started"}

@app.post("/api/scan")
async def scan_library(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Trigger a library scan to index new images"""
    scanner = ImageScanner()

    # Use a fresh DB session in background to avoid closed-session issues
    def _run_scan():
        session = SessionLocal()
        try:
            scanner.scan_library(session)
        finally:
            session.close()

    background_tasks.add_task(_run_scan)
    return {"message": "Library scan started"}

@app.post("/create-media-copies")
async def create_media_copies(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Create local media copies for all images that don't have them"""
    media_manager = MediaManager(MEDIA_DIR)
    
    def _create_media_copies():
        session = SessionLocal()
        try:
            # Find images without local copies
            images_without_copies = session.query(Image).filter(Image.local_path.is_(None)).all()
            print(f"DEBUG: Found {len(images_without_copies)} images without local copies")
            
            success_count = 0
            for image in images_without_copies:
                if media_manager.update_image_local_path(session, image):
                    success_count += 1
                    print(f"DEBUG: Created local copy for image {image.id}: {image.filename}")
                else:
                    print(f"DEBUG: Failed to create local copy for image {image.id}: {image.filename}")
            
            print(f"DEBUG: Successfully created {success_count} local media copies")
        finally:
            session.close()
    
    background_tasks.add_task(_create_media_copies)
    return {"message": "Media copy creation started"}

def _get_image_serving_path(image: Image) -> Optional[str]:
    """Get the best path to serve an image (prefer local copy, fallback to original)"""
    print(f"DEBUG: ============ Resolving path for image {image.id} ============")
    print(f"DEBUG: Original stored path: {image.path}")
    print(f"DEBUG: Local path: {image.local_path}")
    
    # First try local media copy
    if image.local_path and os.path.exists(image.local_path):
        print(f"DEBUG: ✅ Using local media copy: {image.local_path}")
        return image.local_path
    
    # Fallback to original path
    if not image.path:
        print(f"DEBUG: ❌ No path available for image {image.id}")
        return None
    
    # Since paths are already stored as container paths (/library/... or /clips/...),
    # check if the file exists directly
    if os.path.exists(image.path):
        print(f"DEBUG: ✅ Using stored path: {image.path}")
        return image.path
    
    # If stored path doesn't exist, try path mapping for legacy data
    if image.path.startswith('/volume1/homes/rheritage/Spicy Gif Library'):
        container_path = image.path.replace('/volume1/homes/rheritage/Spicy Gif Library', '/library')
        print(f"DEBUG: Trying mapped Gif Library path: {container_path}")
        if os.path.exists(container_path):
            print(f"DEBUG: ✅ Using mapped Gif Library path: {container_path}")
            return container_path
    elif image.path.startswith('/volume1/homes/rheritage/Spicy Clip Library'):
        container_path = image.path.replace('/volume1/homes/rheritage/Spicy Clip Library', '/clips')
        print(f"DEBUG: Trying mapped Clip Library path: {container_path}")
        if os.path.exists(container_path):
            print(f"DEBUG: ✅ Using mapped Clip Library path: {container_path}")
            return container_path
    
    print(f"DEBUG: ❌ No valid path found for image {image.id}: {image.path}")
    return None

def _get_media_type(filename: str) -> str:
    """Get appropriate media type based on file extension"""
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    media_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg', 
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'tiff': 'image/tiff',
        'tif': 'image/tiff',
        # Common video formats
        'webm': 'video/webm',
        'mp4': 'video/mp4',
        'm4v': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo'
    }
    return media_types.get(ext, 'application/octet-stream')

@app.get("/image-file/{image_id}")
async def serve_image_file(image_id: int, download: bool = False, db: Session = Depends(get_db)):
    """Serve the original image file"""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        print(f"DEBUG: Image {image_id} not found in database")
        raise HTTPException(status_code=404, detail="Image not found")
    
    print(f"DEBUG: Found image {image_id}: {image.filename}")
    print(f"DEBUG: Original path: {image.path}")
    print(f"DEBUG: Local path: {image.local_path}")
    
    # Get the best serving path (prefer local copy)
    serving_path = _get_image_serving_path(image)
    if not serving_path:
        print(f"DEBUG: No accessible path found for image {image_id}")
        raise HTTPException(status_code=404, detail="Image file not found")
    
    print(f"DEBUG: Serving from: {serving_path}")
    file_size = os.path.getsize(serving_path)
    print(f"DEBUG: File size: {file_size} bytes")
    
    # Set appropriate headers and media type
    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{image.filename}"'
        media_type = "application/octet-stream"
        print(f"DEBUG: Setting download headers for {image.filename}")
    else:
        media_type = _get_media_type(image.filename)
        print(f"DEBUG: Using media type: {media_type}")
    
    print(f"DEBUG: Serving file: {serving_path}")
    return FileResponse(
        serving_path,
        headers=headers,
        media_type=media_type
    )

@app.get("/{image_id}.{ext:path}")
async def serve_image_by_filename(image_id: int, ext: str, db: Session = Depends(get_db)):
    """Serve image by ID with file extension (for direct filename requests)"""
    print(f"DEBUG: Route called with image_id={image_id}, ext={ext}")
    
    # Validate that image_id is numeric and ext is a valid image extension
    valid_extensions = {'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'}
    if ext.lower() not in valid_extensions:
        print(f"DEBUG: Invalid extension '{ext}'")
        raise HTTPException(status_code=404, detail="Invalid image format")
    
    # Check if it's a thumbnail request first
    thumbnail_path = os.path.join(THUMBNAILS_DIR, f"{image_id}.jpg")
    print(f"DEBUG: Checking thumbnail path: {thumbnail_path}")
    if os.path.exists(thumbnail_path):
        print(f"DEBUG: Found thumbnail, serving: {thumbnail_path}")
        return FileResponse(thumbnail_path, media_type="image/jpeg")
    
    # Otherwise serve original image
    print(f"DEBUG: Looking up image with ID {image_id} in database")
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        print(f"DEBUG: No image found in database with ID {image_id}")
        raise HTTPException(status_code=404, detail="Image not found")
    
    print(f"DEBUG: Found image in database: {image.path}")
    print(f"DEBUG: Local path: {image.local_path}")
    
    # Get the best serving path (prefer local copy)
    serving_path = _get_image_serving_path(image)
    if not serving_path:
        print(f"DEBUG: No accessible path found for image {image_id}")
        raise HTTPException(status_code=404, detail="Image file not found")
    
    print(f"DEBUG: Serving from: {serving_path}")
    media_type = _get_media_type(image.filename)
    print(f"DEBUG: Serving image file: {serving_path} with media type: {media_type}")
    return FileResponse(serving_path, media_type=media_type)

@app.get("/debug/images")
async def debug_images(db: Session = Depends(get_db)):
    """Debug endpoint to check image IDs and paths in database"""
    images = db.query(Image).order_by(Image.id.desc()).limit(10).all()
    return {
        "recent_images": [
            {
                "id": img.id,
                "path": img.path,
                "filename": img.filename,
                "exists": os.path.exists(img.path) if img.path else False,
                "thumbnail_path": img.thumbnail_path,
                "thumbnail_paths": img.thumbnail_paths,
                "thumbnail_exists": os.path.exists(os.path.join(THUMBNAILS_DIR, f"{img.id}.jpg"))
            }
            for img in images
        ]
    }

@app.get("/debug/test-image-serving")
async def debug_test_image_serving(db: Session = Depends(get_db)):
    """Test endpoint to verify image serving is working"""
    # Get first image with an existing thumbnail
    image = db.query(Image).first()
    if not image:
        return {"error": "No images in database"}
    
    thumbnail_path = os.path.join(THUMBNAILS_DIR, f"{image.id}.jpg")
    
    result = {
        "image_id": image.id,
        "filename": image.filename,
        "thumbnail_url": f"/thumbnails/{image.id}.jpg",
        "thumbnail_file_exists": os.path.exists(thumbnail_path),
        "thumbnails_dir": THUMBNAILS_DIR,
        "thumbnails_dir_exists": os.path.exists(THUMBNAILS_DIR),
    }
    
    if os.path.exists(thumbnail_path):
        try:
            stat = os.stat(thumbnail_path)
            result["thumbnail_size"] = stat.st_size
        except Exception as e:
            result["thumbnail_stat_error"] = str(e)
    
    return result

@app.get("/debug/simple-stats") 
async def debug_simple_stats(db: Session = Depends(get_db)):
    """Simple stats that should always work"""
    total = db.query(Image).count()
    
    # Get first few filenames to see what we have
    samples = db.query(Image.filename).limit(5).all()
    filenames = [s[0] for s in samples if s[0]]
    
    # Count GIFs specifically
    gif_count = db.query(Image).filter(Image.filename.ilike("%.gif")).count()
    
    return {
        "total_images": total,
        "gif_files": gif_count, 
        "sample_filenames": filenames
    }

@app.get("/debug/clear-database")
async def clear_database(confirm: str = "no", db: Session = Depends(get_db)):
    """Clear all images from database (requires confirmation)"""
    if confirm != "yes":
        return {"error": "Add ?confirm=yes to confirm deletion"}
    
    try:
        # Count images before deletion
        deleted_count = db.query(Image).count()
        
        # Delete relationships first, then images using raw SQL
        from sqlalchemy import text
        
        # Delete image-tag relationships
        db.execute(text("DELETE FROM image_tags"))
        
        # Delete image-category relationships  
        db.execute(text("DELETE FROM image_categories"))
        
        # Now delete all images
        db.query(Image).delete()
        
        db.commit()
        
        return {
            "message": f"Successfully cleared {deleted_count} images from database",
            "note": "Run a fresh scan to re-index your GIF library"
        }
    except Exception as e:
        db.rollback()
        return {"error": str(e)}

@app.get("/debug/kill-running-jobs")
async def kill_running_jobs(db: Session = Depends(get_db)):
    """Kill all running jobs"""
    try:
        from sqlalchemy import text
        
        # Update all running jobs to cancelled
        result = db.execute(text("UPDATE jobs SET status = 'cancelled' WHERE status = 'running'"))
        cancelled_count = result.rowcount
        
        db.commit()
        
        return {
            "message": f"Cancelled {cancelled_count} running jobs",
            "note": "You can now start a fresh scan"
        }
    except Exception as e:
        db.rollback()
        return {"error": str(e)}

@app.get("/debug/thumbnails")
async def debug_thumbnails(db: Session = Depends(get_db)):
    """Debug endpoint to check thumbnail generation and serving"""
    thumbnails_dir = os.getenv("THUMBNAILS_DIR", "/thumbnails")
    image_sample = db.query(Image).limit(10).all()
    
    result = {
        "thumbnails_dir": thumbnails_dir,
        "thumbnails_dir_exists": os.path.exists(thumbnails_dir),
        "thumbnails_dir_writable": os.access(thumbnails_dir, os.W_OK) if os.path.exists(thumbnails_dir) else False,
        "sample_thumbnails": []
    }
    
    if os.path.exists(thumbnails_dir):
        try:
            thumbnail_files = os.listdir(thumbnails_dir)
            result["total_thumbnail_files"] = len([f for f in thumbnail_files if f.endswith('.jpg')])
            result["thumbnail_files_sample"] = thumbnail_files[:10]
        except Exception as e:
            result["thumbnail_files_error"] = str(e)
    
    for img in image_sample:
        expected_path = os.path.join(thumbnails_dir, f"{img.id}.jpg")
        thumbnail_info = {
            "image_id": img.id,
            "filename": img.filename,
            "expected_thumbnail_path": expected_path,
            "thumbnail_exists": os.path.exists(expected_path),
            "thumbnail_url": f"/thumbnails/{img.id}.jpg",
            "original_path": img.path,
            "original_exists": os.path.exists(img.path) if img.path else False
        }
        
        if os.path.exists(expected_path):
            try:
                stat = os.stat(expected_path)
                thumbnail_info["thumbnail_size"] = stat.st_size
                thumbnail_info["thumbnail_modified"] = stat.st_mtime
            except Exception as e:
                thumbnail_info["thumbnail_stat_error"] = str(e)
        
        result["sample_thumbnails"].append(thumbnail_info)
    
    return result

@app.get("/debug/filesystem")
async def debug_filesystem():
    """Debug endpoint to check if library directory is mounted and has files"""
    result = {
        "environment": {
            "LIBRARY_PATHS": os.getenv('LIBRARY_PATHS', 'not set'),
            "THUMBNAILS_DIR": os.getenv('THUMBNAILS_DIR', 'not set'),
            "DOWNLOADS_DIR": os.getenv('DOWNLOADS_DIR', 'not set'),
        },
        "root_directory": {
            "contents": []
        },
        "library_paths": {}
    }
    
    # Check what's in the root directory
    try:
        root_contents = os.listdir('/')
        result["root_directory"]["contents"] = root_contents
    except Exception as e:
        result["root_directory"]["error"] = str(e)
    
    # Check each library path
    library_paths_str = os.getenv('LIBRARY_PATHS', '/library')
    library_paths = [path.strip() for path in library_paths_str.split(',')]
    
    for library_path in library_paths:
        path_info = {
            "exists": os.path.exists(library_path),
            "is_dir": os.path.isdir(library_path) if os.path.exists(library_path) else False,
            "files": [],
            "subdirs": []
        }
        
        if os.path.exists(library_path):
            try:
                if os.path.isdir(library_path):
                    contents = os.listdir(library_path)
                    path_info["total_items"] = len(contents)
                    
                    # List subdirectories
                    for item in contents:
                        item_path = os.path.join(library_path, item)
                        if os.path.isdir(item_path):
                            path_info["subdirs"].append(item)
                    
                    # Get first 10 image files
                    image_count = 0
                    for root, dirs, files in os.walk(library_path):
                        for file in files:
                            if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp')):
                                path_info["files"].append({
                                    "path": os.path.join(root, file),
                                    "filename": file,
                                    "size": os.path.getsize(os.path.join(root, file))
                                })
                                image_count += 1
                                if image_count >= 10:
                                    break
                        if image_count >= 10:
                            break
                else:
                    path_info["error"] = "Path exists but is not a directory"
            except Exception as e:
                path_info["error"] = str(e)
        
        result["library_paths"][library_path] = path_info
    
    return result

@app.get("/stats")
async def get_stats_root(db: Session = Depends(get_db)):
    """Get library statistics - root level (safe during migrations)"""
    from sqlalchemy import text
    total_images = db.query(Image).count()
    total_tags = db.query(Tag).count()
    try:
        total_categories = db.execute(text("SELECT COUNT(*) FROM categories")).scalar() or 0
    except Exception:
        total_categories = 0
    favorites = db.query(Image).filter(Image.favorite == True).count()
    # Breakdown by media
    gifs = db.query(Image).filter(Image.filename.ilike('%.gif')).count()
    videos = db.query(Image).filter(sa_or(
        Image.filename.ilike('%.mp4'),
        Image.filename.ilike('%.webm'),
        Image.filename.ilike('%.mov'),
        Image.filename.ilike('%.avi'),
        Image.filename.ilike('%.m4v')
    )).count()
    return {
        "total_images": total_images,
        "total_tags": total_tags,
        "total_categories": total_categories,
        "favorites": favorites,
        "gifs": gifs,
        "videos": videos
    }

@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get library statistics"""
    from sqlalchemy import text
    total_images = db.query(Image).count()
    total_tags = db.query(Tag).count()
    # Use raw SQL to avoid mapper selecting non-existent columns during migrations
    try:
        total_categories = db.execute(text("SELECT COUNT(*) FROM categories")).scalar() or 0
    except Exception:
        total_categories = 0
    favorites = db.query(Image).filter(Image.favorite == True).count()
    gifs = db.query(Image).filter(Image.filename.ilike('%.gif')).count()
    videos = db.query(Image).filter(sa_or(
        Image.filename.ilike('%.mp4'),
        Image.filename.ilike('%.webm'),
        Image.filename.ilike('%.mov'),
        Image.filename.ilike('%.avi'),
        Image.filename.ilike('%.m4v')
    )).count()
    
    return {
        "total_images": total_images,
        "total_tags": total_tags,
        "total_categories": total_categories,
        "favorites": favorites,
        "gifs": gifs,
        "videos": videos
    }

@app.get("/debug/file-formats")
async def debug_file_formats(db: Session = Depends(get_db)):
    """Get file format statistics to understand what's in the library"""
    try:
        # Get basic counts first
        total_count = db.query(Image).count()
        
        # Get a sample of filenames to see what we're dealing with
        sample_images = db.query(Image.filename).limit(10).all()
        sample_filenames = [img[0] for img in sample_images if img[0]]
        
        # Count files by extension manually
        all_images = db.query(Image.filename).filter(Image.filename.isnot(None)).all()
        
        extension_counts = {}
        for img in all_images:
            filename = img[0]
            if '.' in filename:
                ext = filename.lower().split('.')[-1]
                extension_counts[ext] = extension_counts.get(ext, 0) + 1
        
        # Categorize extensions
        animated_extensions = {'gif', 'mp4', 'webm', 'mov', 'avi'}
        static_extensions = {'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif'}
        
        formats = []
        animated_files = 0
        
        for ext, count in sorted(extension_counts.items(), key=lambda x: x[1], reverse=True):
            is_animated = ext in animated_extensions
            is_static = ext in static_extensions
            
            formats.append({
                "extension": ext,
                "count": count,
                "is_animated": is_animated,
                "is_static": is_static
            })
            
            if is_animated:
                animated_files += count
        
        # Test the actual filter
        static_excluded_count = db.query(Image).filter(
            ~Image.filename.ilike("%.jpg"),
            ~Image.filename.ilike("%.jpeg"),
            ~Image.filename.ilike("%.png"),
            ~Image.filename.ilike("%.webp"),
            ~Image.filename.ilike("%.bmp"),
            ~Image.filename.ilike("%.tiff"),
            ~Image.filename.ilike("%.tif")
        ).count()
        
        return {
            "total_files": total_count,
            "animated_files": animated_files,
            "static_files": total_count - animated_files,
            "files_after_static_filter": static_excluded_count,
            "sample_filenames": sample_filenames,
            "formats": formats
        }
        
    except Exception as e:
        print(f"Error in debug_file_formats: {e}")
        return {
            "error": str(e),
            "total_files": 0,
            "animated_files": 0,
            "static_files": 0,
            "files_after_static_filter": 0,
            "formats": []
        }

@app.get("/media-stats")
async def get_media_stats(db: Session = Depends(get_db)):
    """Get media management statistics"""
    media_manager = MediaManager(MEDIA_DIR)
    
    total_images = db.query(Image).count()
    images_with_copies = db.query(Image).filter(Image.local_path.isnot(None)).count()
    
    media_stats = media_manager.get_media_stats()
    
    return {
        "total_images": total_images,
        "images_with_local_copies": images_with_copies,
        "images_without_local_copies": total_images - images_with_copies,
        "media_directory": media_stats
    }

# Align frontend expectation: expose the same file format stats under /api/debug/file-formats
@app.get("/api/debug/file-formats")
async def api_debug_file_formats(db: Session = Depends(get_db)):
    return await debug_file_formats(db)
