from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload, defer
from sqlalchemy import or_, and_, desc, asc, func
from typing import List, Optional, Dict
from pydantic import BaseModel
import os
import zipfile
import tempfile
from datetime import datetime
import os
import shutil

from backend.models import get_db, Image, Tag, Category, SessionLocal, engine, DuplicateIgnore
from backend.models.image import image_categories
from backend.services.enhanced_thumbnail_generator import EnhancedThumbnailGenerator
from backend.services.thumbnail_generator import ThumbnailGenerator
from backend.services.phash import phash_from_path, hamming_distance_hex, prefix
from backend.services.blacklist import (
    resolve_original_path,
    add_blacklist_entry,
)

router = APIRouter()

class ImageResponse(BaseModel):
    id: int
    path: str
    filename: str
    file_size: Optional[int]
    width: Optional[int]
    height: Optional[int]
    aspect_ratio: Optional[float]
    format: Optional[str]
    prompt: Optional[str]
    negative_prompt: Optional[str]
    model_name: Optional[str]
    model_hash: Optional[str]
    seed: Optional[str]
    steps: Optional[int]
    cfg_scale: Optional[float]
    sampler: Optional[str]
    favorite: bool
    rating: int
    created_at: Optional[str]
    modified_at: Optional[str]
    indexed_at: Optional[str]
    date_taken: Optional[str]
    thumbnail_path: str
    # Enriched fields for responsive UI (optional)
    thumbnail_paths: Optional[dict] = None
    animated_preview_paths: Optional[dict] = None
    is_animated: Optional[bool] = None
    tags: List[str]
    categories: List[str]

class ImageFilter(BaseModel):
    query: Optional[str] = None
    tags: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    favorite: Optional[bool] = None
    model_name: Optional[str] = None
    min_width: Optional[int] = None
    max_width: Optional[int] = None
    min_height: Optional[int] = None
    max_height: Optional[int] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None

@router.get("/random", response_model=ImageResponse)
async def get_random_image(db: Session = Depends(get_db)):
    """Return a random image from the library"""
    image = db.query(Image).order_by(func.random()).limit(1).first()
    if not image:
        raise HTTPException(status_code=404, detail="No images available")
    return ImageResponse(**image.to_dict())




@router.delete("/{image_id}")
async def delete_image(
    image_id: int,
    delete_original: bool = Query(False, description="Deprecated; originals are never deleted"),
    blacklist: bool = Query(True, description="Add to blacklist to prevent re-import on future scans"),
    db: Session = Depends(get_db)
):
    """Delete an image from the library.
    - Removes DB record and thumbnail.
    - Removes local media copy when present.
    - Originals on NAS are never deleted (delete_original is ignored).
    """
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")
    MEDIA_DIR = os.getenv("MEDIA_DIR", "/data/media")

    result = {
        "id": image_id,
        "deleted_thumbnail": False,
        "deleted_local_copy": False,
        "deleted_original": False,
    }

    # Remove thumbnail
    try:
        thumb_path = os.path.join(THUMBNAILS_DIR, f"{image_id}.jpg")
        if os.path.exists(thumb_path):
            os.remove(thumb_path)
            result["deleted_thumbnail"] = True
    except Exception:
        pass

    # Remove local media copy (only if under MEDIA_DIR)
    try:
        if image.local_path and os.path.exists(image.local_path):
            # Safety: ensure we only delete inside MEDIA_DIR
            try:
                if os.path.commonpath([os.path.abspath(image.local_path), os.path.abspath(MEDIA_DIR)]) == os.path.abspath(MEDIA_DIR):
                    os.remove(image.local_path)
                    result["deleted_local_copy"] = True
            except Exception:
                pass
    except Exception:
        pass

    # Never delete the original file; keep result as False
    result["deleted_original"] = False

    # Optionally add to blacklist before deletion
    if blacklist:
        try:
            add_blacklist_entry(db, image, "manual-delete")
        except Exception:
            pass

    # Clear relationships to avoid orphan links, then delete record
    try:
        image.tags = []
        image.categories = []
        db.delete(image)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete image: {e}")

    return {"message": "Image deleted", **result}

@router.get("/", response_model=List[ImageResponse])
async def get_images(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("created_at", pattern="^(created_at|filename|width|height|random)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    query: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    categories: Optional[str] = Query(None),
    favorite: Optional[bool] = Query(None),
    rating: Optional[int] = Query(None),
    model_name: Optional[str] = Query(None),
    file_format: Optional[str] = Query(None),
    exclude_jpg: bool = Query(False),
    exclude_static: bool = Query(False),
    media: Optional[str] = Query(None, description="Filter by media type: 'gif' or 'video' or 'image'"),
    db: Session = Depends(get_db)
):
    """Get paginated list of images with filtering and sorting.
    Optimized to avoid loading relationships in the main query and enrich later.
    """

    # Cap server-side for safety
    page_size = min(page_size, 50)

    try:
        q = db.query(Image)

        # Filters
        if query:
            q = q.filter(
                or_(
                    Image.filename.ilike(f"%{query}%"),
                    Image.prompt.ilike(f"%{query}%"),
                    Image.negative_prompt.ilike(f"%{query}%")
                )
            )

        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                q = q.join(Image.tags).filter(Tag.name.in_(tag_list)).distinct()

        if categories:
            cat_list = [c.strip() for c in categories.split(",") if c.strip()]
            if cat_list:
                q = q.join(Image.categories).filter(Category.name.in_(cat_list)).distinct()

        if favorite is not None:
            q = q.filter(Image.favorite == favorite)

        if rating is not None:
            q = q.filter(Image.rating == rating)

        if model_name:
            q = q.filter(Image.model_name.ilike(f"%{model_name}%"))

        if file_format:
            q = q.filter(Image.filename.ilike(f"%.{file_format}"))

        if exclude_jpg:
            q = q.filter(
                ~Image.filename.ilike("%.jpg"),
                ~Image.filename.ilike("%.jpeg"),
            )

        # Media filters based on extension
        if media:
            m = media.lower()
            if m == 'gif':
                q = q.filter(
                    or_(
                        Image.filename.ilike('%.gif'),
                        Image.filename.ilike('%.webp')
                    )
                )
            elif m == 'video':
                q = q.filter(
                    or_(
                        Image.filename.ilike('%.mp4'),
                        Image.filename.ilike('%.webm'),
                        Image.filename.ilike('%.mov'),
                        Image.filename.ilike('%.avi'),
                        Image.filename.ilike('%.m4v')
                    )
                )
            elif m == 'image':
                q = q.filter(
                    or_(
                        Image.filename.ilike('%.jpg'),
                        Image.filename.ilike('%.jpeg'),
                        Image.filename.ilike('%.png'),
                        Image.filename.ilike('%.webp'),
                        Image.filename.ilike('%.tif'),
                        Image.filename.ilike('%.tiff'),
                        Image.filename.ilike('%.bmp')
                    )
                )
        elif exclude_static:
            # Legacy-style: keep animated/video only
            q = q.filter(
                ~Image.filename.ilike('%.jpg'),
                ~Image.filename.ilike('%.jpeg'),
                ~Image.filename.ilike('%.png'),
                ~Image.filename.ilike('%.webp'),
                ~Image.filename.ilike('%.bmp'),
                ~Image.filename.ilike('%.tiff'),
                ~Image.filename.ilike('%.tif'),
            )

        # Sorting
        if sort_by == 'random':
            q = q.order_by(func.random())
        else:
            sort_col = getattr(Image, sort_by)
            q = q.order_by(desc(sort_col) if sort_order == 'desc' else asc(sort_col))

        # Pagination
        offset = (page - 1) * page_size
        images = q.offset(offset).limit(page_size).all()

        ids = [im.id for im in images]

        # Preload tag names
        image_tags_map = {}
        if ids:
            tag_rows = db.query(Image.id, Tag.name).join(Image.tags).filter(Image.id.in_(ids)).all()
            for img_id, tag_name in tag_rows:
                image_tags_map.setdefault(img_id, []).append(tag_name)

        # Preload category names via association table to avoid relationship loads
        image_categories_map = {}
        if ids:
            cats_query = (
                db.query(image_categories.c.image_id, Category.__table__.c.name)
                .join(Category.__table__, image_categories.c.category_id == Category.__table__.c.id)
                .filter(image_categories.c.image_id.in_(ids))
            )
            for img_id, cat_name in cats_query:
                image_categories_map.setdefault(img_id, []).append(cat_name)

        # Enrichment helpers
        enh = EnhancedThumbnailGenerator()

        results: List[ImageResponse] = []
        for im in images:
            # Compute is_animated from extension (best-effort)
            lower = (im.filename or '').lower()
            is_anim = lower.endswith('.gif')

            payload = {
                "id": im.id,
                "path": im.path,
                "filename": im.filename,
                "file_size": im.file_size,
                "width": im.width,
                "height": im.height,
                "aspect_ratio": im.aspect_ratio,
                "format": im.format,
                "prompt": getattr(im, 'prompt', None),
                "negative_prompt": getattr(im, 'negative_prompt', None),
                "model_name": getattr(im, 'model_name', None),
                "model_hash": getattr(im, 'model_hash', None),
                "seed": getattr(im, 'seed', None),
                "steps": getattr(im, 'steps', None),
                "cfg_scale": getattr(im, 'cfg_scale', None),
                "sampler": getattr(im, 'sampler', None),
                "favorite": im.favorite,
                "rating": im.rating,
                "created_at": im.created_at.isoformat() if im.created_at else None,
                "modified_at": im.modified_at.isoformat() if im.modified_at else None,
                "indexed_at": im.indexed_at.isoformat() if im.indexed_at else None,
                "date_taken": im.date_taken.isoformat() if im.date_taken else None,
                "thumbnail_path": im.thumbnail_path,
                "thumbnail_paths": enh.get_thumbnail_paths(im.id),
                "animated_preview_paths": enh.get_animated_preview_paths(im.id),
                "is_animated": is_anim,
                "tags": image_tags_map.get(im.id, []),
                "categories": image_categories_map.get(im.id, []),
            }
            results.append(ImageResponse(**payload))

        return results

    except Exception as e:
        print(f"Error in get_images: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch images")


@router.get("/{image_id}/thumbnail/{size}")
async def serve_thumbnail(image_id: int, size: int, db: Session = Depends(get_db)):
    """Serve a cached on-demand preview JPEG at the requested size.
    Regenerates if missing or stale compared to the source image.
    """
    # Bound size to reasonable limits
    try:
        size = int(size)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid size")
    size = max(256, min(2048, size))

    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Prefer local copy; else resolve mapped original path
    src_path = None
    try:
        if getattr(image, 'local_path', None) and os.path.exists(image.local_path):
            src_path = image.local_path
    except Exception:
        pass
    if not src_path:
        # Fallback to original path mapping
        src_path = resolve_original_path(image)
    if not src_path or not os.path.exists(src_path):
        raise HTTPException(status_code=404, detail="Source image not accessible")

    PREVIEWS_DIR = os.getenv("PREVIEWS_DIR", "/previews")
    os.makedirs(PREVIEWS_DIR, exist_ok=True)
    preview_filename = f"{image_id}_{size}.jpg"
    preview_path = os.path.join(PREVIEWS_DIR, preview_filename)

    # Check staleness
    try:
        src_mtime = os.path.getmtime(src_path)
        prev_exists = os.path.exists(preview_path)
        prev_mtime = os.path.getmtime(preview_path) if prev_exists else 0
    except Exception:
        src_mtime = 0
        prev_exists = os.path.exists(preview_path)
        prev_mtime = 0

    if (not prev_exists) or (prev_mtime < src_mtime):
        try:
            from PIL import Image as PILImage
            with PILImage.open(src_path) as img:
                # Convert to RGB for consistent JPEG output
                if img.mode in ('RGBA', 'LA', 'P'):
                    if img.mode == 'RGBA':
                        background = PILImage.new('RGB', img.size, (255, 255, 255))
                        background.paste(img, mask=img.split()[-1])
                        img = background
                    else:
                        img = img.convert('RGB')

                # Resize preserving aspect ratio
                img.thumbnail((size, size), PILImage.Resampling.LANCZOS)
                img.save(preview_path, 'JPEG', quality=85, optimize=True)
        except Exception as e:
            # Fallback to basic thumbnail if present
            thumb_path = os.path.join(os.getenv('THUMBNAILS_DIR', '/thumbnails'), f"{image_id}.jpg")
            if os.path.exists(thumb_path):
                return FileResponse(thumb_path, media_type='image/jpeg')
            raise HTTPException(status_code=500, detail=f"Failed to generate preview: {e}")

    return FileResponse(preview_path, media_type='image/jpeg')


# -------- Exact duplicates (filename + file_size) --------
from pydantic import Field

class DuplicateGroupItem(BaseModel):
    id: int
    filename: str
    file_size: Optional[int]
    thumbnail_path: str
    width: Optional[int] = None
    height: Optional[int] = None
    created_at: Optional[str] = None

class DuplicateGroupResponse(BaseModel):
    key: str
    count: int
    items: List[DuplicateGroupItem]

class MergeExactRequest(BaseModel):
    keep_id: int
    remove_ids: List[int] = Field(..., min_items=1)

@router.get("/duplicates-exact", response_model=List[DuplicateGroupResponse])
async def get_exact_duplicates(
    media: str = Query('image', description="Filter media: gif|video|image"),
    group_by: str = Query('filename_size', description="Grouping strategy: filename_size"),
    db: Session = Depends(get_db)
):
    try:
        q = db.query(Image)
        m = (media or '').lower()
        if m == 'gif':
            q = q.filter(or_(Image.filename.ilike('%.gif'), Image.filename.ilike('%.webp')))
        elif m == 'video':
            q = q.filter(or_(
                Image.filename.ilike('%.mp4'),
                Image.filename.ilike('%.webm'),
                Image.filename.ilike('%.mov'),
                Image.filename.ilike('%.avi'),
                Image.filename.ilike('%.m4v')
            ))
        elif m == 'image':
            q = q.filter(or_(
                Image.filename.ilike('%.jpg'),
                Image.filename.ilike('%.jpeg'),
                Image.filename.ilike('%.png'),
                Image.filename.ilike('%.webp'),
                Image.filename.ilike('%.tif'),
                Image.filename.ilike('%.tiff'),
                Image.filename.ilike('%.bmp')
            ))

        images = q.all()
        groups: Dict[str, List[Image]] = {}
        for img in images:
            if group_by == 'filename_size':
                key = f"{(img.filename or '').lower()}::{img.file_size or 0}"
            else:
                key = (img.filename or '').lower()
            groups.setdefault(key, []).append(img)

        result: List[DuplicateGroupResponse] = []
        for key, items in groups.items():
            if len(items) <= 1:
                continue
            result.append(DuplicateGroupResponse(
                key=key,
                count=len(items),
                items=[DuplicateGroupItem(
                    id=i.id,
                    filename=i.filename,
                    file_size=i.file_size,
                    thumbnail_path=i.thumbnail_path,
                    width=i.width,
                    height=i.height,
                    created_at=i.created_at.isoformat() if getattr(i, 'created_at', None) else None
                ) for i in items]
            ))

        result.sort(key=lambda g: g.count, reverse=True)
        return result
    except Exception as e:
        print(f"Error in get_exact_duplicates: {e}")
        raise HTTPException(status_code=500, detail="Failed to find exact duplicates")


@router.post("/duplicates-exact/merge")
async def merge_exact_duplicates(body: MergeExactRequest, db: Session = Depends(get_db)):
    """Wrapper around merge-delete to support exact duplicates UI."""
    # Delegate to the existing merge-delete endpoint implementation
    req = MergeDeleteRequest(keeper_id=body.keep_id, duplicate_ids=body.remove_ids)
    return await merge_and_delete_duplicates(req, db)


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a small image and add it to the library (for use as category covers, etc.).

    - Streams content to disk under MEDIA_DIR/uploads/covers (default /data/media/uploads/covers)
    - Validates MIME and size (10MB app limit)
    - Creates an Image row and generates a thumbnail
    - Returns the created image payload
    """
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    CHUNK_SIZE = 1024 * 1024  # 1MB

    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.")

    MEDIA_DIR = os.getenv("MEDIA_DIR", "/data/media")
    upload_dir = os.path.join(MEDIA_DIR, "uploads", "covers")
    os.makedirs(upload_dir, exist_ok=True)

    # Construct a safe filename
    original_name = file.filename or "upload"
    base, ext = os.path.splitext(original_name)
    ext = (ext or ".jpg").lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        # Normalize unknown to .jpg
        ext = ".jpg"

    import uuid
    safe_name = f"{uuid.uuid4().hex}{ext}"
    out_path = os.path.join(upload_dir, safe_name)

    # Stream to disk with size guard
    total = 0
    try:
        with open(out_path, "wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_FILE_SIZE:
                    try:
                        out.close()
                        os.remove(out_path)
                    except Exception:
                        pass
                    raise HTTPException(status_code=413, detail="File too large (max 10MB)")
                out.write(chunk)
    finally:
        try:
            await file.close()
        except Exception:
            pass

    # Derive basic metadata
    width = None
    height = None
    aspect_ratio = None
    fmt = None
    try:
        from PIL import Image as PILImage
        with PILImage.open(out_path) as im:
            width, height = im.size
            fmt = im.format
            aspect_ratio = (float(width) / float(height)) if (width and height and height != 0) else None
    except Exception:
        pass

    # Create DB row
    img = Image(
        path=out_path,
        local_path=out_path,
        filename=os.path.basename(out_path),
        file_size=os.path.getsize(out_path) if os.path.exists(out_path) else None,
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        format=fmt,
    )
    db.add(img)
    db.commit()
    db.refresh(img)

    # Generate thumbnail best-effort
    try:
        ThumbnailGenerator().generate_single_thumbnail(img, force_regenerate=True)
    except Exception:
        pass

    payload = {
        "id": img.id,
        "path": img.path,
        "filename": img.filename,
        "file_size": img.file_size,
        "width": img.width,
        "height": img.height,
        "aspect_ratio": img.aspect_ratio,
        "format": img.format,
        "prompt": getattr(img, 'prompt', None),
        "negative_prompt": getattr(img, 'negative_prompt', None),
        "model_name": getattr(img, 'model_name', None),
        "model_hash": getattr(img, 'model_hash', None),
        "seed": getattr(img, 'seed', None),
        "steps": getattr(img, 'steps', None),
        "cfg_scale": getattr(img, 'cfg_scale', None),
        "sampler": getattr(img, 'sampler', None),
        "favorite": img.favorite,
        "rating": img.rating,
        "created_at": img.created_at.isoformat() if img.created_at else None,
        "modified_at": img.modified_at.isoformat() if img.modified_at else None,
        "indexed_at": img.indexed_at.isoformat() if img.indexed_at else None,
        "date_taken": img.date_taken.isoformat() if img.date_taken else None,
        "thumbnail_path": img.thumbnail_path,
        "thumbnail_paths": EnhancedThumbnailGenerator().get_thumbnail_paths(img.id),
        "animated_preview_paths": EnhancedThumbnailGenerator().get_animated_preview_paths(img.id),
        "is_animated": (img.filename or '').lower().endswith('.gif'),
        "tags": [],
        "categories": [],
    }
    return payload

@router.get("/memories", response_model=List[ImageResponse])
async def get_memories(
    month: Optional[int] = Query(None, ge=1, le=12),
    day: Optional[int] = Query(None, ge=1, le=31),
    db: Session = Depends(get_db)
):
    """Return images taken on this month/day across previous years (Facebook Memories style).
    Defaults to today's month/day when not provided.
    """
    from datetime import datetime
    today = datetime.now()
    m = month or today.month
    d = day or today.day

    q = db.query(Image).options(
        joinedload(Image.tags),
        joinedload(Image.categories).defer(Category.featured_image_id).defer(Category.featured_image_position)
    ).filter(Image.date_taken.isnot(None))

    dialect = db.bind.dialect.name if db.bind else 'sqlite'
    if dialect == 'postgresql':
        q = q.filter(func.extract('month', Image.date_taken) == m)
        q = q.filter(func.extract('day', Image.date_taken) == d)
    else:
        q = q.filter(func.strftime('%m', Image.date_taken) == f"{m:02d}")
        q = q.filter(func.strftime('%d', Image.date_taken) == f"{d:02d}")

    q = q.order_by(desc(Image.date_taken), desc(Image.id))
    images = q.limit(500).all()

    return [ImageResponse(**img.to_dict()) for img in images]

@router.post("/compute-phash")
async def compute_phash(background_tasks: BackgroundTasks):
    """Start a Job to compute perceptual hashes for images missing one."""
    THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")
    from sqlalchemy import inspect as sa_inspect
    from backend.models import Job
    insp = sa_inspect(engine)
    cols = {c['name'] for c in insp.get_columns('images')}
    if 'phash' not in cols:
        return {"message": "Database not migrated: images.phash column missing.", "job_id": None}

    # Create a Job record
    session = SessionLocal()
    try:
        job = Job(type='phash', parameters={})
        session.add(job)
        session.commit()
        session.refresh(job)
        job_id = job.id
    finally:
        session.close()

    def _run(job_id: int):
        from datetime import datetime
        session = SessionLocal()
        try:
            job = session.query(Job).filter(Job.id == job_id).first()
            if not job:
                return
            job.status = 'running'
            job.started_at = datetime.now()
            session.commit()

            # Fetch items
            missing = session.query(Image).filter((Image.phash.is_(None)) | (Image.phash == '')).all()
            total = len(missing)
            job.total_items = total
            job.processed_items = 0
            session.commit()

            processed = 0
            for image in missing:
                thumb_path = os.path.join(THUMBNAILS_DIR, f"{image.id}.jpg")
                path = thumb_path if os.path.exists(thumb_path) else image.path
                if path and os.path.exists(path):
                    h = phash_from_path(path)
                    if h:
                        image.phash = h
                processed += 1
                if total:
                    job.processed_items = processed
                    job.progress = int(processed * 100 / total)
                if processed % 25 == 0:
                    session.commit()

            # Finalize
            job.processed_items = processed
            job.progress = 100
            job.status = 'completed'
            job.completed_at = datetime.now()
            session.commit()
        except Exception as e:
            try:
                job = session.query(Job).filter(Job.id == job_id).first()
                if job:
                    job.status = 'failed'
                    job.error_message = str(e)
                    session.commit()
            except Exception:
                pass
        finally:
            session.close()

    background_tasks.add_task(_run, job_id)
    return {"message": "Started pHash computation job", "job_id": job_id}
@router.get("/duplicates")
async def get_duplicates(
    threshold: int = Query(6, ge=0, le=128),
    prefix_bits: int = Query(12, ge=4, le=64),
    limit: int = Query(10000, ge=1, le=50000),
    db: Session = Depends(get_db)
):
    """Return clusters of visually similar images using perceptual hashes.
    Uses prefix bucketing to reduce comparisons, then Hamming distance ≤ threshold.
    """
    # Guard if schema not migrated
    from sqlalchemy import inspect as sa_inspect
    inspector = sa_inspect(db.bind)
    cols = {c['name'] for c in inspector.get_columns('images')}
    if 'phash' not in cols:
        return []
    rows = db.query(Image.id, Image.filename, Image.phash).filter(Image.phash.isnot(None)).limit(limit).all()
    # Load ignored pairs
    ignores = db.query(DuplicateIgnore).all()
    ignored_pairs = {(min(x.image_id_a, x.image_id_b), max(x.image_id_a, x.image_id_b)) for x in ignores}
    by_bucket = {}
    for r in rows:
        if not r.phash:
            continue
        p = prefix(r.phash, prefix_bits)
        by_bucket.setdefault(p, []).append(r)

    visited = set()
    clusters = []
    for bucket, items in by_bucket.items():
        n = len(items)
        for i in range(n):
            a = items[i]
            if a.id in visited:
                continue
            cluster_ids = [a.id]
            dists = [0]
            for j in range(i + 1, n):
                b = items[j]
                if b.id in visited:
                    continue
                dist = hamming_distance_hex(a.phash, b.phash)
                if dist <= threshold and (min(a.id, b.id), max(a.id, b.id)) not in ignored_pairs:
                    cluster_ids.append(b.id)
                    dists.append(dist)
                    visited.add(b.id)
            if len(cluster_ids) > 1:
                visited.add(a.id)
                clusters.append({ 'phash': a.phash, 'image_ids': cluster_ids, 'distances': dists })

    clusters.sort(key=lambda c: len(c['image_ids']), reverse=True)
    result = []
    for c in clusters:
        ids = c['image_ids']
        imgs = db.query(Image).filter(Image.id.in_(ids)).all()
        # Ensure images are ordered to match ids so distances align
        img_by_id = {im.id: im for im in imgs}
        ordered_imgs = [img_by_id[i] for i in ids if i in img_by_id]
        result.append({ 'phash': c['phash'], 'images': [img.to_dict() for img in ordered_imgs], 'distances': c['distances'] })
    return result

@router.get("/{image_id}", response_model=ImageResponse)
async def get_image(image_id: int, db: Session = Depends(get_db)):
    """Get single image by ID"""
    image = db.query(Image).options(
        joinedload(Image.tags),
        joinedload(Image.categories).defer(Category.featured_image_id).defer(Category.featured_image_position)
    ).filter(Image.id == image_id).first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return ImageResponse(**image.to_dict())

@router.post("/{image_id}/favorite")
async def toggle_favorite(image_id: int, db: Session = Depends(get_db)):
    """Toggle favorite status of an image"""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image.favorite = not image.favorite
    db.commit()
    
    return {"id": image.id, "favorite": image.favorite}

@router.post("/{image_id}/rating")
async def set_rating(image_id: int, rating: int, db: Session = Depends(get_db)):
    """Set rating for an image (0-5 stars)"""
    if rating < 0 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 0 and 5")
    
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image.rating = rating
    db.commit()
    
    return {"id": image.id, "rating": image.rating}


@router.post("/{image_id}/tags")
async def add_image_tags(
    image_id: int, 
    tag_names: List[str], 
    db: Session = Depends(get_db)
):
    """Add tags to an image"""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    for tag_name in tag_names:
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if not tag:
            tag = Tag(name=tag_name)
            db.add(tag)
        
        if tag not in image.tags:
            image.tags.append(tag)
    
    db.commit()
    return {"message": f"Added {len(tag_names)} tags to image"}

@router.delete("/{image_id}/tags")
async def remove_image_tags(
    image_id: int,
    tag_names: List[str],
    db: Session = Depends(get_db)
):
    """Remove tags from an image"""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    removed_count = 0
    for tag_name in tag_names:
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if tag and tag in image.tags:
            image.tags.remove(tag)
            removed_count += 1
    
    db.commit()
    return {"message": f"Removed {removed_count} tags from image"}

@router.post("/download")
async def download_images(image_ids: List[int], db: Session = Depends(get_db)):
    """Create a ZIP file with selected images"""
    images = db.query(Image).filter(Image.id.in_(image_ids)).all()
    
    if not images:
        raise HTTPException(status_code=404, detail="No images found")
    
    # Ensure downloads directory exists
    downloads_dir = os.getenv("DOWNLOADS_DIR", "/downloads")
    os.makedirs(downloads_dir, exist_ok=True)

    # Create zip file with timestamp
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    zip_name = f"images-{ts}.zip"
    zip_path = os.path.join(downloads_dir, zip_name)

    with zipfile.ZipFile(zip_path, 'w') as zip_file:
        for image in images:
            if os.path.exists(image.path):
                try:
                    zip_file.write(image.path, arcname=image.filename)
                except Exception:
                    # Skip problematic files
                    continue
    
    return {"download_url": f"/download/{zip_name}"}

@router.get("/search/suggestions")
async def get_search_suggestions(
    query: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get search suggestions for autocomplete"""
    suggestions = []
    
    # Tag suggestions
    tags = db.query(Tag).filter(Tag.name.ilike(f"%{query}%")).limit(limit).all()
    for tag in tags:
        suggestions.append({
            "type": "tag",
            "value": tag.name,
            "label": f"Tag: {tag.name}"
        })
    
    # Model name suggestions
    models = db.query(Image.model_name).filter(
        Image.model_name.ilike(f"%{query}%")
    ).distinct().limit(limit).all()
    for model in models:
        if model[0]:
            suggestions.append({
                "type": "model",
                "value": model[0],
                "label": f"Model: {model[0]}"
            })
    
    return suggestions[:limit]

 


class IgnorePairsRequest(BaseModel):
    pairs: List[List[int]]  # [[a,b], ...]

@router.post("/duplicates/ignore")
async def ignore_duplicate_pairs(body: IgnorePairsRequest, db: Session = Depends(get_db)):
    added = 0
    for a, b in body.pairs:
        a1, b1 = (a, b) if a <= b else (b, a)
        exists = db.query(DuplicateIgnore).filter(
            DuplicateIgnore.image_id_a == a1, DuplicateIgnore.image_id_b == b1
        ).first()
        if not exists:
            db.add(DuplicateIgnore(image_id_a=a1, image_id_b=b1))
            added += 1
    db.commit()
    return {"message": f"Ignored {added} pairs"}

@router.get("/duplicates/ignore")
async def list_ignored_pairs(db: Session = Depends(get_db)):
    rows = db.query(DuplicateIgnore).order_by(DuplicateIgnore.created_at.desc()).limit(5000).all()
    return [{"a": r.image_id_a, "b": r.image_id_b, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]

@router.delete("/duplicates/ignore")
async def unignore_duplicate_pairs(body: IgnorePairsRequest, db: Session = Depends(get_db)):
    removed = 0
    for a, b in body.pairs:
        a1, b1 = (a, b) if a <= b else (b, a)
        q = db.query(DuplicateIgnore).filter(
            DuplicateIgnore.image_id_a == a1, DuplicateIgnore.image_id_b == b1
        )
        removed += q.delete()
    db.commit()
    return {"message": f"Removed {removed} ignored pairs"}

class MergeDuplicatesRequest(BaseModel):
    keeper_id: int
    duplicate_ids: List[int]

@router.post("/merge-duplicates")
async def merge_duplicates(body: MergeDuplicatesRequest, db: Session = Depends(get_db)):
    keeper = db.query(Image).filter(Image.id == body.keeper_id).first()
    if not keeper:
        raise HTTPException(status_code=404, detail="Keeper image not found")
    dups = db.query(Image).filter(Image.id.in_(body.duplicate_ids)).all()
    if not dups:
        return {"message": "No duplicates to merge"}
    for dup in dups:
        for t in dup.tags:
            if t not in keeper.tags:
                keeper.tags.append(t)
        for c in dup.categories:
            if c not in keeper.categories:
                keeper.categories.append(c)
        if getattr(dup, 'favorite', False):
            keeper.favorite = True
        try:
            if getattr(dup, 'rating', 0) and (keeper.rating or 0) < dup.rating:
                keeper.rating = dup.rating
        except Exception:
            pass
        if getattr(dup, 'date_taken', None) and not getattr(keeper, 'date_taken', None):
            keeper.date_taken = dup.date_taken
    db.commit()
    return {"message": f"Merged metadata from {len(dups)} images into {keeper.id}"}


class MergeDeleteRequest(BaseModel):
    keeper_id: int
    duplicate_ids: List[int]

@router.post("/duplicates/merge-delete")
async def merge_and_delete_duplicates(body: MergeDeleteRequest, db: Session = Depends(get_db)):
    """Merge metadata into keeper and delete duplicate images (DB rows, thumbnails, local copies).
    - Merges tags/categories/favorite/rating/date_taken from duplicates to keeper.
    - Deletes duplicates' DB rows and thumbnail files; deletes local media copies; originals are never deleted.
    Returns a summary of actions.
    """
    keeper = db.query(Image).filter(Image.id == body.keeper_id).first()
    if not keeper:
        raise HTTPException(status_code=404, detail="Keeper image not found")
    dups = db.query(Image).filter(Image.id.in_(body.duplicate_ids)).all()
    if not dups:
        return {"message": "No duplicates provided", "deleted": 0}

    # Merge metadata (reuse logic from merge_duplicates)
    for dup in dups:
        for t in dup.tags:
            if t not in keeper.tags:
                keeper.tags.append(t)
        for c in dup.categories:
            if c not in keeper.categories:
                keeper.categories.append(c)
        if getattr(dup, 'favorite', False):
            keeper.favorite = True
        try:
            if getattr(dup, 'rating', 0) and (keeper.rating or 0) < dup.rating:
                keeper.rating = dup.rating
        except Exception:
            pass
        if getattr(dup, 'date_taken', None) and not getattr(keeper, 'date_taken', None):
            keeper.date_taken = dup.date_taken

    # Delete duplicates (files + DB rows); never delete originals
    THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")
    MEDIA_DIR = os.getenv("MEDIA_DIR", "/data/media")
    deleted = 0
    failed: List[int] = []

    for dup in dups:
        try:
            # Remove thumbnail
            try:
                thumb_path = os.path.join(THUMBNAILS_DIR, f"{dup.id}.jpg")
                if os.path.exists(thumb_path):
                    os.remove(thumb_path)
            except Exception:
                pass

            # Remove local media copy if under MEDIA_DIR
            try:
                if getattr(dup, 'local_path', None) and os.path.exists(dup.local_path):
                    try:
                        if os.path.commonpath([os.path.abspath(dup.local_path), os.path.abspath(MEDIA_DIR)]) == os.path.abspath(MEDIA_DIR):
                            os.remove(dup.local_path)
                    except Exception:
                        pass
            except Exception:
                pass

            # Do not delete original files

            # Clear relationships and delete DB record
            try:
                add_blacklist_entry(db, dup, f"duplicate of {keeper.id}")
            except Exception:
                # Best-effort; continue with deletion even if blacklist insert fails
                pass
            dup.tags = []
            dup.categories = []
            db.delete(dup)
            deleted += 1
        except Exception:
            failed.append(dup.id)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to finalize merge-delete: {e}")

    return {"message": f"Merged into {keeper.id}, deleted {deleted} duplicates", "deleted": deleted, "failed": failed}


class MergeDeletePairRequest(BaseModel):
    keeper_id: int
    duplicate_id: int

@router.post("/duplicates/merge-delete-pair")
async def merge_and_delete_pair(body: MergeDeletePairRequest, db: Session = Depends(get_db)):
    """Merge metadata from one duplicate into keeper and delete the duplicate. Originals are never deleted."""
    keeper = db.query(Image).filter(Image.id == body.keeper_id).first()
    if not keeper:
        raise HTTPException(status_code=404, detail="Keeper image not found")
    dup = db.query(Image).filter(Image.id == body.duplicate_id).first()
    if not dup:
        return {"message": "Duplicate not found", "deleted": 0}

    # Merge metadata
    for t in dup.tags:
        if t not in keeper.tags:
            keeper.tags.append(t)
    for c in dup.categories:
        if c not in keeper.categories:
            keeper.categories.append(c)
    if getattr(dup, 'favorite', False):
        keeper.favorite = True
    try:
        if getattr(dup, 'rating', 0) and (keeper.rating or 0) < dup.rating:
            keeper.rating = dup.rating
    except Exception:
        pass
    if getattr(dup, 'date_taken', None) and not getattr(keeper, 'date_taken', None):
        keeper.date_taken = dup.date_taken

    # Delete files (thumbnail + local copy) and DB row
    THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")
    MEDIA_DIR = os.getenv("MEDIA_DIR", "/data/media")
    try:
        # Thumbnail
        try:
            thumb_path = os.path.join(THUMBNAILS_DIR, f"{dup.id}.jpg")
            if os.path.exists(thumb_path):
                os.remove(thumb_path)
        except Exception:
            pass
        # Local media copy (only under MEDIA_DIR)
        try:
            if getattr(dup, 'local_path', None) and os.path.exists(dup.local_path):
                try:
                    if os.path.commonpath([os.path.abspath(dup.local_path), os.path.abspath(MEDIA_DIR)]) == os.path.abspath(MEDIA_DIR):
                        os.remove(dup.local_path)
                except Exception:
                    pass
        except Exception:
            pass
        # Never delete original files

        # Add blacklist entry to prevent re-importing this duplicate
        try:
            add_blacklist_entry(db, dup, f"duplicate of {keeper.id}")
        except Exception:
            pass

        dup.tags = []
        dup.categories = []
        db.delete(dup)
        db.commit()
        return {"message": f"Merged into {keeper.id}, deleted 1 duplicate", "deleted": 1, "failed": []}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to merge-delete pair: {e}")


class IgnoreClusterRequest(BaseModel):
    image_ids: List[int]

@router.post("/duplicates/ignore-cluster")
async def ignore_duplicate_cluster(body: IgnoreClusterRequest, db: Session = Depends(get_db)):
    """Ignore all pairwise combinations within a set of image_ids."""
    ids = sorted(set(body.image_ids))
    pairs = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            a1, b1 = (a, b) if a <= b else (b, a)
            exists = db.query(DuplicateIgnore).filter(
                DuplicateIgnore.image_id_a == a1, DuplicateIgnore.image_id_b == b1
            ).first()
            if not exists:
                db.add(DuplicateIgnore(image_id_a=a1, image_id_b=b1))
                pairs.append((a1, b1))
    db.commit()
    return {"message": f"Ignored {len(pairs)} pairs", "count": len(pairs)}
