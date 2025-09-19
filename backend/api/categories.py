from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
import os
import zipfile
from datetime import datetime
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from pydantic import BaseModel

from backend.models import get_db, Category, Image, Job, SessionLocal
from backend.models.image import image_categories

router = APIRouter()

class CategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    featured: bool
    featured_image_id: Optional[int] = None
    featured_image_position: Optional[str] = None
    featured_image_thumbnail_path: Optional[str] = None
    created_at: Optional[str]
    image_count: int

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#10B981"
    featured_image_id: Optional[int] = None
    featured_image_position: Optional[str] = None
    # featured: Optional[bool] = False  # Temporarily disabled

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    featured_image_id: Optional[int] = None
    featured_image_position: Optional[str] = None
    # featured: Optional[bool] = None  # Temporarily disabled

@router.get("/", response_model=List[CategoryResponse])
async def get_categories(
    search: Optional[str] = None,
    sort_by: str = "name",
    db: Session = Depends(get_db)
):
    """Get all categories with optional search"""
    from sqlalchemy import func
    from sqlalchemy import inspect as sa_inspect

    inspector = sa_inspect(db.bind)
    existing_cols = {c['name'] for c in inspector.get_columns('categories')}
    has_featured_cols = 'featured_image_id' in existing_cols and 'featured_image_position' in existing_cols

    # Always get categories with image counts in a single efficient query
    if has_featured_cols:
        query = db.query(
            Category.id,
            Category.name,
            Category.description,
            Category.color,
            Category.created_at,
            Category.featured_image_id,
            Category.featured_image_position,
            func.count(Image.id).label('image_count')
        ).outerjoin(Category.images).group_by(
            Category.id,
            Category.name,
            Category.description,
            Category.color,
            Category.created_at,
            Category.featured_image_id,
            Category.featured_image_position,
        )
    else:
        query = db.query(
            Category.id,
            Category.name,
            Category.description,
            Category.color,
            Category.created_at,
            func.count(Image.id).label('image_count')
        ).outerjoin(Category.images).group_by(
            Category.id,
            Category.name,
            Category.description,
            Category.color,
            Category.created_at,
        )
    
    if search:
        query = query.filter(Category.name.ilike(f"%{search}%"))
    
    if sort_by == "count":
        query = query.order_by(func.count(Image.id).desc())
    else:
        query = query.order_by(Category.name)
    
    results = query.all()

    # Preload thumbnails for all featured_image_id values in one query
    featured_ids = list({getattr(r, 'featured_image_id', None) for r in results if has_featured_cols and getattr(r, 'featured_image_id', None)})
    thumb_map: Dict[int, str] = {}
    if featured_ids:
        images = db.query(Image).filter(Image.id.in_(featured_ids)).all()
        thumb_map = {img.id: img.thumbnail_path for img in images}
    
    # Convert results to CategoryResponse format
    categories = []
    for result in results:
        if has_featured_cols:
            categories.append(CategoryResponse(
                id=result.id,
                name=result.name,
                description=result.description,
                color=result.color,
                featured=getattr(result, 'featured', False),
                featured_image_id=getattr(result, 'featured_image_id', None),
                featured_image_position=getattr(result, 'featured_image_position', None),
                featured_image_thumbnail_path=thumb_map.get(getattr(result, 'featured_image_id', None)) if getattr(result, 'featured_image_id', None) else None,
                created_at=result.created_at.isoformat() if result.created_at else None,
                image_count=result.image_count
            ))
        else:
            categories.append(CategoryResponse(
                id=result.id,
                name=result.name,
                description=result.description,
                color=result.color,
                featured=getattr(result, 'featured', False),
                featured_image_id=None,
                featured_image_position=None,
                featured_image_thumbnail_path=None,
                created_at=result.created_at.isoformat() if result.created_at else None,
                image_count=result.image_count
            ))
    
    return categories

@router.post("/", response_model=CategoryResponse)
async def create_category(category_data: CategoryCreate, db: Session = Depends(get_db)):
    """Create a new category"""
    existing_category = db.query(Category).filter(Category.name == category_data.name).first()
    if existing_category:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    # Only set featured-image fields if columns exist
    from sqlalchemy import inspect as sa_inspect
    inspector2 = sa_inspect(db.bind)
    cols2 = {c['name'] for c in inspector2.get_columns('categories')}
    supports_featured = 'featured_image_id' in cols2 and 'featured_image_position' in cols2

    category = Category(
        name=category_data.name,
        description=category_data.description,
        color=category_data.color,
        **({
            'featured_image_id': category_data.featured_image_id,
            'featured_image_position': category_data.featured_image_position,
        } if supports_featured else {})
        # featured=category_data.featured  # Temporarily disabled
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    
    return CategoryResponse(**category.to_dict())

@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: int, db: Session = Depends(get_db)):
    """Get a specific category by ID"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return CategoryResponse(**category.to_dict())

@router.post("/{category_id}/download")
async def download_category_images(category_id: int, db: Session = Depends(get_db)):
    """Create and return a ZIP file URL containing all original images in a category.
    Skips files that are missing on disk.
    """
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Collect image paths
    images = db.query(Image).join(image_categories, Image.id == image_categories.c.image_id).filter(
        image_categories.c.category_id == category_id
    ).all()
    if not images:
        raise HTTPException(status_code=404, detail="No images in this category")

    downloads_dir = os.getenv("DOWNLOADS_DIR", "/downloads")
    os.makedirs(downloads_dir, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    safe_name = ''.join(ch if ch.isalnum() or ch in ('-', '_') else '_' for ch in category.name)[:40] or f"category_{category_id}"
    zip_name = f"category-{safe_name}-{ts}.zip"
    zip_path = os.path.join(downloads_dir, zip_name)

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for im in images:
            try:
                if im.path and os.path.exists(im.path):
                    arc = im.filename or os.path.basename(im.path)
                    zip_file.write(im.path, arcname=arc)
            except Exception:
                # Skip any problematic file
                continue

    return {"download_url": f"/download/{zip_name}"}

@router.post("/{category_id}/download-async")
async def download_category_images_async(category_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Start a background job to package all originals in a category and return a job id.
    Use this to avoid proxy/request timeouts for large categories.
    """
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Create job
    job = Job(type='category-zip', parameters={'category_id': category_id})
    db.add(job)
    db.commit()
    db.refresh(job)

    def _run(job_id: int, cat_id: int):
        session = SessionLocal()
        try:
            from datetime import datetime as dt
            j = session.query(Job).filter(Job.id == job_id).first()
            if not j:
                return
            j.status = 'running'
            j.started_at = dt.now()
            session.commit()

            # Query images in category
            items = session.query(Image).join(image_categories, Image.id == image_categories.c.image_id).filter(
                image_categories.c.category_id == cat_id
            ).all()
            total = len(items)
            j.total_items = total
            j.processed_items = 0
            j.progress = 0
            session.commit()

            downloads_dir = os.getenv("DOWNLOADS_DIR", "/downloads")
            os.makedirs(downloads_dir, exist_ok=True)
            ts = datetime.now().strftime('%Y%m%d-%H%M%S')
            safe_name = ''.join(ch if ch.isalnum() or ch in ('-', '_') else '_' for ch in (cat.name or f"category_{cat_id}"))[:40]
            zip_name = f"category-{safe_name}-{ts}.zip"
            zip_path = os.path.join(downloads_dir, zip_name)

            written = 0
            # Use ZIP_STORED (no compression) for speed
            with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_STORED) as zf:
                for idx, im in enumerate(items, start=1):
                    try:
                        if im.path and os.path.exists(im.path):
                            arc = im.filename or os.path.basename(im.path)
                            zf.write(im.path, arcname=arc)
                            written += 1
                    except Exception:
                        pass
                    # Update progress occasionally
                    if total:
                        j.processed_items = idx
                        j.progress = min(100, int(idx * 100 / total))
                    if idx % 20 == 0:
                        session.commit()

            # Finalize
            j.processed_items = total
            j.progress = 100
            j.status = 'completed'
            j.result = { 'download_url': f"/download/{zip_name}", 'zip_name': zip_name, 'files_written': written, 'total': total }
            j.completed_at = datetime.now()
            session.commit()
        except Exception as e:
            try:
                j = session.query(Job).filter(Job.id == job_id).first()
                if j:
                    j.status = 'failed'
                    j.error_message = str(e)
                    session.commit()
            except Exception:
                pass
        finally:
            session.close()

    background_tasks.add_task(_run, job.id, category_id)
    return { 'message': 'Packaging started', 'job_id': job.id }

@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: int, category_data: CategoryUpdate, db: Session = Depends(get_db)):
    """Update a category"""
    # Detect if DB has featured-image columns
    from sqlalchemy import inspect as sa_inspect
    inspector3 = sa_inspect(db.bind)
    cols3 = {c['name'] for c in inspector3.get_columns('categories')}
    supports_featured = 'featured_image_id' in cols3 and 'featured_image_position' in cols3

    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if category_data.name:
        existing_category = db.query(Category).filter(
            Category.name == category_data.name, 
            Category.id != category_id
        ).first()
        if existing_category:
            raise HTTPException(status_code=400, detail="Category name already exists")
        category.name = category_data.name
    
    if category_data.description is not None:
        category.description = category_data.description
    
    if category_data.color:
        category.color = category_data.color
    if supports_featured:
        if category_data.featured_image_id is not None:
            category.featured_image_id = category_data.featured_image_id
        if category_data.featured_image_position is not None:
            category.featured_image_position = category_data.featured_image_position
    
    # if category_data.featured is not None:
    #     category.featured = category_data.featured  # Temporarily disabled
    
    db.commit()
    db.refresh(category)
    
    return CategoryResponse(**category.to_dict())

@router.delete("/{category_id}")
async def delete_category(category_id: int, db: Session = Depends(get_db)):
    """Delete a category"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    db.delete(category)
    db.commit()
    
    return {"message": "Category deleted successfully"}

@router.post("/{category_id}/images")
async def add_images_to_category(
    category_id: int,
    image_ids: List[int],
    db: Session = Depends(get_db)
):
    """Add images to a category"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    images = db.query(Image).filter(Image.id.in_(image_ids)).all()
    
    added_count = 0
    for image in images:
        if image not in category.images:
            category.images.append(image)
            added_count += 1
    
    db.commit()
    return {"message": f"Added {added_count} images to category"}

@router.delete("/{category_id}/images")
async def remove_images_from_category(
    category_id: int,
    image_ids: List[int],
    db: Session = Depends(get_db)
):
    """Remove images from a category"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    images = db.query(Image).filter(Image.id.in_(image_ids)).all()
    
    removed_count = 0
    for image in images:
        if image in category.images:
            category.images.remove(image)
            removed_count += 1
    
    db.commit()
    return {"message": f"Removed {removed_count} images from category"}

class BulkDeleteRequest(BaseModel):
    category_ids: List[int]

@router.post("/bulk-delete")
async def bulk_delete_categories(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple categories at once"""
    category_ids = request.category_ids
    
    if not category_ids:
        raise HTTPException(status_code=400, detail="No category IDs provided")
    
    categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
    
    if len(categories) != len(category_ids):
        raise HTTPException(status_code=404, detail="One or more categories not found")
    
    deleted_count = len(categories)
    for category in categories:
        db.delete(category)
    
    db.commit()
    
    return {"message": f"Successfully deleted {deleted_count} categories"}

class MergeCategoriesRequest(BaseModel):
    source_ids: List[int]
    target_id: int
    rename_target: Optional[str] = None
    overwrite_featured: Optional[bool] = False

@router.post("/merge")
async def merge_categories(
    req: MergeCategoriesRequest,
    db: Session = Depends(get_db)
):
    """Merge multiple source categories into a target category.
    - Reassigns images to target (no duplicates)
    - Deletes source categories
    - Optionally renames target and overwrites featured image
    """
    # Basic validation
    if not req.source_ids:
        raise HTTPException(status_code=400, detail="No source category IDs provided")
    if req.target_id in req.source_ids:
        # Avoid merging target into itself
        req.source_ids = [cid for cid in req.source_ids if cid != req.target_id]
    if not req.source_ids:
        raise HTTPException(status_code=400, detail="No valid source categories to merge")

    # Load categories
    target = db.query(Category).filter(Category.id == req.target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target category not found")
    sources = db.query(Category).filter(Category.id.in_(req.source_ids)).all()
    if len(sources) != len(set(req.source_ids)):
        raise HTTPException(status_code=404, detail="One or more source categories not found")

    # Optional rename
    if req.rename_target and req.rename_target != target.name:
        exists = db.query(Category).filter(Category.name == req.rename_target, Category.id != target.id).first()
        if exists:
            raise HTTPException(status_code=400, detail="A category with the new name already exists")
        target.name = req.rename_target

    # Compute image IDs to attach to target from all sources
    # Use set-based queries for efficiency
    from sqlalchemy import select, distinct
    src_img_ids = [row[0] for row in db.execute(
        select(distinct(image_categories.c.image_id)).where(image_categories.c.category_id.in_(req.source_ids))
    ).fetchall()]

    # Remove any already in target
    tgt_img_ids = [row[0] for row in db.execute(
        select(distinct(image_categories.c.image_id)).where(image_categories.c.category_id == target.id)
    ).fetchall()]
    to_add_ids = list(set(src_img_ids) - set(tgt_img_ids))

    moved_count = 0
    if to_add_ids:
        # Attach via ORM
        images = db.query(Image).filter(Image.id.in_(to_add_ids)).all()
        for img in images:
            if img not in target.images:
                target.images.append(img)
                moved_count += 1

    # Delete sources
    deleted = 0
    for cat in sources:
        db.delete(cat)
        deleted += 1

    # Featured handling
    from sqlalchemy import inspect as sa_inspect, asc
    inspector = sa_inspect(db.bind)
    cols = {c['name'] for c in inspector.get_columns('categories')}
    supports_featured = 'featured_image_id' in cols
    if supports_featured and (req.overwrite_featured or getattr(target, 'featured_image_id', None) is None):
        # Pick the first image in target by created_at then id
        candidate = (
            db.query(Image)
            .join(Image.categories)
            .filter(Category.id == target.id)
            .order_by(asc(Image.created_at), asc(Image.id))
            .first()
        )
        if candidate:
            target.featured_image_id = candidate.id

    db.commit()

    return {
        "message": f"Merged {deleted} categories into target {target.id}",
        "moved_images": moved_count,
        "deleted_categories": deleted,
        "target_id": target.id,
        "target_name": target.name,
    }

@router.post("/auto-categorize-folders")
async def auto_categorize_by_folders(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Auto-categorize all images based on their folder structure"""
    from backend.services.image_scanner import ImageScanner
    
    def categorize_all_images():
        scanner = ImageScanner()
        images = db.query(Image).all()
        
        for image in images:
            try:
                scanner._assign_folder_categories(db, image, image.path)
                db.commit()
            except Exception as e:
                print(f"Error categorizing {image.path}: {e}")
                continue
    
    background_tasks.add_task(categorize_all_images)
    
    return {"message": "Started auto-categorization based on folder structure. This will run in the background."}

@router.post("/auto-populate-featured")
async def auto_populate_featured_images(db: Session = Depends(get_db)):
    """Set a featured image for each category that doesn't have one.
    Picks the first image (by created_at then id) in each category.
    Safe to run multiple times; only fills missing values.
    """
    # Ensure DB supports featured-image fields
    from sqlalchemy import inspect as sa_inspect, asc
    inspector = sa_inspect(db.bind)
    cols = {c['name'] for c in inspector.get_columns('categories')}
    supports_featured = 'featured_image_id' in cols
    if not supports_featured:
        return {"message": "Database not migrated for featured images; skipping.", "updated": 0}

    categories = db.query(Category).filter(Category.featured_image_id.is_(None)).all()
    updated = 0
    for cat in categories:
        img = (
            db.query(Image)
            .join(Image.categories)
            .filter(Category.id == cat.id)
            .order_by(asc(Image.created_at), asc(Image.id))
            .first()
        )
        if img:
            cat.featured_image_id = img.id
            updated += 1
    if updated:
        db.commit()
    return {"message": f"Assigned featured images for {updated} categories.", "updated": updated}

@router.post("/cleanup-empty")
async def cleanup_empty_categories(
    min_images: int = 1,
    db: Session = Depends(get_db)
):
    """Remove categories with fewer than min_images (default: 1)"""
    from sqlalchemy import func
    
    # Get categories with their image counts
    categories_with_counts = db.query(
        Category.id,
        Category.name,
        func.count(Image.id).label('image_count')
    ).outerjoin(Category.images).group_by(Category.id, Category.name).all()
    
    # Find categories with fewer than min_images
    empty_categories = [
        cat for cat in categories_with_counts 
        if cat.image_count < min_images
    ]
    
    if not empty_categories:
        return {"message": f"No categories found with fewer than {min_images} images"}
    
    # Delete empty categories
    empty_category_ids = [cat.id for cat in empty_categories]
    empty_category_names = [cat.name for cat in empty_categories[:5]]  # Show first 5 names
    
    deleted_categories = db.query(Category).filter(Category.id.in_(empty_category_ids)).all()
    for category in deleted_categories:
        db.delete(category)
    
    db.commit()
    
    total_deleted = len(empty_categories)
    preview_names = ", ".join(empty_category_names)
    if total_deleted > 5:
        preview_names += f" and {total_deleted - 5} more"
    
    return {
        "message": f"Deleted {total_deleted} categories with fewer than {min_images} images",
        "deleted_categories": preview_names,
        "deleted_count": total_deleted
    }

@router.post("/cleanup-raw-files")
async def cleanup_raw_files(db: Session = Depends(get_db)):
    """Remove all RAW files from the database (ARW, RAF, CR2, NEF, DNG, etc.)"""
    
    raw_extensions = ['.cr2', '.nef', '.arw', '.dng', '.orf', '.raf', '.rw2']
    
    # Find all images with RAW extensions
    raw_images_query = db.query(Image).filter(
        Image.filename.ilike(f'%.cr2') |
        Image.filename.ilike(f'%.nef') |
        Image.filename.ilike(f'%.arw') |
        Image.filename.ilike(f'%.dng') |
        Image.filename.ilike(f'%.orf') |
        Image.filename.ilike(f'%.raf') |
        Image.filename.ilike(f'%.rw2')
    )
    
    raw_images = raw_images_query.all()
    
    if not raw_images:
        return {"message": "No RAW files found in database"}
    
    # Get some info before deletion
    raw_count = len(raw_images)
    sample_filenames = [img.filename for img in raw_images[:5]]
    
    # Delete all RAW images
    for image in raw_images:
        db.delete(image)
    
    db.commit()
    
    preview_names = ", ".join(sample_filenames)
    if raw_count > 5:
        preview_names += f" and {raw_count - 5} more"
    
    return {
        "message": f"Removed {raw_count} RAW files from library",
        "removed_files": preview_names,
        "removed_count": raw_count
    }
