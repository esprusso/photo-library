from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from backend.models import get_db, Image, Tag, Category
from backend.services.image_scanner import ImageScanner
from backend.models import SessionLocal

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