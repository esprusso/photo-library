import os
from datetime import datetime
from typing import Optional
from PIL import Image as PILImage
from sqlalchemy.orm import Session
import subprocess
import shutil

from backend.models import Image, Job
import magic


class ThumbnailGenerator:
    """Generate thumbnails for images"""
    
    def __init__(self, thumbnail_size: int = None):
        self.thumbnail_size = thumbnail_size or int(os.getenv('THUMBNAIL_SIZE', 256))
        self.thumbnail_dir = os.getenv('THUMBNAILS_DIR', '/thumbnails')
        self.quality = 85
        
        # Ensure thumbnail directory exists
        os.makedirs(self.thumbnail_dir, exist_ok=True)
    
    def generate_thumbnails(self, db: Session, job_id: Optional[int] = None, force_regenerate: bool = False):
        """Generate thumbnails for all images"""
        
        if job_id:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = 'running'
                job.started_at = datetime.now()
                db.commit()
        
        try:
            # Get all images
            images = db.query(Image).all()
            
            if job_id:
                job.total_items = len(images)
                db.commit()
            
            processed_count = 0
            generated_count = 0
            skipped_count = 0
            error_count = 0
            
            for image in images:
                try:
                    result = self._generate_thumbnail(image, force_regenerate)
                    
                    if result == 'generated':
                        generated_count += 1
                    elif result == 'skipped':
                        skipped_count += 1
                    elif result == 'error':
                        error_count += 1
                    
                    processed_count += 1
                    
                    if job_id and processed_count % 10 == 0:
                        # Update progress every 10 items
                        job.processed_items = processed_count
                        job.progress = int((processed_count / len(images)) * 100)
                        db.commit()
                
                except Exception as e:
                    print(f"Error generating thumbnail for {image.path}: {e}")
                    error_count += 1
                    continue
            
            if job_id:
                job.status = 'completed'
                job.completed_at = datetime.now()
                job.processed_items = processed_count
                job.progress = 100
                job.result = {
                    'processed': processed_count,
                    'generated': generated_count,
                    'skipped': skipped_count,
                    'errors': error_count
                }
                db.commit()
                
        except Exception as e:
            if job_id:
                job.status = 'failed'
                job.error_message = str(e)
                db.commit()
            raise e
    
    def _generate_thumbnail(self, image: Image, force_regenerate: bool = False) -> str:
        """Generate thumbnail for a single image"""
        thumbnail_path = os.path.join(self.thumbnail_dir, f"{image.id}.jpg")
        
        # Skip if thumbnail exists and we're not forcing regeneration
        if os.path.exists(thumbnail_path) and not force_regenerate:
            return 'skipped'
        
        # Get the actual file path (handle path mapping)
        source_path = self._get_image_file_path(image)
        if not source_path or not os.path.exists(source_path):
            print(f"DEBUG: Source image not found for thumbnail generation: {image.path}")
            return 'error'
        
        try:
            # Check file extension first (more reliable for AI-generated images)
            file_ext = os.path.splitext(source_path)[1].lower()
            valid_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif'}
            
            if file_ext not in valid_extensions:
                # Only check MIME if extension is suspicious
                try:
                    mime = magic.from_file(source_path, mime=True)
                    if not (isinstance(mime, str) and mime.startswith('image/')):
                        print(f"Unsupported file: {file_ext} extension with {mime} mime type — {source_path}")
                        return 'error'
                except Exception:
                    # If libmagic fails, continue and let PIL try
                    pass

            # Try multiple approaches for problematic AI-generated images
            img = None
            try:
                # Standard PIL approach
                img = PILImage.open(source_path)
            except Exception as pil_error:
                print(f"Standard PIL failed for {source_path}: {pil_error}")
                # Try forcing RGB mode for problematic files
                try:
                    from PIL import ImageFile
                    ImageFile.LOAD_TRUNCATED_IMAGES = True
                    img = PILImage.open(source_path)
                    if img.mode in ('RGBA', 'LA'):
                        img = img.convert('RGB')
                except Exception as force_error:
                    print(f"Forced RGB conversion failed for {source_path}: {force_error}")
                    raise pil_error  # Re-raise original error
            
            with img:
                # Convert RGBA to RGB if necessary
                if img.mode == 'RGBA':
                    # Create white background
                    background = PILImage.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[-1])  # Use alpha channel as mask
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Calculate thumbnail size maintaining aspect ratio
                img.thumbnail((self.thumbnail_size, self.thumbnail_size), PILImage.Resampling.LANCZOS)
                
                # Save thumbnail
                img.save(thumbnail_path, 'JPEG', quality=self.quality, optimize=True)
                
            return 'generated'
            
        except Exception as e:
            error_msg = str(e).lower()
            
            # Classify different types of errors
            if 'cannot identify image file' in error_msg:
                print(f"PIL cannot identify image format: {source_path}")
            elif 'truncated' in error_msg or 'incomplete' in error_msg:
                print(f"Truncated/incomplete image file: {source_path}")
            elif 'unsupported' in error_msg:
                print(f"Unsupported image format: {source_path}")
            else:
                print(f"Other image processing error for {source_path}: {e}")
            
            # Don't immediately give up - these might still be processable
            
            try:
                mime = magic.from_file(source_path, mime=True)
                print(f"Error creating thumbnail for {source_path} (mime={mime}): {e}")
            except Exception:
                print(f"Error creating thumbnail for {source_path}: {e}")
            
            # Try alternative PIL approaches before giving up
            try:
                # Alternative approach: try opening with verify=False
                print(f"Trying alternative PIL approach for {source_path}")
                with PILImage.open(source_path) as alt_img:
                    alt_img.verify = lambda: None  # Disable verification
                    alt_img.load()
                    
                    # Convert to RGB if needed
                    if alt_img.mode in ('RGBA', 'LA', 'P'):
                        if alt_img.mode == 'RGBA':
                            background = PILImage.new('RGB', alt_img.size, (255, 255, 255))
                            background.paste(alt_img, mask=alt_img.split()[-1])
                            alt_img = background
                        else:
                            alt_img = alt_img.convert('RGB')
                    
                    # Generate thumbnail
                    alt_img.thumbnail((self.thumbnail_size, self.thumbnail_size), PILImage.Resampling.LANCZOS)
                    alt_img.save(thumbnail_path, 'JPEG', quality=self.quality, optimize=True)
                    print(f"Alternative PIL approach succeeded for {source_path}")
                    return 'generated'
                    
            except Exception as alt_error:
                print(f"Alternative PIL approach also failed for {source_path}: {alt_error}")
            
            # Skip FFmpeg fallback for now as it's not properly configured
            print(f"Skipping problematic image: {source_path}")
            return 'error'

    def _ffmpeg_thumbnail(self, src_path: str, dst_path: str) -> bool:
        size = self.thumbnail_size
        # Scale down preserving aspect ratio; pick first frame; output JPEG
        vf = f"scale=w={size}:h={size}:force_original_aspect_ratio=decrease"
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", src_path,
            "-vf", vf,
            "-frames:v", "1",
            dst_path,
        ]
        try:
            subprocess.run(cmd, check=True)
            return os.path.exists(dst_path)
        except subprocess.CalledProcessError as e:
            print(f"ffmpeg thumbnail failed for {src_path}: {e}")
            return False
    
    def generate_single_thumbnail(self, image: Image, force_regenerate: bool = False) -> bool:
        """Generate thumbnail for a single image"""
        result = self._generate_thumbnail(image, force_regenerate)
        return result == 'generated'
    
    def get_thumbnail_path(self, image_id: int) -> str:
        """Get the path to a thumbnail"""
        return os.path.join(self.thumbnail_dir, f"{image_id}.jpg")
    
    def thumbnail_exists(self, image_id: int) -> bool:
        """Check if a thumbnail exists"""
        return os.path.exists(self.get_thumbnail_path(image_id))
    
    def _get_image_file_path(self, image: Image) -> Optional[str]:
        """Get the actual file path for an image (handle path mapping)"""
        # First try local media copy
        if image.local_path and os.path.exists(image.local_path):
            return image.local_path
        
        # Fallback to original path with volume mapping
        if not image.path:
            return None
        
        # If file exists at original path, use it
        if os.path.exists(image.path):
            return image.path
        
        # Check if path needs mapping from host to container
        if image.path.startswith('/volume1/Heritage/AI Art'):
            container_path = image.path.replace('/volume1/Heritage/AI Art', '/library')
            if os.path.exists(container_path):
                return container_path
        
        # Check if path is already using container mount point
        if image.path.startswith('/library'):
            if os.path.exists(image.path):
                return image.path
        
        return None
    
    def cleanup_orphaned_thumbnails(self, db: Session) -> int:
        """Remove thumbnails for images that no longer exist in the database"""
        if not os.path.exists(self.thumbnail_dir):
            return 0
        
        # Get all image IDs from database
        image_ids = {str(img_id[0]) for img_id in db.query(Image.id).all()}
        
        # Find orphaned thumbnails
        orphaned_count = 0
        for filename in os.listdir(self.thumbnail_dir):
            if filename.endswith('.jpg'):
                thumbnail_id = filename[:-4]  # Remove .jpg extension
                if thumbnail_id not in image_ids:
                    thumbnail_path = os.path.join(self.thumbnail_dir, filename)
                    try:
                        os.remove(thumbnail_path)
                        orphaned_count += 1
                    except OSError:
                        pass
        
        return orphaned_count
