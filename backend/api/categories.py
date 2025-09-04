from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from backend.models import get_db, Category, Image

router = APIRouter()

class CategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    featured: bool
    created_at: Optional[str]
    image_count: int

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#10B981"
    # featured: Optional[bool] = False  # Temporarily disabled

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    # featured: Optional[bool] = None  # Temporarily disabled

@router.get("/", response_model=List[CategoryResponse])
async def get_categories(
    search: Optional[str] = None,
    sort_by: str = "name",
    db: Session = Depends(get_db)
):
    """Get all categories with optional search"""
    from sqlalchemy import func
    
    # Always get categories with image counts in a single efficient query
    query = db.query(
        Category.id,
        Category.name, 
        Category.description,
        Category.color,
        Category.created_at,
        func.count(Image.id).label('image_count')
    ).outerjoin(Category.images).group_by(Category.id, Category.name, Category.description, Category.color, Category.created_at)
    
    if search:
        query = query.filter(Category.name.ilike(f"%{search}%"))
    
    if sort_by == "count":
        query = query.order_by(func.count(Image.id).desc())
    else:
        query = query.order_by(Category.name)
    
    results = query.all()
    
    # Convert results to CategoryResponse format
    categories = []
    for result in results:
        categories.append(CategoryResponse(
            id=result.id,
            name=result.name,
            description=result.description,
            color=result.color,
            featured=getattr(result, 'featured', False),
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
    
    category = Category(
        name=category_data.name,
        description=category_data.description,
        color=category_data.color
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

@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: int, category_data: CategoryUpdate, db: Session = Depends(get_db)):
    """Update a category"""
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