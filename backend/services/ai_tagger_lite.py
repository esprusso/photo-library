"""
Lightweight AI-powered automatic tagging service for resource-constrained environments.
Uses smaller models suitable for NAS devices.
"""

import os
import re
from typing import List, Set, Optional, Dict
from PIL import Image
import logging

logger = logging.getLogger(__name__)

class AITaggerLite:
    """Lightweight AI tagger for NAS devices"""
    
    def __init__(self):
        self._initialized = False
        
        # Dramatically expanded tag categories for better recognition
        self.color_tags = {
            'colorful', 'monochrome', 'black', 'white', 'sepia', 'vibrant', 'red', 'blue', 'green',
            'pastel', 'dark', 'bright', 'muted', 'saturated', 'purple', 'pink', 'orange', 'yellow',
            'golden', 'silver', 'bronze', 'metallic', 'neon', 'glowing'
        }
        
        self.style_tags = {
            'realistic', 'stylized', 'anime', 'cartoon', 'abstract', 'surreal', 'simple',
            'photorealistic', 'minimalist', 'detailed', 'sketch', 'painting', 'comic',
            'cinematic', 'dramatic', 'elegant', 'vintage', 'retro', 'modern', 'futuristic',
            'cyberpunk', 'steampunk', 'gothic', 'baroque', 'renaissance', 'art_nouveau'
        }
        
        self.subject_tags = {
            'portrait', 'landscape', 'cityscape', 'nature', 'architecture', 'beach', 'day', 'night',
            'character', 'vehicle', 'animal', 'fantasy', 'sci_fi', 'medieval', 'woman', 'man',
            'building', 'house', 'castle', 'forest', 'mountain', 'ocean', 'sky', 'clouds',
            'flower', 'tree', 'garden', 'park', 'street', 'indoor', 'outdoor', 'interior',
            'exterior', 'room', 'kitchen', 'bedroom', 'bathroom', 'living', 'office'
        }
        
        self.technique_tags = {
            'digital_art', 'traditional_art', 'mixed_media', 'photography', 'compose',
            'illustration', 'concept_art', 'matte_painting', '3d_render', 'cgi',
            'watercolor', 'oil_painting', 'acrylic', 'pencil', 'ink', 'charcoal'
        }
        
        # Character and celebrity names
        self.character_tags = {
            'widow', 'spider', 'captain', 'iron', 'thor', 'hulk', 'batman', 'superman',
            'wonder', 'joker', 'harley', 'scarlett', 'johansson', 'natasha', 'romanoff'
        }
        
        # Mood and atmosphere
        self.mood_tags = {
            'happy', 'sad', 'angry', 'peaceful', 'energetic', 'calm', 'exciting',
            'mysterious', 'romantic', 'epic', 'heroic', 'villainous', 'cute', 'scary'
        }

    def initialize(self) -> bool:
        """Initialize the lightweight tagger"""
        try:
            logger.info("Initializing lightweight AI tagger for NAS...")
            self._initialized = True
            return True
        except Exception as e:
            logger.error(f"Failed to initialize lightweight tagger: {e}")
            return False

    def analyze_image_properties(self, image_path: str) -> Dict[str, any]:
        """Analyze basic image properties without AI models"""
        try:
            with Image.open(image_path) as img:
                width, height = img.size
                mode = img.mode
                
                # Analyze aspect ratio
                aspect_ratio = width / height
                
                # Analyze image mode and colors
                is_grayscale = mode in ['L', 'LA']
                is_color = mode in ['RGB', 'RGBA']
                
                # Basic color analysis
                if is_color and img.size[0] * img.size[1] < 1000000:  # Only for smaller images
                    colors = img.getcolors(maxcolors=256)
                    dominant_colors = sorted(colors, key=lambda x: x[0], reverse=True)[:5] if colors else []
                else:
                    dominant_colors = []
                
                return {
                    'width': width,
                    'height': height,
                    'aspect_ratio': aspect_ratio,
                    'is_grayscale': is_grayscale,
                    'is_color': is_color,
                    'dominant_colors': dominant_colors,
                    'total_pixels': width * height
                }
                
        except Exception as e:
            logger.error(f"Failed to analyze image properties: {e}")
            return {}

    def generate_tags_from_filename(self, filename: str) -> List[str]:
        """Extract tags from filename and path"""
        tags = []
        
        # Clean filename
        name = os.path.splitext(filename)[0].lower()
        
        # Replace common separators with spaces
        name = re.sub(r'[_\-\.]', ' ', name)
        
        # Extract words
        words = re.findall(r'\b[a-zA-Z]{3,}\b', name)
        
        # Match against all known categories
        for word in words:
            if word in self.style_tags:
                tags.append(word)
            elif word in self.subject_tags:
                tags.append(word)
            elif word in self.technique_tags:
                tags.append(word)
            elif word in self.color_tags:
                tags.append(word)
            elif word in self.character_tags:
                tags.append(word)
            elif word in self.mood_tags:
                tags.append(word)
            elif word in ['art', 'artwork', 'drawing', 'painting', 'sketch']:
                tags.append('artwork')
        
        # Special pattern matching for compound terms
        name_lower = name.lower()
        if 'black widow' in name_lower:
            tags.append('black_widow')
        if 'beach day' in name_lower:
            tags.extend(['beach', 'day'])
        if any(term in name_lower for term in ['scarlett johansson', 'natasha romanoff']):
            tags.extend(['scarlett_johansson', 'black_widow', 'character'])
        
        return tags

    def generate_tags_from_properties(self, properties: Dict[str, any]) -> List[str]:
        """Generate tags based on image properties"""
        tags = []
        
        if not properties:
            return tags
        
        # Aspect ratio based tags
        aspect_ratio = properties.get('aspect_ratio', 1.0)
        if aspect_ratio > 1.5:
            tags.append('landscape_format')
        elif aspect_ratio < 0.7:
            tags.append('portrait_format')
        else:
            tags.append('square_format')
        
        # Resolution based tags
        total_pixels = properties.get('total_pixels', 0)
        if total_pixels > 2000000:  # > 2MP
            tags.append('high_resolution')
        elif total_pixels < 500000:  # < 0.5MP
            tags.append('low_resolution')
        
        # Color based tags
        if properties.get('is_grayscale'):
            tags.append('monochrome')
        elif properties.get('is_color'):
            tags.append('color')
        
        return tags

    def generate_tags(self, image_path: str) -> List[str]:
        """Generate tags using lightweight analysis"""
        if not self._initialized:
            if not self.initialize():
                return []
        
        try:
            tags = []
            filename = os.path.basename(image_path)
            
            # Get tags from filename
            filename_tags = self.generate_tags_from_filename(filename)
            tags.extend(filename_tags)
            
            # Get tags from image properties
            properties = self.analyze_image_properties(image_path)
            property_tags = self.generate_tags_from_properties(properties)
            tags.extend(property_tags)
            
            # Add some default tags based on common AI art patterns
            if any(tag in filename.lower() for tag in ['ai', 'generated', 'midjourney', 'stable', 'dalle']):
                tags.append('ai_generated')
            
            # Remove duplicates and limit
            unique_tags = list(dict.fromkeys(tags))[:8]
            
            logger.info(f"DEBUG: Processing filename: '{filename}'")
            logger.info(f"DEBUG: Extracted filename tags: {filename_tags}")
            logger.info(f"DEBUG: Extracted property tags: {property_tags}")
            logger.info(f"Generated {len(unique_tags)} lightweight tags for {filename}: {unique_tags}")
            return unique_tags
            
        except Exception as e:
            logger.error(f"Failed to generate tags for {image_path}: {e}")
            return []

    def batch_generate_tags(self, image_paths: List[str], 
                          progress_callback: Optional[callable] = None) -> Dict[str, List[str]]:
        """Generate tags for multiple images"""
        results = {}
        total = len(image_paths)
        
        for i, image_path in enumerate(image_paths):
            try:
                tags = self.generate_tags(image_path)
                results[image_path] = tags
                
                if progress_callback:
                    progress_callback(i + 1, total, image_path)
                    
            except Exception as e:
                logger.error(f"Failed to process {image_path}: {e}")
                results[image_path] = []
                
        return results

    def cleanup(self):
        """Clean up resources"""
        self._initialized = False
        logger.info("Lightweight AI tagger cleaned up")


# Global instance for lite version
_ai_tagger_lite = None

def get_ai_tagger_lite():
    """Get the global lightweight AI tagger instance"""
    global _ai_tagger_lite
    if _ai_tagger_lite is None:
        _ai_tagger_lite = AITaggerLite()
    return _ai_tagger_lite