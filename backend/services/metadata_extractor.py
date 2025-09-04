import json
import os
from datetime import datetime
from typing import Dict, Any, Optional
import ast
from PIL import Image as PILImage
from PIL.ExifTags import TAGS
import piexif
import magic


class MetadataExtractor:
    """Extract metadata from various photo formats"""
    
    def __init__(self):
        self.supported_formats = {'.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif', '.cr2', '.nef', '.arw', '.dng'}
    
    def extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract all available metadata from an image file"""
        if not os.path.exists(file_path):
            return {}
        
        metadata = {
            'file_info': self._get_file_info(file_path),
            'image_info': {},
            'photo_metadata': {},
            'exif_data': {}
        }
        
        try:
            # Get image dimensions and format
            with PILImage.open(file_path) as img:
                metadata['image_info'] = {
                    'width': img.width,
                    'height': img.height,
                    'aspect_ratio': round(img.width / img.height, 3),
                    'format': img.format,
                    'mode': img.mode
                }
                
                # Extract EXIF data (primary source for photo metadata)
                if hasattr(img, '_getexif'):
                    exif = img._getexif()
                    if exif:
                        metadata['exif_data'] = self._process_exif(exif)
                        metadata['photo_metadata'] = self._extract_photo_metadata(exif)
        
        except Exception as e:
            print(f"Error extracting metadata from {file_path}: {e}")
        
        # Normalize photo metadata fields
        metadata['normalized'] = self._normalize_photo_metadata(metadata['photo_metadata'])
        
        return metadata
    
    def _get_file_info(self, file_path: str) -> Dict[str, Any]:
        """Get basic file information"""
        stat = os.stat(file_path)
        mime_type = magic.from_file(file_path, mime=True)
        
        return {
            'size': stat.st_size,
            'created': datetime.fromtimestamp(stat.st_ctime),
            'modified': datetime.fromtimestamp(stat.st_mtime),
            'mime_type': mime_type
        }
    
    def _extract_photo_metadata(self, exif_data: Dict) -> Dict[str, Any]:
        """Extract photo-specific metadata from EXIF data"""
        metadata = {}
        
        # EXIF tag mappings for camera metadata
        exif_mappings = {
            0x010F: 'camera_make',      # Make
            0x0110: 'camera_model',     # Model
            0xA434: 'lens_model',       # LensModel
            0x829A: 'focal_length',     # FocalLength
            0x829D: 'aperture',         # FNumber
            0x829E: 'shutter_speed',    # ExposureTime
            0x8827: 'iso',              # ISOSpeedRatings
            0x9209: 'flash_used',       # Flash
            0x0132: 'date_taken',       # DateTime
            0x9003: 'date_taken_original', # DateTimeOriginal
        }
        
        for tag_id, value in exif_data.items():
            if tag_id in exif_mappings:
                field_name = exif_mappings[tag_id]
                
                # Process specific fields
                if field_name == 'focal_length' and isinstance(value, tuple) and len(value) == 2:
                    metadata[field_name] = round(value[0] / value[1], 1) if value[1] != 0 else value[0]
                elif field_name == 'aperture' and isinstance(value, tuple) and len(value) == 2:
                    metadata[field_name] = round(value[0] / value[1], 1) if value[1] != 0 else value[0]
                elif field_name == 'shutter_speed' and isinstance(value, tuple) and len(value) == 2:
                    if value[0] == 1:
                        metadata[field_name] = f"1/{value[1]}"
                    else:
                        metadata[field_name] = str(round(value[0] / value[1], 3))
                elif field_name == 'flash_used':
                    metadata[field_name] = bool(value & 1) if isinstance(value, int) else bool(value)
                elif field_name in ['date_taken', 'date_taken_original']:
                    try:
                        if isinstance(value, str):
                            metadata[field_name] = datetime.strptime(value, '%Y:%m:%d %H:%M:%S')
                        else:
                            metadata[field_name] = value
                    except ValueError:
                        metadata[field_name] = value
                else:
                    metadata[field_name] = value
        
        return metadata
    
    def _process_exif(self, exif_data: Dict) -> Dict[str, Any]:
        """Process EXIF data and convert to readable format"""
        processed = {}
        
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)
            
            # Handle specific EXIF tags
            if tag == 'DateTime':
                try:
                    processed['datetime'] = datetime.strptime(value, '%Y:%m:%d %H:%M:%S')
                except:
                    processed['datetime'] = value
            elif tag == 'UserComment':
                # User comment field
                try:
                    if isinstance(value, bytes):
                        comment = value.decode('utf-8', errors='ignore')
                    else:
                        comment = str(value)
                    processed['user_comment'] = comment
                except:
                    processed['user_comment'] = str(value)
            else:
                processed[tag.lower()] = value
        
        return processed
    
    def _normalize_photo_metadata(self, photo_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize photo metadata to consistent field names"""
        normalized = {}
        
        # Field mappings for photo metadata variations
        field_mappings = {
            ('camera_make', 'Make'): 'camera_make',
            ('camera_model', 'Model'): 'camera_model', 
            ('lens_model', 'LensModel', 'Lens'): 'lens_model',
            ('focal_length', 'FocalLength'): 'focal_length',
            ('aperture', 'FNumber', 'f_number'): 'aperture',
            ('shutter_speed', 'ExposureTime'): 'shutter_speed',
            ('iso', 'ISOSpeedRatings', 'ISO'): 'iso',
            ('flash_used', 'Flash'): 'flash_used',
            ('date_taken', 'DateTime', 'date_taken_original', 'DateTimeOriginal'): 'date_taken'
        }
        
        for field_variations, normalized_name in field_mappings.items():
            for variation in field_variations:
                if variation in photo_metadata and photo_metadata[variation] is not None:
                    value = photo_metadata[variation]
                    
                    # Type conversion and validation
                    if normalized_name == 'focal_length':
                        try:
                            normalized[normalized_name] = float(value)
                        except (ValueError, TypeError):
                            normalized[normalized_name] = None
                    elif normalized_name == 'aperture':
                        try:
                            normalized[normalized_name] = float(value)
                        except (ValueError, TypeError):
                            normalized[normalized_name] = None
                    elif normalized_name == 'iso':
                        try:
                            normalized[normalized_name] = int(value)
                        except (ValueError, TypeError):
                            normalized[normalized_name] = None
                    elif normalized_name == 'flash_used':
                        normalized[normalized_name] = bool(value)
                    elif normalized_name == 'date_taken':
                        if isinstance(value, datetime):
                            normalized[normalized_name] = value
                        else:
                            try:
                                normalized[normalized_name] = datetime.strptime(str(value), '%Y:%m:%d %H:%M:%S')
                            except ValueError:
                                normalized[normalized_name] = None
                    else:
                        normalized[normalized_name] = str(value).strip() if value else None
                    break
        
        return normalized
