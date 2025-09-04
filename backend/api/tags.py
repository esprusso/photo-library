from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from pydantic import BaseModel
import logging

from backend.models import get_db, Tag, Image
from backend.services.ai_tagger import get_ai_tagger

router = APIRouter()

class TagResponse(BaseModel):
    id: int
    name: str
    color: str
    created_at: Optional[str]
    image_count: int

class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#3B82F6"

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

@router.get("/", response_model=List[TagResponse])
async def get_tags(
    search: Optional[str] = None,
    sort_by: str = "name",
    db: Session = Depends(get_db)
):
    """Get all tags with optional search"""
    query = db.query(Tag)
    
    if search:
        query = query.filter(Tag.name.ilike(f"%{search}%"))
    
    if sort_by == "count":
        # Sort by image count (requires subquery)
        from sqlalchemy import func
        query = query.join(Tag.images).group_by(Tag.id).order_by(func.count(Image.id).desc())
    else:
        query = query.order_by(Tag.name)
    
    tags = query.all()
    return [TagResponse(**tag.to_dict()) for tag in tags]

@router.post("/", response_model=TagResponse)
async def create_tag(tag_data: TagCreate, db: Session = Depends(get_db)):
    """Create a new tag"""
    existing_tag = db.query(Tag).filter(Tag.name == tag_data.name).first()
    if existing_tag:
        raise HTTPException(status_code=400, detail="Tag already exists")
    
    tag = Tag(name=tag_data.name, color=tag_data.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    
    return TagResponse(**tag.to_dict())

@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(tag_id: int, db: Session = Depends(get_db)):
    """Get a specific tag by ID"""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    return TagResponse(**tag.to_dict())

@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(tag_id: int, tag_data: TagUpdate, db: Session = Depends(get_db)):
    """Update a tag"""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    if tag_data.name:
        existing_tag = db.query(Tag).filter(Tag.name == tag_data.name, Tag.id != tag_id).first()
        if existing_tag:
            raise HTTPException(status_code=400, detail="Tag name already exists")
        tag.name = tag_data.name
    
    if tag_data.color:
        tag.color = tag_data.color
    
    db.commit()
    db.refresh(tag)
    
    return TagResponse(**tag.to_dict())

@router.delete("/{tag_id}")
async def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    """Delete a tag"""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    db.delete(tag)
    db.commit()
    
    return {"message": "Tag deleted successfully"}

@router.post("/bulk-create")
async def bulk_create_tags(tag_names: List[str], db: Session = Depends(get_db)):
    """Create multiple tags at once"""
    created_tags = []
    
    for tag_name in tag_names:
        existing_tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if not existing_tag:
            tag = Tag(name=tag_name)
            db.add(tag)
            created_tags.append(tag)
    
    db.commit()
    
    return {"message": f"Created {len(created_tags)} tags", "created": len(created_tags)}

# AI Auto-Tagging Endpoints

class AutoTagRequest(BaseModel):
    image_ids: List[int]

class AutoTagSingleRequest(BaseModel):
    image_id: int

@router.post("/auto-tag-single")
async def auto_tag_single_image(
    request: AutoTagSingleRequest,
    db: Session = Depends(get_db)
):
    """Generate AI tags for a single image"""
    logger = logging.getLogger(__name__)
    
    # Get the image
    image = db.query(Image).filter(Image.id == request.image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    try:
        # Get AI tagger instance
        ai_tagger = get_ai_tagger()
        
        # Generate tags for the image
        suggested_tags = ai_tagger.generate_tags(image.path)
        
        if not suggested_tags:
            return {"message": "No tags could be generated for this image", "tags": []}
        
        # Create new tags if they don't exist and associate with image
        applied_tags = []
        for tag_name in suggested_tags:
            # Check if tag exists
            existing_tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if not existing_tag:
                # Create new tag
                new_tag = Tag(name=tag_name, color="#10B981")  # Green color for AI tags
                db.add(new_tag)
                db.commit()
                db.refresh(new_tag)
                tag = new_tag
            else:
                tag = existing_tag
            
            # Associate tag with image if not already associated
            if tag not in image.tags:
                image.tags.append(tag)
                applied_tags.append(tag_name)
        
        db.commit()
        
        return {
            "message": f"Applied {len(applied_tags)} AI-generated tags",
            "tags": applied_tags,
            "all_suggested_tags": suggested_tags
        }
        
    except Exception as e:
        logger.error(f"Failed to auto-tag image {request.image_id}: {e}")
        raise HTTPException(status_code=500, detail=f"AI tagging failed: {str(e)}")

@router.post("/auto-tag-batch")
async def auto_tag_batch_images(
    request: AutoTagRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Generate AI tags for multiple images in the background"""
    if not request.image_ids:
        raise HTTPException(status_code=400, detail="No image IDs provided")
    
    # Verify all images exist
    images = db.query(Image).filter(Image.id.in_(request.image_ids)).all()
    found_ids = {img.id for img in images}
    missing_ids = set(request.image_ids) - found_ids
    
    if missing_ids:
        raise HTTPException(
            status_code=404, 
            detail=f"Images not found: {list(missing_ids)}"
        )
    
    # Create a job to track progress
    from backend.models import Job
    import json
    from datetime import datetime
    
    job = Job(
        type="ai_tagging",
        status="pending",
        total_items=len(request.image_ids),
        processed_items=0,
        progress=0,
        parameters={"image_ids": request.image_ids}
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Add background task
    background_tasks.add_task(
        _batch_auto_tag_images, 
        request.image_ids,
        job.id
    )
    
    return {
        "message": f"Started AI tagging for {len(request.image_ids)} images",
        "image_count": len(request.image_ids),
        "status": "processing",
        "job_id": job.id
    }

@router.post("/auto-tag-all-untagged")
async def auto_tag_all_untagged(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Generate AI tags for all images that have no tags"""
    # Find images with no tags
    untagged_images = db.query(Image).filter(~Image.tags.any()).all()
    
    if not untagged_images:
        return {"message": "No untagged images found"}
    
    image_ids = [img.id for img in untagged_images]
    
    # Create a job to track progress
    from backend.models import Job
    
    job = Job(
        type="ai_tagging",
        status="pending", 
        total_items=len(image_ids),
        processed_items=0,
        progress=0,
        parameters={"image_ids": image_ids, "auto_tag_all": True}
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Add background task
    background_tasks.add_task(
        _batch_auto_tag_images,
        image_ids,
        job.id
    )
    
    return {
        "message": f"Started AI tagging for {len(image_ids)} untagged images",
        "image_count": len(image_ids),
        "status": "processing",
        "job_id": job.id
    }

async def _batch_auto_tag_images(image_ids: List[int], job_id: int):
    """Background task to process batch AI tagging with proper session management"""
    logger = logging.getLogger(__name__)
    logger.info(f"Starting batch AI tagging for {len(image_ids)} images (job {job_id})")
    
    from backend.models import SessionLocal, Job
    from datetime import datetime
    
    # Create our own database session for this background task
    db = SessionLocal()
    
    try:
        # Update job status to running
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "running"
            job.started_at = datetime.utcnow()
            db.commit()
        
        # Initialize AI tagger
        ai_tagger = get_ai_tagger()
        if not ai_tagger.initialize():
            raise Exception("Failed to initialize AI tagger")
        
        processed = 0
        total_tags_applied = 0
        total_images = len(image_ids)
        
        # Process in smaller batches to prevent memory issues
        batch_size = 5  # Process 5 images at a time
        current_batch = 0
        
        for i, image_id in enumerate(image_ids):
            # Add a small delay every batch to prevent overwhelming the system
            if i > 0 and i % batch_size == 0:
                import time
                time.sleep(2)  # 2-second pause between batches
                current_batch += 1
                logger.info(f"Completed batch {current_batch}, processed {processed}/{total_images} images")
            try:
                # Get image (fresh query each time)
                image = db.query(Image).filter(Image.id == image_id).first()
                if not image:
                    logger.warning(f"Image {image_id} not found, skipping")
                    continue
                
                # Generate tags with error handling
                try:
                    suggested_tags = ai_tagger.generate_tags(image.path)
                except Exception as tag_error:
                    logger.error(f"Failed to generate tags for image {image_id} ({image.filename}): {tag_error}")
                    suggested_tags = []
                
                if suggested_tags:
                    tags_applied = 0
                    for tag_name in suggested_tags:
                        # Get or create tag
                        existing_tag = db.query(Tag).filter(Tag.name == tag_name).first()
                        if not existing_tag:
                            new_tag = Tag(name=tag_name, color="#10B981")
                            db.add(new_tag)
                            db.flush()  # Get the ID without full commit
                            tag = new_tag
                        else:
                            tag = existing_tag
                        
                        # Associate with image if not already
                        if tag not in image.tags:
                            image.tags.append(tag)
                            tags_applied += 1
                    
                    # Commit after each image to avoid long transactions
                    db.commit()
                    total_tags_applied += tags_applied
                    
                processed += 1
                
                # Update job progress every 5 images or at the end
                if processed % 5 == 0 or processed == total_images:
                    if job:
                        progress = int((processed / total_images) * 100)
                        job.processed_items = processed
                        job.progress = progress
                        db.commit()
                        logger.info(f"Progress: {processed}/{total_images} ({progress}%)")
                    
            except Exception as e:
                logger.error(f"Failed to process image {image_id}: {e}")
                continue
        
        # Mark job as completed
        if job:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.progress = 100
            job.processed_items = processed
            job.result = {
                "processed_images": processed,
                "total_tags_applied": total_tags_applied
            }
            db.commit()
        
        logger.info(f"Batch AI tagging completed: {processed} images processed, {total_tags_applied} tags applied")
        
    except Exception as e:
        logger.error(f"Batch AI tagging failed: {e}")
        
        # Mark job as failed
        try:
            if job:
                job.status = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.utcnow()
                db.commit()
        except:
            pass
            
    finally:
        # Clean up resources
        try:
            if 'ai_tagger' in locals():
                ai_tagger.cleanup()
        except:
            pass
            
        # Always close the database session
        db.close()