import sys
sys.path.append('/app')
sys.path.append('.')

from backend.models import SessionLocal, Job
from datetime import datetime

session = SessionLocal()

# Find all running jobs
running_jobs = session.query(Job).filter(Job.status == 'running').all()

print(f"Found {len(running_jobs)} jobs marked as running:")

for job in running_jobs:
    print(f"  Job ID {job.id}: {job.type} - Progress: {job.progress}% - Started: {job.started_at}")
    
    # Mark as completed if it has high progress, failed if low progress
    if job.progress and job.progress > 80:
        job.status = 'completed'
        job.completed_at = datetime.now()
        print(f"    -> Marked as completed (high progress)")
    else:
        job.status = 'failed'
        job.error_message = 'Job process terminated unexpectedly'
        job.completed_at = datetime.now()
        print(f"    -> Marked as failed (process terminated)")

session.commit()
session.close()

print("Job cleanup completed!")