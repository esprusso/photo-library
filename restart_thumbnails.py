#!/usr/bin/env python3
"""
Restart stalled thumbnail generation
"""
import sys
sys.path.append('/app')
sys.path.append('.')

from backend.models import SessionLocal, Job
from datetime import datetime

def restart_thumbnail_job():
    session = SessionLocal()
    try:
        # Find running thumbnail job
        running_job = session.query(Job).filter(
            Job.type == 'thumbnailing',
            Job.status == 'running'
        ).first()
        
        if running_job:
            print(f"Found stalled job ID {running_job.id}")
            print(f"Progress was: {running_job.processed_items}/{running_job.total_items} ({running_job.progress}%)")
            
            # Mark as failed
            running_job.status = 'failed'
            running_job.error_message = 'Job stalled - manually restarted'
            running_job.completed_at = datetime.now()
            session.commit()
            print("Marked stalled job as failed")
        else:
            print("No running thumbnail job found")
        
        # Create new job
        new_job = Job(
            type='thumbnailing',
            parameters={'force_regenerate': False}
        )
        session.add(new_job)
        session.commit()
        session.refresh(new_job)
        
        print(f"Created new thumbnail job ID {new_job.id}")
        print("You can now trigger this job through your frontend or API")
        
    finally:
        session.close()

if __name__ == "__main__":
    restart_thumbnail_job()