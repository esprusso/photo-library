from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request, UploadFile, File
from starlette.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, desc, asc, func
from typing import List, Optional
from pydantic import BaseModel, Field, validator
import os
import zipfile
import tempfile
from datetime import datetime
import os
import shutil

from backend.models import get_db, Image, Tag, Category
from backend.models.image import image_tags as image_tags_table
from backend.models.image import image_categories as image_categories_table
from backend.models.image import image_categories

router = APIRouter()

# Model definitions for duplicates
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

class MergeDuplicatesRequest(BaseModel):
    keep_id: int
    remove_ids: List[int] = Field(..., min_items=1)
    delete_originals: bool = False

class ImageIds(BaseModel):
    image_ids: List[int] = Field(..., min_items=1, max_items=100)

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
    thumbnail_path: str
    # Include richer fields used by the frontend
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
async def get_random_image(
    media: Optional[str] = Query(None), 
    unrated: bool = Query(False, description="Only return unrated items (rating = 0)"),
    db: Session = Depends(get_db)
):
    """Return a random image from the library. Optional media filter: gif|video|image. Optional unrated filter."""
    query_obj = db.query(Image)
    
    # Apply rating filter
    if unrated:
        query_obj = query_obj.filter(Image.rating == 0)
    
    # Apply media filter
    if media:
        m = media.lower()
        if m == 'gif':
            query_obj = query_obj.filter(Image.filename.ilike('%.gif'))
        elif m == 'video':
            query_obj = query_obj.filter(or_(
                Image.filename.ilike('%.mp4'),
                Image.filename.ilike('%.webm'),
                Image.filename.ilike('%.mov'),
                Image.filename.ilike('%.avi'),
                Image.filename.ilike('%.m4v')
            ))
        elif m == 'image':
            query_obj = query_obj.filter(or_(
                Image.filename.ilike('%.jpg'),
                Image.filename.ilike('%.jpeg'),
                Image.filename.ilike('%.png'),
                Image.filename.ilike('%.webp'),
                Image.filename.ilike('%.tif'),
                Image.filename.ilike('%.tiff'),
                Image.filename.ilike('%.bmp')
            ))
    
    image = query_obj.order_by(func.random()).limit(1).first()
    if not image:
        filter_desc = "unrated " if unrated else ""
        media_desc = f"{media} " if media else ""
        raise HTTPException(status_code=404, detail=f"No {filter_desc}{media_desc}images available")
    return ImageResponse(**image.to_dict())


def _image_min_dict(image: Image) -> dict:
    return {
        "id": image.id,
        "path": image.path,
        "filename": image.filename,
        "file_size": image.file_size,
        "width": image.width,
        "height": image.height,
        "aspect_ratio": image.aspect_ratio,
        "format": image.format,
        "prompt": image.prompt,
        "negative_prompt": image.negative_prompt,
        "model_name": image.model_name,
        "model_hash": image.model_hash,
        "seed": image.seed,
        "steps": image.steps,
        "cfg_scale": image.cfg_scale,
        "sampler": image.sampler,
        "favorite": image.favorite,
        "rating": image.rating,
        "created_at": image.created_at.isoformat() if image.created_at else None,
        "modified_at": image.modified_at.isoformat() if image.modified_at else None,
        "indexed_at": image.indexed_at.isoformat() if image.indexed_at else None,
        "thumbnail_path": image.thumbnail_path,
        "thumbnail_paths": getattr(image, 'thumbnail_paths', {}),
        "animated_preview_paths": getattr(image, 'animated_preview_paths', {}),
        "is_animated": image.is_animated,
        "tags": [],
        "categories": [],
    }

@router.get("/duplicates", response_model=List[DuplicateGroupResponse])
async def get_duplicates(
    media: str = Query('gif', description="Filter media: gif|video|image"),
    group_by: str = Query('filename_size', description="Grouping strategy: filename_size"),
    db: Session = Depends(get_db)
):
    """Find duplicate GIFs (or other media) grouped by key.
    Default groups by (lowercase filename, file_size) and returns groups with >1.
    """
    try:
        q = db.query(Image)
        m = media.lower()
        if m == 'gif':
            q = q.filter(Image.filename.ilike('%.gif'))
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
        groups = {}
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
        # Sort groups by size desc
        result.sort(key=lambda g: g.count, reverse=True)
        return result
    except Exception as e:
        print(f"Error in get_duplicates: {e}")
        raise HTTPException(status_code=500, detail="Failed to find duplicates")


@router.post("/duplicates/merge")
async def merge_duplicates(body: MergeDuplicatesRequest, db: Session = Depends(get_db)):
    """Merge duplicate images: keep one, remove others.
    - Moves tags and categories from remove_ids to keep_id
    - Deletes thumbnails and image records for remove_ids
    - Does not delete original files unless delete_originals=true
    """
    keep = db.query(Image).filter(Image.id == body.keep_id).first()
    if not keep:
        raise HTTPException(status_code=404, detail="Keep image not found")
    remove_ids = [rid for rid in body.remove_ids if rid != body.keep_id]
    if not remove_ids:
        return {"message": "Nothing to merge"}
    try:
        # Merge tags via association table
        tag_rows = db.query(image_tags_table.c.tag_id).filter(image_tags_table.c.image_id.in_(remove_ids)).distinct().all()
        tag_ids = [r[0] for r in tag_rows]
        for tid in tag_ids:
            # insert keep-tag pair if missing
            db.execute(
                image_tags_table.insert().prefix_with("OR IGNORE"),
                {"image_id": keep.id, "tag_id": tid}
            )
        # Merge categories via association table
        cat_rows = db.query(image_categories_table.c.category_id).filter(image_categories_table.c.image_id.in_(remove_ids)).distinct().all()
        cat_ids = [r[0] for r in cat_rows]
        for cid in cat_ids:
            db.execute(
                image_categories_table.insert().prefix_with("OR IGNORE"),
                {"image_id": keep.id, "category_id": cid}
            )
        db.commit()
    except Exception:
        db.rollback()
        # Fallback: ignore merge errors and continue to deletion
    # Delete removed images
    THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")
    deleted = 0
    for rid in remove_ids:
        img = db.query(Image).filter(Image.id == rid).first()
        if not img:
            continue
        # Remove thumbnail
        try:
            thumb_path = os.path.join(THUMBNAILS_DIR, f"{rid}.jpg")
            if os.path.exists(thumb_path):
                os.remove(thumb_path)
        except Exception:
            pass
        # Optionally delete original file
        if body.delete_originals and img.path and os.path.exists(img.path):
            try:
                os.remove(img.path)
            except Exception:
                pass
        try:
            db.delete(img)
            deleted += 1
        except Exception:
            db.rollback()
    db.commit()
    return {"message": f"Merged {deleted} duplicate(s) into image {keep.id}", "keep_id": keep.id, "deleted": deleted}


def _resolve_original_path(image: Image) -> Optional[str]:
    """Resolve the best guess for the original file path (not local copy).
    Mirrors the mapping used elsewhere: prefer actual path, else map
    '/volume1/homes/rheritage/Spicy Gif Library' => '/library'.
    """
    if image.path and os.path.exists(image.path):
        return image.path
    if image.path and image.path.startswith('/volume1/homes/rheritage/Spicy Gif Library'):
        mapped = image.path.replace('/volume1/homes/rheritage/Spicy Gif Library', '/library')
        if os.path.exists(mapped):
            return mapped
    if image.path and image.path.startswith('/library') and os.path.exists(image.path):
        return image.path
    return None


@router.delete("/{image_id}")
async def delete_image(
    image_id: int,
    delete_original: bool = Query(False, description="Also delete the original file if accessible"),
    db: Session = Depends(get_db)
):
    """Delete an image from the library. Optionally delete original and local copies.
    - Always removes DB record and thumbnail.
    - Removes local media copy when present.
    - If delete_original is true, attempts to delete the original file.
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

    # Optionally delete the original file
    if delete_original:
        try:
            original = _resolve_original_path(image)
            if original and os.path.exists(original):
                os.remove(original)
                result["deleted_original"] = True
        except Exception:
            # ignore failures but report false
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
    page_size: int = Query(50, ge=1, le=100),
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
    """Get paginated list of images with filtering and sorting"""
    
    # Enforce reasonable page size limits to prevent timeouts
    page_size = min(page_size, 50)  # Max 50 items per page
    
    try:
        # Build query without eager loading first (for better performance)
        query_obj = db.query(Image)
        
        # Apply filters
        if query:
            query_obj = query_obj.filter(
                or_(
                    Image.filename.ilike(f"%{query}%"),
                    Image.prompt.ilike(f"%{query}%") if Image.prompt.isnot(None) else False,
                    Image.negative_prompt.ilike(f"%{query}%") if Image.negative_prompt.isnot(None) else False
                )
            )
        
        if tags:
            tag_list = [t.strip() for t in tags.split(",")]
            query_obj = query_obj.join(Image.tags).filter(Tag.name.in_(tag_list)).distinct()
        
        if categories:
            cat_list = [c.strip() for c in categories.split(",")]
            query_obj = query_obj.join(Image.categories).filter(Category.name.in_(cat_list)).distinct()
        
        if favorite is not None:
            query_obj = query_obj.filter(Image.favorite == favorite)
        
        if rating is not None:
            query_obj = query_obj.filter(Image.rating == rating)
        
        if model_name:
            query_obj = query_obj.filter(Image.model_name.ilike(f"%{model_name}%"))
        
        # Filter by file format
        if file_format:
            query_obj = query_obj.filter(Image.filename.ilike(f"%.{file_format}"))
        
        # Exclude JPG files if requested
        if exclude_jpg:
            query_obj = query_obj.filter(
                ~Image.filename.ilike("%.jpg"),
                ~Image.filename.ilike("%.jpeg")
            )
        
        # Media type filters
        if media:
            m = media.lower()
            if m == 'gif':
                query_obj = query_obj.filter(Image.filename.ilike("%.gif"))
            elif m == 'video':
                query_obj = query_obj.filter(
                    or_(
                        Image.filename.ilike("%.mp4"),
                        Image.filename.ilike("%.webm"),
                        Image.filename.ilike("%.mov"),
                        Image.filename.ilike("%.avi"),
                        Image.filename.ilike("%.m4v")
                    )
                )
            elif m == 'image':
                query_obj = query_obj.filter(
                    or_(
                        Image.filename.ilike("%.jpg"),
                        Image.filename.ilike("%.jpeg"),
                        Image.filename.ilike("%.png"),
                        Image.filename.ilike("%.webp"),
                        Image.filename.ilike("%.tif"),
                        Image.filename.ilike("%.tiff"),
                        Image.filename.ilike("%.bmp")
                    )
                )
        elif exclude_static:
            # Legacy behavior: exclude static images but this keeps both GIFs and videos
            query_obj = query_obj.filter(
                ~Image.filename.ilike("%.jpg"),
                ~Image.filename.ilike("%.jpeg"),
                ~Image.filename.ilike("%.png"),
                ~Image.filename.ilike("%.webp"),
                ~Image.filename.ilike("%.bmp"),
                ~Image.filename.ilike("%.tiff"),
                ~Image.filename.ilike("%.tif")
            )
        
        # Apply sorting
        if sort_by == 'random':
            query_obj = query_obj.order_by(func.random())
        else:
            sort_column = getattr(Image, sort_by)
            if sort_order == "desc":
                query_obj = query_obj.order_by(desc(sort_column))
            else:
                query_obj = query_obj.order_by(asc(sort_column))
        
        # Apply pagination
        offset = (page - 1) * page_size
        
        # Execute query with timeout protection
        images = query_obj.offset(offset).limit(page_size).all()
        
        # Load tags and categories separately to avoid N+1 queries
        image_ids = [img.id for img in images]
        if image_ids:
            # Pre-load tags (names only)
            tags_query = db.query(Image.id, Tag.name).join(Image.tags).filter(Image.id.in_(image_ids))
            image_tags = {}
            for img_id, tag_name in tags_query:
                if img_id not in image_tags:
                    image_tags[img_id] = []
                image_tags[img_id].append(tag_name)
            
            # Pre-load categories (names only) without loading full Category mapper
            cats_query = (
                db.query(image_categories.c.image_id, Category.__table__.c.name)
                .join(Category.__table__, image_categories.c.category_id == Category.__table__.c.id)
                .filter(image_categories.c.image_id.in_(image_ids))
            )
            image_categories_map = {}
            for img_id, cat_name in cats_query:
                if img_id not in image_categories_map:
                    image_categories_map[img_id] = []
                image_categories_map[img_id].append(cat_name)
        
        # Build response without touching ORM relationships on Image to avoid
        # selecting new columns during migrations
        results = []
        for image in images:
            img_dict = {
                "id": image.id,
                "path": image.path,
                "filename": image.filename,
                "file_size": image.file_size,
                "width": image.width,
                "height": image.height,
                "aspect_ratio": image.aspect_ratio,
                "format": image.format,
                "prompt": image.prompt,
                "negative_prompt": image.negative_prompt,
                "model_name": image.model_name,
                "model_hash": image.model_hash,
                "seed": image.seed,
                "steps": image.steps,
                "cfg_scale": image.cfg_scale,
                "sampler": image.sampler,
                "favorite": image.favorite,
                "rating": image.rating,
                "created_at": image.created_at.isoformat() if image.created_at else None,
                "modified_at": image.modified_at.isoformat() if image.modified_at else None,
                "indexed_at": image.indexed_at.isoformat() if image.indexed_at else None,
                "thumbnail_path": image.thumbnail_path,
                "thumbnail_paths": getattr(image, 'thumbnail_paths', {}),
                "animated_preview_paths": getattr(image, 'animated_preview_paths', {}),
                "is_animated": image.is_animated,
                "tags": image_tags.get(image.id, []),
                "categories": image_categories_map.get(image.id, []),
            }
            results.append(ImageResponse(**img_dict))
        
        return results
        
    except Exception as e:
        print(f"Error in get_images: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch images")

@router.get("/{image_id}/thumbnail/{size}")
async def serve_thumbnail(image_id: int, size: str, db: Session = Depends(get_db)):
    """Serve thumbnail for an image at specified size"""
    from fastapi.responses import FileResponse
    import os
    
    # Validate that the image exists
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get thumbnails directory
    thumbnails_dir = os.getenv('THUMBNAILS_DIR', '/thumbnails')
    
    # For now, we only support the standard thumbnail size regardless of requested size
    # The thumbnail generator creates 256px thumbnails by default
    thumbnail_path = os.path.join(thumbnails_dir, f"{image_id}.jpg")
    
    if not os.path.exists(thumbnail_path):
        # Try to generate thumbnail on demand
        from backend.services.thumbnail_generator import ThumbnailGenerator
        generator = ThumbnailGenerator()
        if generator.generate_single_thumbnail(image, force_regenerate=False):
            # Thumbnail was generated successfully
            pass
        else:
            raise HTTPException(status_code=404, detail="Thumbnail not available")
    
    if os.path.exists(thumbnail_path):
        return FileResponse(thumbnail_path, media_type="image/jpeg")
    else:
        raise HTTPException(status_code=404, detail="Thumbnail not found")

@router.get("/{image_id}", response_model=ImageResponse)
async def get_image(image_id: int, db: Session = Depends(get_db)):
    """Get single image by ID (safe: no eager loads that require new columns)"""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    # Build response manually to avoid selecting full Category rows
    img_dict = {
        "id": image.id,
        "path": image.path,
        "filename": image.filename,
        "file_size": image.file_size,
        "width": image.width,
        "height": image.height,
        "aspect_ratio": image.aspect_ratio,
        "format": image.format,
        "prompt": image.prompt,
        "negative_prompt": image.negative_prompt,
        "model_name": image.model_name,
        "model_hash": image.model_hash,
        "seed": image.seed,
        "steps": image.steps,
        "cfg_scale": image.cfg_scale,
        "sampler": image.sampler,
        "favorite": image.favorite,
        "rating": image.rating,
        "created_at": image.created_at.isoformat() if image.created_at else None,
        "modified_at": image.modified_at.isoformat() if image.modified_at else None,
        "indexed_at": image.indexed_at.isoformat() if image.indexed_at else None,
        "thumbnail_path": image.thumbnail_path,
        "thumbnail_paths": getattr(image, 'thumbnail_paths', {}),
        "animated_preview_paths": getattr(image, 'animated_preview_paths', {}),
        "is_animated": image.is_animated,
        "tags": [],
        "categories": [],
    }
    try:
        # Tags
        tags_query = db.query(Tag.name).join(Image.tags).filter(Image.id == image_id)
        img_dict["tags"] = [row[0] for row in tags_query]
    except Exception:
        pass
    try:
        # Category names via association table only
        cats_query = (
            db.query(Category.__table__.c.name)
            .join(image_categories, image_categories.c.category_id == Category.__table__.c.id)
            .filter(image_categories.c.image_id == image_id)
        )
        img_dict["categories"] = [row[0] for row in cats_query]
    except Exception:
        pass
    return ImageResponse(**img_dict)

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
async def set_rating(image_id: int, rating: int = Query(..., ge=0, le=5), db: Session = Depends(get_db)):
    """Set rating for an image (0-5 stars)"""
    
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image.rating = rating
    db.commit()
    
    return {"id": image.id, "rating": image.rating}

class TagNames(BaseModel):
    tag_names: List[str] = Field(..., min_items=1, max_items=20)
    
    @validator('tag_names')
    def validate_tag_names(cls, v):
        for tag in v:
            if not tag.strip():
                raise ValueError('Tag names cannot be empty')
            if len(tag.strip()) > 50:
                raise ValueError('Tag names must be 50 characters or less')
        return [tag.strip() for tag in v]

@router.post("/{image_id}/tags")
async def add_image_tags(
    image_id: int, 
    tag_data: TagNames, 
    db: Session = Depends(get_db)
):
    """Add tags to an image"""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    for tag_name in tag_data.tag_names:
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if not tag:
            tag = Tag(name=tag_name)
            db.add(tag)
        
        if tag not in image.tags:
            image.tags.append(tag)
    
    db.commit()
    return {"message": f"Added {len(tag_data.tag_names)} tags to image"}

@router.delete("/{image_id}/tags")
async def remove_image_tags(
    image_id: int,
    tag_data: TagNames,
    db: Session = Depends(get_db)
):
    """Remove tags from an image"""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    removed_count = 0
    for tag_name in tag_data.tag_names:
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if tag and tag in image.tags:
            image.tags.remove(tag)
            removed_count += 1
    
    db.commit()
    return {"message": f"Removed {removed_count} tags from image"}

@router.post("/download")
async def download_images(ids_data: ImageIds, db: Session = Depends(get_db)):
    """Create a ZIP file with selected images"""
    images = db.query(Image).filter(Image.id.in_(ids_data.image_ids)).all()
    
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

@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload an image file for use as category cover.

    Notes:
    - Streams the file to disk in chunks while tracking size to avoid buffering the entire body in memory.
    - Enforces a 10MB application limit (server-level proxies still need matching limits).
    """
    # App-enforced size limit (10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024
    CHUNK_SIZE = 1024 * 1024  # 1MB

    # Validate incoming content type early (still re-check with PIL later)
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.")

    # Ensure uploads directory exists
    uploads_dir = os.getenv("THUMBNAILS_DIR", "/data/thumbnails")
    covers_dir = os.path.join(uploads_dir, "covers")
    os.makedirs(covers_dir, exist_ok=True)

    # Generate deterministic output name
    import uuid
    file_ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "jpg"
    unique_filename = f"cover_{uuid.uuid4().hex}.{file_ext}"
    file_path = os.path.join(covers_dir, unique_filename)

    # Stream upload to disk while enforcing limit
    total_size = 0
    try:
        with open(file_path, "wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_FILE_SIZE:
                    # Remove partially written file then raise a clear 413
                    out.close()
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB")
                out.write(chunk)

        # Validate image metadata using PIL (also catches invalid files)
        from PIL import Image as PILImage
        try:
            with PILImage.open(file_path) as img:
                width, height = img.size
                aspect_ratio = width / height if height > 0 else None
        except Exception:
            # Clean invalid files
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image")

        image = Image(
            path=file_path,
            filename=unique_filename,
            file_size=total_size,
            width=width,
            height=height,
            aspect_ratio=aspect_ratio,
            format=file.content_type.split("/")[-1].upper(),
        )

        db.add(image)
        db.commit()
        db.refresh(image)

        return {"id": image.id, "filename": unique_filename}

    except HTTPException:
        # Pass through handled HTTP errors
        raise
    except Exception as e:
        # Clean up on unexpected errors
        if os.path.exists(file_path):
            os.remove(file_path)
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")

@router.get("/file/{image_id}")
async def serve_image_file(image_id: int, request: Request, download: bool = False, db: Session = Depends(get_db)):
    """Serve the original image file"""
    from fastapi.responses import FileResponse
    
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        print(f"DEBUG: Image {image_id} not found in database")
        raise HTTPException(status_code=404, detail="Image not found")
    
    print(f"DEBUG: Found image {image_id}: {image.filename}")
    print(f"DEBUG: Original path: {image.path}")
    
    # Map the database path to container path
    if image.path.startswith('/volume1/homes/rheritage/Spicy Gif Library'):
        container_path = image.path.replace('/volume1/homes/rheritage/Spicy Gif Library', '/library')
        print(f"DEBUG: Using mapped path from NAS: {container_path}")
    elif image.path.startswith('/library/'):
        container_path = image.path
        print(f"DEBUG: Using container path directly: {container_path}")
    elif image.path.startswith('/volume1/homes/rheritage/Spicy Clip Library'):
        container_path = image.path.replace('/volume1/homes/rheritage/Spicy Clip Library', '/clips')
        print(f"DEBUG: Using mapped clip path from NAS: {container_path}")
    elif image.path.startswith('/clips/'):
        container_path = image.path
        print(f"DEBUG: Using container clip path directly: {container_path}")
    elif image.path.startswith('/data/'):
        # Covers and other app-generated files live under /data
        container_path = image.path
        print(f"DEBUG: Using container data path directly: {container_path}")
    else:
        print(f"DEBUG: Unknown path format: {image.path}")
        raise HTTPException(status_code=404, detail="Image file path not recognized")
        
    if os.path.exists(container_path):
        file_size = os.path.getsize(container_path)
        print(f"DEBUG: File size: {file_size} bytes")
        
        # Set appropriate headers and media type
        headers = {"Accept-Ranges": "bytes"}
        if download:
            headers["Content-Disposition"] = f'attachment; filename="{image.filename}"'
            media_type = "application/octet-stream"
        else:
            # Get media type based on file extension
            ext = image.filename.lower().split('.')[-1] if '.' in image.filename else ''
            media_types = {
                'gif': 'image/gif',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg', 
                'png': 'image/png',
                'webp': 'image/webp',
                # Common video types
                'webm': 'video/webm',
                'mp4': 'video/mp4',
                'm4v': 'video/mp4',
                'mov': 'video/quicktime',
                'avi': 'video/x-msvideo'
            }
            media_type = media_types.get(ext, 'application/octet-stream')
        
        # Handle Range requests for scrubbing
        range_header = request.headers.get('range') or request.headers.get('Range')
        if range_header and range_header.startswith('bytes='):
            try:
                range_spec = range_header.split('=')[1]
                start_str, end_str = (range_spec.split('-') + [''])[:2]
                start = int(start_str) if start_str else 0
                end = int(end_str) if end_str else file_size - 1
                start = max(0, start)
                end = min(file_size - 1, end)
                length = end - start + 1

                def iter_file(path, offset, nbytes, chunk_size=1024 * 64):
                    with open(path, 'rb') as f:
                        f.seek(offset)
                        remaining = nbytes
                        while remaining > 0:
                            chunk = f.read(min(chunk_size, remaining))
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            yield chunk

                headers.update({
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(length),
                })
                print(f"DEBUG: Serving range {start}-{end} for file: {container_path}")
                return StreamingResponse(iter_file(container_path, start, length), status_code=206, media_type=media_type, headers=headers)
            except Exception as e:
                print(f"DEBUG: Error parsing range header '{range_header}': {e}")

        print(f"DEBUG: Serving file: {container_path}")
        return FileResponse(container_path, headers=headers, media_type=media_type)
    else:
        print(f"DEBUG: File not found at: {container_path}")
        raise HTTPException(status_code=404, detail="Image file not found")
