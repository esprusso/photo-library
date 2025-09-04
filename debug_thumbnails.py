#!/usr/bin/env python3
"""
Debug script to check thumbnail generation status
Run this from inside the backend container or with proper environment setup
"""
import os
import sys
import json
from datetime import datetime

# Add backend to path
sys.path.append('/app')
sys.path.append('.')

try:
    from backend.models import SessionLocal, Image, Job
    from backend.services.thumbnail_generator import ThumbnailGenerator
    
    def check_thumbnail_status():
        """Check thumbnail generation status"""
        session = SessionLocal()
        
        try:
            print("=== THUMBNAIL GENERATION DEBUG ===")
            print(f"Timestamp: {datetime.now()}")
            print()
            
            # Check environment
            print("=== ENVIRONMENT ===")
            print(f"THUMBNAILS_DIR: {os.getenv('THUMBNAILS_DIR', 'not set')}")
            thumbnails_dir = os.getenv('THUMBNAILS_DIR', '/thumbnails')
            print(f"Thumbnails directory exists: {os.path.exists(thumbnails_dir)}")
            if os.path.exists(thumbnails_dir):
                try:
                    files = os.listdir(thumbnails_dir)
                    print(f"Files in thumbnails directory: {len(files)}")
                    if files:
                        print(f"First 10 files: {files[:10]}")
                except Exception as e:
                    print(f"Error listing thumbnails directory: {e}")
            print()
            
            # Check database images
            print("=== DATABASE IMAGES ===")
            total_images = session.query(Image).count()
            print(f"Total images in database: {total_images}")
            
            if total_images > 0:
                recent_images = session.query(Image).order_by(Image.id.desc()).limit(5).all()
                print("Recent 5 images:")
                for img in recent_images:
                    exists = os.path.exists(img.path) if img.path else False
                    print(f"  ID {img.id}: {img.filename} - Path exists: {exists}")
            print()
            
            # Check jobs
            print("=== THUMBNAIL JOBS ===")
            thumbnail_jobs = session.query(Job).filter(Job.type == 'thumbnailing').order_by(Job.created_at.desc()).limit(5).all()
            print(f"Total thumbnail jobs: {len(thumbnail_jobs)}")
            
            for job in thumbnail_jobs:
                print(f"  Job ID {job.id}: {job.status} - Progress: {job.progress}% - Created: {job.created_at}")
                if job.error_message:
                    print(f"    Error: {job.error_message}")
                if job.result:
                    print(f"    Result: {job.result}")
            print()
            
            # Check thumbnail generator
            print("=== THUMBNAIL GENERATOR TEST ===")
            generator = ThumbnailGenerator()
            print(f"Thumbnail generator config:")
            print(f"  Size: {generator.thumbnail_size}")
            print(f"  Directory: {generator.thumbnail_dir}")
            print(f"  Quality: {generator.quality}")
            
            # Test on first image if available
            if total_images > 0:
                first_image = session.query(Image).first()
                print(f"Testing thumbnail generation for image ID {first_image.id}")
                print(f"  Original path: {first_image.path}")
                print(f"  File exists: {os.path.exists(first_image.path) if first_image.path else False}")
                
                thumbnail_path = generator.get_thumbnail_path(first_image.id)
                print(f"  Thumbnail path: {thumbnail_path}")
                print(f"  Thumbnail exists: {generator.thumbnail_exists(first_image.id)}")
                
                # Try to generate one thumbnail
                try:
                    result = generator._generate_thumbnail(first_image, force_regenerate=True)
                    print(f"  Generation result: {result}")
                    print(f"  Thumbnail exists after generation: {generator.thumbnail_exists(first_image.id)}")
                except Exception as e:
                    print(f"  Generation error: {e}")
            
        finally:
            session.close()
    
    if __name__ == "__main__":
        check_thumbnail_status()
        
except ImportError as e:
    print(f"Import error: {e}")
    print("This script needs to be run from the backend container or with proper Python path setup")