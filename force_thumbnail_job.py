#!/usr/bin/env python3
"""
Force run thumbnail generation directly without background tasks
"""
import sys
sys.path.append('/app')
sys.path.append('.')

from backend.models import SessionLocal, Job
from backend.services.thumbnail_generator import ThumbnailGenerator
from datetime import datetime

def force_run_thumbnails():
    session = SessionLocal()
    try:
        # Find a pending thumbnail job
        pending_job = session.query(Job).filter(
            Job.type == 'thumbnailing',
            Job.status == 'pending'
        ).first()
        
        if not pending_job:
            print("No pending thumbnail job found")
            return
        
        print(f"Found pending job ID {pending_job.id}")
        
        # Update job status to running
        pending_job.status = 'running'
        pending_job.started_at = datetime.now()
        session.commit()
        
        print("Starting thumbnail generation directly...")
        
        # Create thumbnail generator and run it
        generator = ThumbnailGenerator()
        
        # Run the thumbnail generation with progress updates
        try:
            generator.generate_thumbnails(session, pending_job.id, force_regenerate=False)
            print("Thumbnail generation completed successfully!")
        except Exception as e:
            print(f"Thumbnail generation failed: {e}")
            pending_job.status = 'failed'
            pending_job.error_message = str(e)
            pending_job.completed_at = datetime.now()
            session.commit()
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    force_run_thumbnails()