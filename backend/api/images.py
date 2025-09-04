from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, desc, asc, func
from typing import List, Optional
from pydantic import BaseModel
import os
import zipfile
import tempfile
from datetime import datetime
import os
import shutil

from backend.models import get_db, Image, Tag, Category

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
    thumbnail_path: str
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


def _resolve_original_path(image: Image) -> Optional[str]:
    """Resolve the best guess for the original file path (not local copy).
    Mirrors the mapping used elsewhere: prefer actual path, else map
    '/volume1/Heritage/AI Art' => '/library'.
    """
    if image.path and os.path.exists(image.path):
        return image.path
    if image.path and image.path.startswith('/volume1/Heritage/AI Art'):
        mapped = image.path.replace('/volume1/Heritage/AI Art', '/library')
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
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("created_at", pattern="^(created_at|filename|width|height)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    query: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    categories: Optional[str] = Query(None),
    favorite: Optional[bool] = Query(None),
    rating: Optional[int] = Query(None),
    model_name: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get paginated list of images with filtering and sorting"""
    
    # Build query
    query_obj = db.query(Image).options(
        joinedload(Image.tags),
        joinedload(Image.categories)
    )
    
    # Apply filters
    if query:
        query_obj = query_obj.filter(
            or_(
                Image.filename.ilike(f"%{query}%"),
                Image.prompt.ilike(f"%{query}%"),
                Image.negative_prompt.ilike(f"%{query}%")
            )
        )
    
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        query_obj = query_obj.join(Image.tags).filter(Tag.name.in_(tag_list))
    
    if categories:
        cat_list = [c.strip() for c in categories.split(",")]
        query_obj = query_obj.join(Image.categories).filter(Category.name.in_(cat_list))
    
    if favorite is not None:
        query_obj = query_obj.filter(Image.favorite == favorite)
    
    if rating is not None:
        query_obj = query_obj.filter(Image.rating == rating)
    
    if model_name:
        query_obj = query_obj.filter(Image.model_name.ilike(f"%{model_name}%"))
    
    # Apply sorting
    sort_column = getattr(Image, sort_by)
    if sort_order == "desc":
        query_obj = query_obj.order_by(desc(sort_column))
    else:
        query_obj = query_obj.order_by(asc(sort_column))
    
    # Apply pagination
    offset = (page - 1) * page_size
    images = query_obj.offset(offset).limit(page_size).all()
    
    return [ImageResponse(**image.to_dict()) for image in images]

@router.get("/{image_id}", response_model=ImageResponse)
async def get_image(image_id: int, db: Session = Depends(get_db)):
    """Get single image by ID"""
    image = db.query(Image).options(
        joinedload(Image.tags),
        joinedload(Image.categories)
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
