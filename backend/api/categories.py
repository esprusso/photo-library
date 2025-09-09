from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from backend.models import get_db, Category, Image, SessionLocal

router = APIRouter()

class CategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: Optional[str] = None
    created_at: Optional[str]
    image_count: int
    cover_image_id: Optional[int] = None
    cover_image_url: Optional[str] = None

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    cover_image_id: Optional[int] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    cover_image_id: Optional[int] = None
    
    class Config:
        # Allow explicit null values to be set
        extra = "forbid"

@router.get("/", response_model=List[CategoryResponse])
async def get_categories(
    search: Optional[str] = None,
    sort_by: str = "name",
    media: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all categories with optional search.
    Optimized to compute image counts with a single grouped query
    (avoids loading all images per category which can time out).
    """
    try:
        from sqlalchemy import func

        # Base query with count of related images
        query = (
            db.query(
                Category.id,
                Category.name,
                Category.description,
                Category.color,
                Category.created_at,
                Category.cover_image_id,
                func.count(Image.id).label("image_count"),
            )
            .outerjoin(Category.images)
            .group_by(
                Category.id,
                Category.name,
                Category.description,
                Category.color,
                Category.created_at,
                Category.cover_image_id,
            )
        )

        # Filter by media type if provided (image/video)
        if media:
            mt = media.lower()
            if mt in ("image", "video"):
                try:
                    query = query.filter(Category.media_type == mt)
                except Exception:
                    # media_type column may not exist yet; ignore filter
                    pass

        if search:
            query = query.filter(Category.name.ilike(f"%{search}%"))

        # Sorting
        if sort_by == "count":
            query = query.order_by(func.count(Image.id).desc(), Category.name.asc())
        else:
            query = query.order_by(Category.name.asc())

        rows = query.limit(2000).all()

        # Build response without triggering relationship loads
        results = [
            CategoryResponse(
                id=row[0],
                name=row[1],
                description=row[2],
                color=row[3],
                created_at=row[4].isoformat() if row[4] else None,
                cover_image_id=row[5],
                cover_image_url=f"/api/images/file/{row[5]}" if row[5] else None,
                image_count=row[6] or 0,
            )
            for row in rows
        ]

        return results

    except Exception as e:
        print(f"Error in get_categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")

@router.post("/", response_model=CategoryResponse)
async def create_category(category_data: CategoryCreate, db: Session = Depends(get_db)):
    """Create a new category"""
    existing_category = db.query(Category).filter(Category.name == category_data.name).first()
    if existing_category:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    category = Category(
        name=category_data.name,
        description=category_data.description,
        color=category_data.color or "#10B981",
        cover_image_id=category_data.cover_image_id
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

@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: int, category_data: CategoryUpdate, db: Session = Depends(get_db)):
    """Update a category"""
    print(f"Updating category {category_id} with data: {category_data.dict()}")
    print(f"Fields set: {getattr(category_data, '__fields_set__', 'not available')}")
    
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
    
    # Handle cover image update
    if hasattr(category_data, '__fields_set__') and 'cover_image_id' in category_data.__fields_set__:
        # Field was explicitly provided (either with a value or null)
        if category_data.cover_image_id is not None:
            # Setting a specific image as cover
            img = db.query(Image).filter(Image.id == category_data.cover_image_id).first()
            if not img:
                raise HTTPException(status_code=404, detail="Cover image not found")
            category.cover_image_id = category_data.cover_image_id
        else:
            # Field explicitly provided as null -> clear the cover
            category.cover_image_id = None
    
    db.commit()
    db.refresh(category)
    
    print(f"Updated category cover_image_id: {category.cover_image_id}")
    result = CategoryResponse(**category.to_dict())
    print(f"Response cover_image_id: {result.cover_image_id}")
    
    return result

@router.post("/{category_id}/cover/{image_id}")
async def set_category_cover(category_id: int, image_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    category.cover_image_id = image_id
    db.commit()
    db.refresh(category)
    return {"message": "Cover image set", "cover_image_id": image_id, "cover_image_url": f"/api/images/file/{image_id}"}

@router.delete("/{category_id}/cover")
async def clear_category_cover(category_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    category.cover_image_id = None
    db.commit()
    return {"message": "Cover image cleared"}

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

@router.post("/auto-categorize-folders")
async def auto_categorize_by_folders(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Auto-categorize all images based on their folder structure"""
    from backend.services.image_scanner import ImageScanner
    from backend.models.job import Job
    from datetime import datetime
    
    # Create a new job for tracking progress
    job = Job(
        type='auto-categorizing',
        status='pending',
        progress=0,
        parameters={'media_type': 'all'}
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id
    
    def categorize_all_images(job_id: int = job_id):
        try:
            # Use a fresh DB session in background thread
            session: Session = SessionLocal()
            try:
                # Load the job row afresh
                job = session.query(Job).filter(Job.id == job_id).first()
                if not job:
                    print(f"Auto-categorize: job {job_id} not found")
                    return

                # Update job to running
                job.status = 'running'
                job.started_at = datetime.now()
                session.commit()

                scanner = ImageScanner()

                total = session.query(Image).count()
                job.total_items = total
                session.commit()

                processed = 0
                categorized_count = 0
                error_count = 0

                batch_size = 200
                offset = 0
                while True:
                    images = (
                        session.query(Image)
                        .offset(offset)
                        .limit(batch_size)
                        .all()
                    )
                    if not images:
                        break

                    for image in images:
                        try:
                            existing_categories = len(image.categories)
                            scanner._assign_folder_categories(session, image, image.path)
                            session.commit()

                            if len(image.categories) > existing_categories:
                                categorized_count += 1

                            processed += 1

                            if processed % 50 == 0:
                                job.processed_items = processed
                                job.progress = int((processed / max(total, 1)) * 100)
                                session.commit()
                        except Exception as e:
                            print(f"Error categorizing {getattr(image, 'path', '')}: {e}")
                            try:
                                session.rollback()
                            except Exception:
                                pass
                            error_count += 1
                            continue

                    offset += batch_size

                # Mark job as completed
                job.status = 'completed'
                job.completed_at = datetime.now()
                job.processed_items = processed
                job.progress = 100 if total == 0 or processed >= total else int((processed / total) * 100)
                job.result = {
                    'total_processed': processed,
                    'categorized': categorized_count,
                    'errors': error_count
                }
                session.commit()
            finally:
                try:
                    session.close()
                except Exception:
                    pass
        except Exception as e:
            # Best-effort: mark job as failed using a new session
            print(f"Auto-categorization job failed: {e}")
            try:
                session = SessionLocal()
                job = session.query(Job).filter(Job.id == job_id).first()
                if job:
                    job.status = 'failed'
                    job.error_message = str(e)
                    session.commit()
            except Exception as e2:
                print(f"Failed to update job failure state: {e2}")
            finally:
                try:
                    session.close()
                except Exception:
                    pass
    
    background_tasks.add_task(categorize_all_images)
    
    return {"job_id": job.id, "message": "Started auto-categorization job. You can track progress using the job ID."}

@router.post("/cleanup-empty")
async def cleanup_empty_categories(min_images: int = 1, db: Session = Depends(get_db)):
    """Delete categories that have fewer than `min_images` images (default: 1).
    Passing the default will delete all categories with zero images.
    """
    if min_images < 0:
        raise HTTPException(status_code=400, detail="min_images must be >= 0")

    try:
        # Find categories with fewer than min_images associated images
        from sqlalchemy import func
        categories_to_delete = (
            db.query(Category)
            .outerjoin(Category.images)
            .group_by(Category.id)
            .having(func.count(Image.id) < min_images)
            .all()
        )

        count = len(categories_to_delete)
        for cat in categories_to_delete:
            db.delete(cat)
        db.commit()
        return {"message": f"Deleted {count} categories with < {min_images} images", "deleted_count": count}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to cleanup categories: {e}")
