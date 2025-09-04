import sys
sys.path.append('/app')
sys.path.append('.')

from backend.models import SessionLocal, Job
from backend.services.thumbnail_generator import ThumbnailGenerator
from datetime import datetime

session = SessionLocal()

job = Job(type='thumbnailing', parameters={'force_regenerate': False})
session.add(job)
session.commit()
session.refresh(job)

print(f"Created job ID {job.id}")

job.status = 'running'
job.started_at = datetime.now()
session.commit()

print("Starting thumbnails...")

generator = ThumbnailGenerator()
generator.generate_thumbnails(session, job.id, False)

session.close()
print("Done!")
