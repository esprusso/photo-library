#!/usr/bin/env python3
"""
Create and immediately run a new thumbnail job
"""
import sys
sys.path.append('/app')
sys.path.append('.')

from backend.models import SessionLocal, Job
from backend.services.thumbnail_generator import ThumbnailGenerator
from datetime import datetime

def create_and_run_thumbnail_job():
    """Create and run a new thumbnail job"""
    session = SessionLocal()
    try:
        # Create new job
        new_job = Job(
            type='thumbnailing',
            parameters={'force_regenerate': False}
        )
        session.add(new_job)
        session.commit()
        session.refresh(new_job)
        
        print(f"Created new thumbnail job ID {new_job.id}")
        
        # Start the job immediately
        new_job.status = 'running'
        new_job.started_at = datetime.now()
        session.commit()
        
        print("Starting thumbnail generation...")
        
        # Create thumbnail generator and run it
        generator = ThumbnailGenerator()
        
        try:
            generator.generate_thumbnails(session, new_job.id, force_regenerate=False)
            print("Thumbnail generation completed successfully!")
        except Exception as e:
            print(f"Thumbnail generation failed: {e}")
            new_job.status = 'failed'
            new_job.error_message = str(e)
            new_job.completed_at = datetime.now()
            session.commit()
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    create_and_run_thumbnail_job()