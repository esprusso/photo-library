from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from backend.models import get_db, Image, Tag, Category, Job, PurgedImage
from backend.services.image_scanner import ImageScanner
from backend.services.blacklist import add_blacklist_entry
from backend.models import SessionLocal
from datetime import datetime

router = APIRouter()

@router.get("/health")
async def health_check():
    """API health check endpoint"""
    return {"status": "healthy"}

@router.get("/stats")
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

@router.get("/blacklist")
async def list_blacklist(filename: str = None, limit: int = 100, db: Session = Depends(get_db)):
    """List purged/blacklisted entries for debugging. Optionally filter by filename."""
    q = db.query(PurgedImage).order_by(PurgedImage.id.desc())
    if filename:
        q = q.filter(PurgedImage.filename == filename)
    rows = q.limit(limit).all()
    return [r.to_dict() for r in rows]

@router.post("/scan")
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

@router.post("/cleanup-orphaned")
async def cleanup_orphaned_images(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Clean up orphaned images (database entries with missing files)"""
    # Create a job to track progress
    job = Job(
        type="cleanup_orphaned",
        status="pending",
        progress=0,
        total_items=0,
        processed_items=0,
        parameters={},
        created_at=datetime.now()
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    scanner = ImageScanner()

    # Use a fresh DB session in background to avoid closed-session issues
    def _run_cleanup():
        session = SessionLocal()
        try:
            # Count total images for the job
            total_images = session.query(Image).count()
            job_record = session.query(Job).filter(Job.id == job.id).first()
            if job_record:
                job_record.total_items = total_images
                session.commit()
            
            # Run the cleanup
            scanner.cleanup_orphaned_images(session, job_id=job.id)
        finally:
            session.close()

    background_tasks.add_task(_run_cleanup)
    return {"message": "Orphaned image cleanup started", "job_id": job.id}

@router.post("/purge-one-star-images")
async def purge_one_star_images(db: Session = Depends(get_db)):
    """Purge all 1-star rated images and blacklist them from future scans"""
    try:
        # Find all 1-star images
        one_star_images = db.query(Image).filter(Image.rating == 1).all()
        
        if not one_star_images:
            return {"message": "No 1-star images found", "purged_count": 0, "blacklisted_count": 0}
        
        purged_count = 0
        blacklisted_count = 0
        
        for image in one_star_images:
            # Create blacklist entry before deleting
            add_blacklist_entry(db, image, "1-star rating")
            blacklisted_count += 1
            
            # Clear many-to-many associations to satisfy FK constraints (PostgreSQL)
            try:
                image.tags = []
                image.categories = []
            except Exception:
                # If relationships are not loaded or fail to clear, continue with deletion attempt
                pass

            # Remove the image from database
            db.delete(image)
            purged_count += 1
        
        # Commit all changes
        db.commit()
        
        return {
            "message": f"Purged {purged_count} 1-star images and added {blacklisted_count} to blacklist",
            "purged_count": purged_count,
            "blacklisted_count": blacklisted_count
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to purge 1-star images: {str(e)}")
