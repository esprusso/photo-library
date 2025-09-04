import os
import shutil
import hashlib
from pathlib import Path
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from backend.models import Image


class MediaManager:
    """Manages local copies of media files for reliable serving"""
    
    def __init__(self, media_dir: str = "/data/media"):
        self.media_dir = Path(media_dir)
        self.media_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_file_hash(self, file_path: str) -> str:
        """Generate hash for file to create unique filename"""
        hasher = hashlib.md5()
        hasher.update(file_path.encode('utf-8'))
        return hasher.hexdigest()
    
    def _get_local_path(self, original_path: str, filename: str) -> Path:
        """Get the local media path for an original file"""
        file_hash = self._get_file_hash(original_path)
        file_ext = Path(filename).suffix.lower()
        local_filename = f"{file_hash}{file_ext}"
        return self.media_dir / local_filename
    
    def ensure_local_copy(self, original_path: str, filename: str) -> Optional[str]:
        """Ensure a local copy exists, creating it if necessary"""
        # Handle volume mapping for source path
        source_path = original_path
        if original_path.startswith('/volume1/Heritage/AI Art'):
            source_path = original_path.replace('/volume1/Heritage/AI Art', '/library')
        
        if not os.path.exists(source_path):
            print(f"ERROR: Source file not found: {source_path}")
            return None
        
        local_path = self._get_local_path(original_path, filename)
        
        # If local copy already exists and is newer or same size, use it
        if local_path.exists():
            try:
                source_stat = os.stat(source_path)
                local_stat = os.stat(local_path)
                
                # If local file is same size and newer or equal time, assume it's good
                if (local_stat.st_size == source_stat.st_size and 
                    local_stat.st_mtime >= source_stat.st_mtime):
                    return str(local_path)
            except OSError:
                pass
        
        # Copy the file locally
        try:
            print(f"Copying {source_path} to {local_path}")
            shutil.copy2(source_path, local_path)
            return str(local_path)
        except Exception as e:
            print(f"ERROR: Failed to copy {source_path} to {local_path}: {e}")
            return None
    
    def update_image_local_path(self, db: Session, image: Image) -> bool:
        """Update an image record with its local media path"""
        if not image.path:
            return False
        
        local_path = self.ensure_local_copy(image.path, image.filename)
        if local_path:
            image.local_path = local_path
            db.commit()
            return True
        
        return False
    
    def cleanup_orphaned_files(self, db: Session):
        """Remove local media files that no longer have database records"""
        # Get all local_path values from database
        db_paths = {img.local_path for img in db.query(Image).filter(Image.local_path.isnot(None)).all()}
        
        # Check all files in media directory
        for media_file in self.media_dir.iterdir():
            if media_file.is_file() and str(media_file) not in db_paths:
                try:
                    print(f"Removing orphaned media file: {media_file}")
                    media_file.unlink()
                except Exception as e:
                    print(f"Error removing {media_file}: {e}")
    
    def get_media_stats(self) -> dict:
        """Get statistics about media directory"""
        if not self.media_dir.exists():
            return {"exists": False}
        
        files = list(self.media_dir.iterdir())
        total_size = sum(f.stat().st_size for f in files if f.is_file())
        
        return {
            "exists": True,
            "path": str(self.media_dir),
            "file_count": len([f for f in files if f.is_file()]),
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "total_size_bytes": total_size
        }