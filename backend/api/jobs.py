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
    only_videos: bool = False

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
    try:
        # Enforce reasonable limits
        limit = min(limit, 100)  # Max 100 jobs
        
        query = db.query(Job)
        
        if job_type:
            query = query.filter(Job.type == job_type)
        
        if status:
            query = query.filter(Job.status == status)
        
        jobs = query.order_by(Job.created_at.desc()).limit(limit).all()
        return [JobResponse(**job.to_dict()) for job in jobs]
        
    except Exception as e:
        print(f"Error in get_jobs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch jobs")

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

@router.post("/indexing-clips")
async def start_indexing_clips_job(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Start a clips-only indexing job (scans /clips mount)."""
    existing_job = db.query(Job).filter(
        Job.type == "indexing_clips",
        Job.status.in_(["pending", "running"]) 
    ).first()
    if existing_job:
        return {"message": "Indexing clips job already running", "job_id": existing_job.id}

    job = Job(type="indexing_clips", parameters={"paths": ["/clips"]})
    db.add(job)
    db.commit()
    db.refresh(job)

    from backend.services.image_scanner import ImageScanner
    scanner = ImageScanner()

    def _run_indexing_clips(job_id: int):
        session = SessionLocal()
        try:
            # Video-only scan for clips path to minimize overhead
            scanner.scan_library(session, job_id, library_paths=["/clips"], media_filter='video') 
        finally:
            session.close()

    background_tasks.add_task(_run_indexing_clips, job.id)
    return {"message": "Indexing clips job started", "job_id": job.id}

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
    job_type = "clip_thumbnailing" if body.only_videos else "thumbnailing"
    job = Job(type=job_type, parameters={"force_regenerate": body.force_regenerate, "only_videos": body.only_videos})
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Start background task
    from backend.services.thumbnail_generator import ThumbnailGenerator
    generator = ThumbnailGenerator()

    def _run_thumbnails(job_id: int, force_regen: bool, only_videos: bool):
        session = SessionLocal()
        try:
            generator.generate_thumbnails(session, job_id, force_regen, only_videos)
        finally:
            session.close()

    background_tasks.add_task(_run_thumbnails, job.id, body.force_regenerate, body.only_videos)
    
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
    """Force-kill all running jobs (used when a job stalls).
    For simplicity, mark all jobs with status 'running' as 'failed' with an error message.
    """
    try:
        running_jobs = db.query(Job).filter(Job.status == 'running').all()
        killed = []
        from datetime import datetime
        for job in running_jobs:
            job.status = 'failed'
            job.error_message = (job.error_message or '') + ' [Force killed by user]'
            job.completed_at = datetime.now()
            killed.append(job.id)
        db.commit()
        return {"message": f"Force-killed {len(killed)} running job(s)", "killed_jobs": killed}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to force-kill jobs: {e}")
