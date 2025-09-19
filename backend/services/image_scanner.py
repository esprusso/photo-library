import os
import hashlib
import re
from datetime import datetime
from typing import List, Set, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from backend.models import Image, Job, Category, PurgedImage
from backend.services.metadata_extractor import MetadataExtractor
from backend.services.thumbnail_generator import ThumbnailGenerator
from backend.services.media_manager import MediaManager
from backend.utils.file_fingerprint import compute_file_hash


class ImageScanner:
    """Scan directories for images and update the database"""
    
    def __init__(self):
        self.metadata_extractor = MetadataExtractor()
        self.thumbnail_generator = ThumbnailGenerator()
        self.media_manager = MediaManager()
        
        # Check if RAW files should be excluded
        exclude_raw = os.getenv('EXCLUDE_RAW_FILES', 'false').lower() == 'true'
        raw_extensions = {'.cr2', '.nef', '.arw', '.dng', '.orf', '.raf', '.rw2'}
        base_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif', '.bmp'}
        
        if exclude_raw:
            self.supported_extensions = base_extensions
            print("RAW files excluded from scanning")
        else:
            self.supported_extensions = base_extensions | raw_extensions
            print("RAW files included in scanning")
    
    def scan_library(self, db: Session, job_id: Optional[int] = None):
        """Scan all configured library paths for images"""
        library_paths = self._get_library_paths()
        
        if job_id:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = 'running'
                job.started_at = datetime.now()
                db.commit()
        
        try:
            all_image_paths = []
            
            # Collect all image files
            for library_path in library_paths:
                if os.path.exists(library_path):
                    image_paths = self._scan_directory(library_path)
                    all_image_paths.extend(image_paths)
            
            if job_id:
                job.total_items = len(all_image_paths)
                db.commit()
            
            # Process each image
            processed_count = 0
            added_count = 0
            updated_count = 0
            
            for image_path in all_image_paths:
                try:
                    result = self._process_image(db, image_path)
                    if result == 'added':
                        added_count += 1
                    elif result == 'updated':
                        updated_count += 1
                    
                    processed_count += 1
                    
                    if job_id and processed_count % 10 == 0:
                        # Update progress every 10 items
                        job.processed_items = processed_count
                        job.progress = int((processed_count / len(all_image_paths)) * 100)
                        db.commit()
                
                except Exception as e:
                    print(f"Error processing {image_path}: {e}")
                    continue
            
            # Clean up orphaned records
            orphaned_count = self._cleanup_orphaned_images(db)
            # Also clean up orphaned thumbnails to prevent stale ID->thumbnail mismatches
            try:
                _ = self.thumbnail_generator.cleanup_orphaned_thumbnails(db)
            except Exception:
                # Non-fatal; continue job completion
                pass
            
            if job_id:
                job.status = 'completed'
                job.completed_at = datetime.now()
                job.processed_items = processed_count
                job.progress = 100
                job.result = {
                    'processed': processed_count,
                    'added': added_count,
                    'updated': updated_count,
                    'orphaned_removed': orphaned_count
                }
                db.commit()
                
        except Exception as e:
            if job_id:
                job.status = 'failed'
                job.error_message = str(e)
                db.commit()
            raise e
    
    def _get_library_paths(self) -> List[str]:
        """Get configured library paths from environment"""
        library_paths_str = os.getenv('LIBRARY_PATHS', '/library')
        return [path.strip() for path in library_paths_str.split(',')]
    
    def _scan_directory(self, directory: str) -> List[str]:
        """Recursively scan directory for image files"""
        image_paths = []
        
        for root, dirs, files in os.walk(directory):
            for file in files:
                file_path = os.path.join(root, file)
                file_ext = os.path.splitext(file)[1].lower()
                
                if file_ext in self.supported_extensions:
                    image_paths.append(file_path)
        
        return image_paths
    
    def _process_image(self, db: Session, image_path: str) -> str:
        """Process a single image file"""
        # Check if image already exists in database
        existing_image = db.query(Image).filter(Image.path == image_path).first()
        
        # Get file stats
        try:
            stat = os.stat(image_path)
            file_mtime = datetime.fromtimestamp(stat.st_mtime)
            file_size = stat.st_size
        except OSError:
            return 'error'
        
        # Check if this file is blacklisted (only for new images)
        file_hash = None
        if not existing_image:
            filename = os.path.basename(image_path)
            blacklisted = db.query(PurgedImage).filter(
                PurgedImage.filename == filename,
                or_(PurgedImage.file_size == None, PurgedImage.file_size == file_size)
            ).first()

            if not blacklisted:
                try:
                    file_hash = compute_file_hash(image_path)
                except Exception:
                    file_hash = None
                if file_hash:
                    blacklisted = db.query(PurgedImage).filter(PurgedImage.file_hash == file_hash).first()

            if blacklisted:
                print(f"Skipping blacklisted file: {image_path}")
                return 'blacklisted'
        
        # If image exists and hasn't been modified, skip
        if existing_image and existing_image.modified_at and existing_image.modified_at >= file_mtime:
            return 'skipped'
        
        # Extract metadata
        metadata = self.metadata_extractor.extract_metadata(image_path)
        
        if existing_image:
            # Update existing image
            self._update_image_from_metadata(existing_image, image_path, metadata)
            # Auto-categorize based on folder structure
            self._assign_folder_categories(db, existing_image, image_path)
            # Ensure local media copy exists
            self.media_manager.update_image_local_path(db, existing_image)
            db.commit()
            # Generate thumbnail for updated image
            # Force regeneration so stale thumbnails don't mismatch updated originals
            self.thumbnail_generator.generate_single_thumbnail(existing_image, force_regenerate=True)
            return 'updated'
        else:
            # Create new image record
            image = self._create_image_from_metadata(image_path, metadata)
            db.add(image)
            db.flush()  # Get the ID
            # Auto-categorize based on folder structure
            self._assign_folder_categories(db, image, image_path)
            # Create local media copy
            self.media_manager.update_image_local_path(db, image)
            db.commit()
            # Generate thumbnail for new image
            self.thumbnail_generator.generate_single_thumbnail(image)
            return 'added'
    
    def _create_image_from_metadata(self, image_path: str, metadata: dict) -> Image:
        """Create a new Image record from metadata"""
        file_info = metadata.get('file_info', {})
        image_info = metadata.get('image_info', {})
        normalized = metadata.get('normalized', {})
        
        return Image(
            path=image_path,
            filename=os.path.basename(image_path),
            file_size=file_info.get('size'),
            width=image_info.get('width'),
            height=image_info.get('height'),
            aspect_ratio=image_info.get('aspect_ratio'),
            format=image_info.get('format'),
            
            # Photo metadata
            camera_make=normalized.get('camera_make'),
            camera_model=normalized.get('camera_model'),
            lens_model=normalized.get('lens_model'),
            focal_length=normalized.get('focal_length'),
            aperture=normalized.get('aperture'),
            shutter_speed=normalized.get('shutter_speed'),
            iso=normalized.get('iso'),
            flash_used=normalized.get('flash_used'),
            date_taken=normalized.get('date_taken'),
            
            # Timestamps
            created_at=file_info.get('created', datetime.now()),
            modified_at=file_info.get('modified', datetime.now()),
            indexed_at=datetime.now()
        )
    
    def _update_image_from_metadata(self, image: Image, image_path: str, metadata: dict):
        """Update existing Image record from metadata"""
        file_info = metadata.get('file_info', {})
        image_info = metadata.get('image_info', {})
        normalized = metadata.get('normalized', {})
        
        # Update basic file info
        image.filename = os.path.basename(image_path)
        image.file_size = file_info.get('size')
        image.width = image_info.get('width')
        image.height = image_info.get('height')
        image.aspect_ratio = image_info.get('aspect_ratio')
        image.format = image_info.get('format')
        
        # Update photo metadata
        image.camera_make = normalized.get('camera_make')
        image.camera_model = normalized.get('camera_model')
        image.lens_model = normalized.get('lens_model')
        image.focal_length = normalized.get('focal_length')
        image.aperture = normalized.get('aperture')
        image.shutter_speed = normalized.get('shutter_speed')
        image.iso = normalized.get('iso')
        image.flash_used = normalized.get('flash_used')
        image.date_taken = normalized.get('date_taken')
        
        # Update timestamps
        image.modified_at = file_info.get('modified', datetime.now())
        image.indexed_at = datetime.now()
    
    def _extract_folder_categories(self, image_path: str) -> List[str]:
        """Extract category names from folder structure"""
        # Get library paths to determine relative path
        library_paths = self._get_library_paths()
        
        # Find which library path this image belongs to
        relative_path = None
        for lib_path in library_paths:
            if image_path.startswith(lib_path):
                relative_path = os.path.relpath(image_path, lib_path)
                break
        
        if not relative_path or relative_path == os.path.basename(image_path):
            # Image is at root level, no folder categories
            return []
        
        # Extract folder names from path (excluding filename)
        folder_path = os.path.dirname(relative_path)
        if not folder_path or folder_path == '.':
            return []
        
        # Split path and clean up folder names
        folder_parts = folder_path.split(os.sep)
        categories = []
        
        for part in folder_parts:
            if part and part != '.':
                # Clean up folder name for category
                category_name = part.replace('_', ' ').replace('-', ' ').title()
                # Remove numbers and special chars if they're just organizational
                # Keep meaningful names, remove:
                # - Pure numbers: "123", "001"
                # - Dates: "2023-01-01"
                # - Hex-like strings: "000D", "00C9", "DCIM" style camera folders
                # - Very short meaningless names: single chars, etc.
                if (not re.match(r'^\d+$', category_name) and 
                    not re.match(r'^\d{4}-\d{2}-\d{2}$', category_name) and
                    not re.match(r'^[0-9A-F]{2,6}$', category_name.replace(' ', '').upper()) and
                    not re.match(r'^[0-9]+[A-F]+[0-9]*$', category_name.replace(' ', '').upper()) and
                    len(category_name.replace(' ', '')) > 2 and
                    category_name.replace(' ', '').upper() not in ['DCIM', 'IMG', 'DSC', 'PIC', 'PHOTO', 'PHOTOS']):
                    categories.append(category_name)
        
        return categories
    
    def _assign_folder_categories(self, db: Session, image: Image, image_path: str):
        """Assign categories to image based on folder structure"""
        category_names = self._extract_folder_categories(image_path)
        
        if not category_names:
            return
        
        # Create categories if they don't exist and assign to image
        for category_name in category_names:
            category = db.query(Category).filter(Category.name == category_name).first()
            if not category:
                # Create new category with folder-based color
                colors = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#F97316", "#84CC16"]
                color = colors[hash(category_name) % len(colors)]
                
                category = Category(
                    name=category_name,
                    description=f"Auto-generated from folder: {category_name}",
                    color=color
                )
                db.add(category)
                db.flush()
            
            # Assign category to image if not already assigned
            if category not in image.categories:
                image.categories.append(category)
    
    def _cleanup_orphaned_images(self, db: Session) -> int:
        """Remove database records for images that no longer exist on disk"""
        images = db.query(Image).all()
        orphaned_count = 0
        
        for image in images:
            if not os.path.exists(image.path):
                db.delete(image)
                orphaned_count += 1
        
        if orphaned_count > 0:
            db.commit()
        
        return orphaned_count

    def cleanup_orphaned_images(self, db: Session, job_id: Optional[int] = None) -> dict:
        """Public method to clean up orphaned images with job tracking"""
        if job_id:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = 'running'
                job.started_at = datetime.now()
                db.commit()
        
        try:
            # Get all images for progress tracking
            images = db.query(Image).all()
            total_images = len(images)
            processed = 0
            orphaned_count = 0
            orphaned_paths = []
            
            # Check each image
            for image in images:
                processed += 1
                
                # Update job progress if we have one
                if job_id:
                    job = db.query(Job).filter(Job.id == job_id).first()
                    if job:
                        job.processed_items = processed
                        job.progress = int((processed / total_images) * 100) if total_images > 0 else 100
                        db.commit()
                
                # Check if file exists using path utilities
                from backend.utils.path_utils import get_container_path
                container_path = get_container_path(image.path)
                
                if not os.path.exists(container_path):
                    orphaned_paths.append(image.path)
                    db.delete(image)
                    orphaned_count += 1
            
            # Commit all deletions
            if orphaned_count > 0:
                db.commit()
            
            # Update job completion
            if job_id:
                job = db.query(Job).filter(Job.id == job_id).first()
                if job:
                    job.status = 'completed'
                    job.completed_at = datetime.now()
                    job.progress = 100
                    job.result = {
                        'total_checked': total_images,
                        'orphaned_removed': orphaned_count,
                        'orphaned_paths': orphaned_paths[:100]  # Limit to first 100 for UI
                    }
                    db.commit()
            
            return {
                'total_checked': total_images,
                'orphaned_removed': orphaned_count,
                'orphaned_paths': orphaned_paths
            }
            
        except Exception as e:
            # Update job with error
            if job_id:
                job = db.query(Job).filter(Job.id == job_id).first()
                if job:
                    job.status = 'failed'
                    job.error_message = str(e)
                    job.completed_at = datetime.now()
                    db.commit()
            raise e
    
    def get_scan_stats(self, db: Session) -> dict:
        """Get statistics about the current library"""
        total_images = db.query(Image).count()
        
        # Get counts by format
        format_stats = db.query(
            Image.format, 
            func.count(Image.id).label('count')
        ).group_by(Image.format).all()
        
        # Get counts by model
        model_stats = db.query(
            Image.model_name, 
            func.count(Image.id).label('count')
        ).filter(Image.model_name.isnot(None)).group_by(Image.model_name).all()
        
        return {
            'total_images': total_images,
            'formats': {stat[0]: stat[1] for stat in format_stats if stat[0]},
            'models': {stat[0]: stat[1] for stat in model_stats[:10]}  # Top 10
        }
