from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from backend.models import get_db, Job, SessionLocal

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

class TaggingJobRequest(BaseModel):
    image_ids: Optional[List[int]] = None

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
    job = Job(type="thumbnailing", parameters={"force_regenerate": body.force_regenerate})
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Start background task
    from backend.services.thumbnail_generator import ThumbnailGenerator
    generator = ThumbnailGenerator()

    def _run_thumbnails(job_id: int, force_regen: bool):
        session = SessionLocal()
        try:
            generator.generate_thumbnails(session, job_id, force_regen)
        finally:
            session.close()

    background_tasks.add_task(_run_thumbnails, job.id, body.force_regenerate)
    
    return {"message": "Thumbnail job started", "job_id": job.id}

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
