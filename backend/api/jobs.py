from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import os

from backend.models import get_db, Job, SessionLocal
from backend.models import Image
from backend.services.metadata_extractor import MetadataExtractor

router = APIRouter()

class JobResponse(BaseModel):
    id: int
    type: str
    status: str
    progress: int
    total_items: int
    processed_items: int
    parameters: Optional[dict]
    result: Optional[dict]
    error_message: Optional[str]
    created_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]

class JobCreate(BaseModel):
    type: str
    parameters: Optional[dict] = None

class ThumbnailJobRequest(BaseModel):
    force_regenerate: bool = False
    size: Optional[int] = None  # Desired longest-side size in pixels

class TaggingJobRequest(BaseModel):
    image_ids: Optional[List[int]] = None

class RefreshExifRequest(BaseModel):
    only_missing: bool = False

@router.get("/", response_model=List[JobResponse])
async def get_jobs(
    job_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get jobs with optional filtering"""
    query = db.query(Job)
    
    if job_type:
        query = query.filter(Job.type == job_type)
    
    if status:
        query = query.filter(Job.status == status)
    
    jobs = query.order_by(Job.created_at.desc()).limit(limit).all()
    return [JobResponse(**job.to_dict()) for job in jobs]

@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: int, db: Session = Depends(get_db)):
    """Get a specific job by ID"""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobResponse(**job.to_dict())

@router.post("/indexing")
async def start_indexing_job(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Start a library indexing job"""
    # Check if there's already a running indexing job
    existing_job = db.query(Job).filter(
        Job.type == "indexing",
        Job.status.in_(["pending", "running"])
    ).first()
    
    if existing_job:
        return {"message": "Indexing job already running", "job_id": existing_job.id}
    
    # Create new job
    job = Job(type="indexing", parameters={})
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Start background task
    from backend.services.image_scanner import ImageScanner
    scanner = ImageScanner()

    def _run_indexing(job_id: int):
        session = SessionLocal()
        try:
            scanner.scan_library(session, job_id)
        finally:
            session.close()

    background_tasks.add_task(_run_indexing, job.id)
    
    return {"message": "Indexing job started", "job_id": job.id}

@router.post("/thumbnails")
async def start_thumbnail_job(
    background_tasks: BackgroundTasks,
    body: ThumbnailJobRequest,
    db: Session = Depends(get_db)
):
    """Start a thumbnail generation job"""
    # Check if there's already a running thumbnail job
    existing_job = db.query(Job).filter(
        Job.type == "thumbnailing",
        Job.status.in_(["pending", "running"])
    ).first()
    
    if existing_job:
        return {"message": "Thumbnail job already running", "job_id": existing_job.id}
    
    # Create new job
    job = Job(type="thumbnailing", parameters={"force_regenerate": body.force_regenerate, "size": body.size})
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Start background task
    from backend.services.thumbnail_generator import ThumbnailGenerator
    generator = ThumbnailGenerator(thumbnail_size=body.size)

    def _run_thumbnails(job_id: int, force_regen: bool):
        session = SessionLocal()
        try:
            generator.generate_thumbnails(session, job_id, force_regen)
        finally:
            session.close()

    background_tasks.add_task(_run_thumbnails, job.id, body.force_regenerate)
    
    return {"message": "Thumbnail job started", "job_id": job.id}

@router.post("/purge-thumbnails")
async def purge_thumbnails(db: Session = Depends(get_db)):
    """Delete all generated thumbnails from the thumbnails directory.
    Does not modify database records.
    """
    import os
    import shutil
    THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")

    if not os.path.exists(THUMBNAILS_DIR):
        return {"message": "No thumbnails directory found", "deleted": 0}

    deleted = 0
    for name in os.listdir(THUMBNAILS_DIR):
        path = os.path.join(THUMBNAILS_DIR, name)
        try:
            if os.path.isfile(path) and name.lower().endswith('.jpg'):
                os.remove(path)
                deleted += 1
        except Exception:
            # ignore individual removal errors
            pass

    return {"message": f"Deleted {deleted} thumbnail files", "deleted": deleted}

@router.get("/thumbnails/status")
async def thumbnails_status(db: Session = Depends(get_db)):
    """Return counts of existing thumbnail files vs total images."""
    THUMBNAILS_DIR = os.getenv("THUMBNAILS_DIR", "/thumbnails")
    # Count images in DB
    total_images = db.query(Image).count()
    # Count thumbnail jpg files
    existing = 0
    try:
        existing = len([f for f in os.listdir(THUMBNAILS_DIR) if f.lower().endswith('.jpg')])
    except Exception:
        existing = 0
    missing = max(0, total_images - existing)
    return {"total_images": total_images, "thumbnails": existing, "missing": missing}

@router.post("/tagging")
async def start_tagging_job(
    background_tasks: BackgroundTasks,
    body: TaggingJobRequest,
    db: Session = Depends(get_db)
):
    """Start an auto-tagging job"""
    # Check if there's already a running tagging job
    existing_job = db.query(Job).filter(
        Job.type == "tagging",
        Job.status.in_(["pending", "running"])
    ).first()
    
    if existing_job:
        return {"message": "Tagging job already running", "job_id": existing_job.id}
    
    # Create new job
    job = Job(
        type="tagging", 
        parameters={"image_ids": body.image_ids} if body.image_ids else {}
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Start background task (placeholder for ML worker integration)
    # This would typically send a message to the ML worker service
    background_tasks.add_task(_placeholder_tagging_job, job.id)
    
    return {"message": "Tagging job started", "job_id": job.id}

@router.post("/refresh-exif")
async def start_refresh_exif_job(
    body: RefreshExifRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Start a job to refresh EXIF/metadata for images (all or only missing)."""
    existing_job = db.query(Job).filter(
        Job.type == "refresh-exif",
        Job.status.in_(["pending", "running"])
    ).first()
    if existing_job:
        return {"message": "Refresh EXIF job already running", "job_id": existing_job.id}

    job = Job(type="refresh-exif", parameters={"only_missing": body.only_missing})
    db.add(job)
    db.commit()
    db.refresh(job)

    def _run(job_id: int, only_missing: bool):
        session = SessionLocal()
        try:
            from datetime import datetime as dt
            j = session.query(Job).filter(Job.id == job_id).first()
            if not j:
                return
            j.status = 'running'
            j.started_at = dt.now()
            session.commit()

            q = session.query(Image)
            if only_missing:
                q = q.filter(
                    (Image.camera_make.is_(None)) &
                    (Image.camera_model.is_(None)) &
                    (Image.date_taken.is_(None))
                )
            items = q.all()
            total = len(items)
            j.total_items = total
            j.processed_items = 0
            j.progress = 0
            session.commit()

            extractor = MetadataExtractor()
            processed = 0
            for im in items:
                try:
                    path = im.path
                    if not path or not os.path.exists(path):
                        continue
                    md = extractor.extract_metadata(path)
                    image_info = md.get('image_info', {})
                    normalized = md.get('normalized', {})
                    im.file_size = md.get('file_info', {}).get('size', im.file_size)
                    im.width = image_info.get('width') or im.width
                    im.height = image_info.get('height') or im.height
                    im.aspect_ratio = image_info.get('aspect_ratio') or im.aspect_ratio
                    im.format = image_info.get('format') or im.format
                    im.camera_make = normalized.get('camera_make') or im.camera_make
                    im.camera_model = normalized.get('camera_model') or im.camera_model
                    im.lens_model = normalized.get('lens_model') or im.lens_model
                    im.focal_length = normalized.get('focal_length') or im.focal_length
                    im.aperture = normalized.get('aperture') or im.aperture
                    im.shutter_speed = normalized.get('shutter_speed') or im.shutter_speed
                    im.iso = normalized.get('iso') or im.iso
                    if normalized.get('flash_used') is not None:
                        im.flash_used = normalized.get('flash_used')
                    im.date_taken = normalized.get('date_taken') or im.date_taken
                except Exception:
                    pass
                processed += 1
                if total:
                    j.processed_items = processed
                    j.progress = int(processed * 100 / total)
                if processed % 50 == 0:
                    session.commit()

            j.processed_items = processed
            j.progress = 100
            j.status = 'completed'
            j.completed_at = dt.now()
            session.commit()
        finally:
            session.close()

    background_tasks.add_task(_run, job.id, body.only_missing)
    return {"message": "Refresh EXIF job started", "job_id": job.id}

@router.delete("/{job_id}")
async def cancel_job(job_id: int, db: Session = Depends(get_db)):
    """Cancel a pending job"""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status == "running":
        raise HTTPException(status_code=400, detail="Cannot cancel running job")
    
    if job.status in ["completed", "failed"]:
        raise HTTPException(status_code=400, detail="Job already finished")
    
    job.status = "cancelled"
    db.commit()
    
    return {"message": "Job cancelled"}

@router.post("/{job_id}/force-kill")
async def force_kill_job(job_id: int, db: Session = Depends(get_db)):
    """Force-kill a specific running job immediately by marking it failed.
    Note: This does not terminate background execution, but updates job state so the UI reflects failure.
    """
    from datetime import datetime

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "running":
        raise HTTPException(status_code=400, detail="Job is not running")

    job.status = "failed"
    job.error_message = "Job was force-killed by user"
    job.completed_at = datetime.now()
    db.commit()

    return {"message": f"Force-killed job #{job.id}", "job_id": job.id}

async def _placeholder_tagging_job(job_id: int):
    """Placeholder for ML tagging job - would integrate with ML worker"""
    import asyncio
    # Simulate minimal work
    await asyncio.sleep(1)
    # Mark job completed
    session = SessionLocal()
    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "completed"
            job.progress = 100
            job.result = job.result or {"message": "Tagging placeholder completed"}
            session.commit()
    finally:
        session.close()

@router.post("/force-kill-stalled")
async def force_kill_stalled_jobs(db: Session = Depends(get_db)):
    """Force-kill all running jobs that have been stalled (no progress in last 5 minutes)"""
    from datetime import datetime, timedelta
    
    # Find jobs that are "running" but haven't been updated recently
    five_minutes_ago = datetime.now() - timedelta(minutes=5)
    
    stalled_jobs = db.query(Job).filter(
        Job.status == "running",
        Job.started_at < five_minutes_ago  # Started more than 5 minutes ago
    ).all()
    
    if not stalled_jobs:
        return {"message": "No stalled jobs found"}
    
    killed_jobs = []
    for job in stalled_jobs:
        # Force mark as failed with a clear message
        job.status = "failed"
        job.error_message = "Job was killed due to being stalled/unresponsive"
        job.completed_at = datetime.now()
        killed_jobs.append({
            "id": job.id,
            "type": job.type,
            "progress": f"{job.processed_items or 0}/{job.total_items or 0}"
        })
    
    db.commit()
    
    return {
        "message": f"Force-killed {len(killed_jobs)} stalled jobs",
        "killed_jobs": killed_jobs
    }
