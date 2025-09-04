from fastapi import FastAPI, Depends, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from backend.models import get_db, Base, engine, Image, Tag, Category, Job, SessionLocal
from backend.models.schema_upgrade import ensure_schema
from backend.api import images, tags, categories, jobs
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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers - some with /api prefix, some without for direct access
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])

# Also include without /api prefix for backward compatibility and direct access
app.include_router(images.router, prefix="/images", tags=["images-direct"])
app.include_router(tags.router, prefix="/tags", tags=["tags-direct"])
app.include_router(categories.router, prefix="/categories", tags=["categories-direct"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs-direct"])

# Ensure required directories exist (important for NAS/local)
THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")
DOWNLOADS_DIR = os.getenv("DOWNLOADS_DIR", "/downloads")
MEDIA_DIR = os.getenv("MEDIA_DIR", "/data/media")

os.makedirs(THUMBNAILS_DIR, exist_ok=True)
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

@app.post("/scan")
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
    
    # Fallback to original path with volume mapping
    if not image.path:
        print(f"DEBUG: ❌ No path available for image {image.id}")
        return None
    
    # Check if original path exists as-is (shouldn't in container, but let's check)
    print(f"DEBUG: Checking if original path exists: {image.path}")
    if os.path.exists(image.path):
        print(f"DEBUG: ✅ Using original path (unexpected in container): {image.path}")
        return image.path
    else:
        print(f"DEBUG: ❌ Original path does not exist: {image.path}")
    
    # Check if path needs mapping from host to container
    if image.path.startswith('/volume1/Heritage/AI Art'):
        container_path = image.path.replace('/volume1/Heritage/AI Art', '/library')
        print(f"DEBUG: Trying AI Art mapped path: {container_path}")
        if os.path.exists(container_path):
            print(f"DEBUG: ✅ Using AI Art mapped path: {container_path}")
            return container_path
        else:
            print(f"DEBUG: ❌ AI Art mapped path does not exist: {container_path}")
    elif image.path.startswith('/volume1/Heritage/Photos'):
        container_path = image.path.replace('/volume1/Heritage/Photos', '/library')
        print(f"DEBUG: Trying Heritage Photos mapped path: {container_path}")
        if os.path.exists(container_path):
            print(f"DEBUG: ✅ Using Heritage Photos mapped path: {container_path}")
            return container_path
        else:
            print(f"DEBUG: ❌ Heritage Photos mapped path does not exist: {container_path}")
    
    # Check if path is already using container mount point but doesn't exist
    if image.path.startswith('/library'):
        print(f"DEBUG: Checking container library path: {image.path}")
        if os.path.exists(image.path):
            print(f"DEBUG: ✅ Using existing library path: {image.path}")
            return image.path
        else:
            print(f"DEBUG: ❌ Library path does not exist: {image.path}")
    
    # List what's actually in /library to debug
    try:
        library_contents = os.listdir('/library')[:10]  # First 10 items
        print(f"DEBUG: Contents of /library: {library_contents}")
    except Exception as e:
        print(f"DEBUG: Error listing /library: {e}")
    
    print(f"DEBUG: ❌ No valid path found for image {image.id}")
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
        'tif': 'image/tiff'
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
                "exists": os.path.exists(img.path) if img.path else False
            }
            for img in images
        ]
    }

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
async def get_stats(db: Session = Depends(get_db)):
    """Get library statistics"""
    total_images = db.query(Image).count()
    total_tags = db.query(Tag).count()
    total_categories = db.query(Category).count()
    favorites = db.query(Image).filter(Image.favorite == True).count()
    
    return {
        "total_images": total_images,
        "total_tags": total_tags,
        "total_categories": total_categories,
        "favorites": favorites
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
