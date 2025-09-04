"""
AI-powered automatic tagging service for images.
Uses BLIP-2 for image captioning and extracts meaningful tags.
"""

import os
import re
from typing import List, Set, Optional, Dict, Any
from PIL import Image
import torch
from transformers import Blip2Processor, Blip2ForConditionalGeneration
import logging

logger = logging.getLogger(__name__)


class AITagger:
    """AI-powered image tagging service using BLIP-2"""
    
    def __init__(self):
        self.processor = None
        self.model = None
        self.device = None
        self._initialized = False
        
        # Common words to filter out from tags
        self.stopwords = {
            'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 
            'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
            'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 
            'their', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
            'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'among', 'very',
            'really', 'quite', 'just', 'also', 'only', 'even', 'still', 'image',
            'picture', 'photo', 'photograph', 'showing', 'depicts', 'features'
        }
        
        # Art and style specific keywords to prioritize
        self.art_keywords = {
            'painting', 'drawing', 'sketch', 'artwork', 'illustration', 'digital',
            'watercolor', 'oil', 'acrylic', 'pencil', 'ink', 'charcoal', 'pastel',
            'portrait', 'landscape', 'abstract', 'realistic', 'stylized', 'anime',
            'manga', 'cartoon', 'comic', 'fantasy', 'sci-fi', 'medieval', 'modern',
            'vintage', 'retro', 'futuristic', 'surreal', 'impressionist', 'cubist'
        }

    def initialize(self) -> bool:
        """Initialize the AI model. Returns True if successful."""
        if self._initialized:
            return True
            
        try:
            logger.info("Initializing BLIP-2 model for AI tagging...")
            
            # Check if CUDA is available
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Using device: {self.device}")
            
            # Use smaller model for NAS optimization
            model_name = "Salesforce/blip2-opt-2.7b-coco"  # Smaller, faster variant
            self.processor = Blip2Processor.from_pretrained(model_name)
            self.model = Blip2ForConditionalGeneration.from_pretrained(
                model_name,
                torch_dtype=torch.float32,  # Use float32 for CPU stability
                low_cpu_mem_usage=True,     # Optimize memory usage
                device_map="auto" if self.device == "cuda" else None
            )
            
            if self.device == "cpu":
                self.model = self.model.to(self.device)
                
            self._initialized = True
            logger.info("BLIP-2 model initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize AI tagging model: {e}")
            return False

    def extract_tags_from_caption(self, caption: str) -> List[str]:
        """Extract meaningful tags from an image caption"""
        if not caption:
            return []
            
        # Clean and normalize the caption
        caption = caption.lower().strip()
        
        # Remove punctuation and split into words
        words = re.findall(r'\b[a-zA-Z]+\b', caption)
        
        # Filter out stopwords and short words
        meaningful_words = [
            word for word in words 
            if word not in self.stopwords and len(word) > 2
        ]
        
        # Prioritize art-related keywords
        tags = []
        art_tags = []
        
        for word in meaningful_words:
            if word in self.art_keywords:
                art_tags.append(word)
            else:
                tags.append(word)
                
        # Combine with art tags first
        final_tags = art_tags + tags
        
        # Remove duplicates while preserving order
        seen = set()
        unique_tags = []
        for tag in final_tags:
            if tag not in seen:
                seen.add(tag)
                unique_tags.append(tag)
                
        return unique_tags[:10]  # Limit to top 10 tags

    def generate_caption(self, image_path: str) -> Optional[str]:
        """Generate a caption for an image"""
        if not self._initialized:
            if not self.initialize():
                return None
                
        try:
            # Load and process the image
            image = Image.open(image_path).convert('RGB')
            
            # Process the image with proper padding
            inputs = self.processor(image, return_tensors="pt", padding=True).to(self.device)
            
            # Generate caption with NAS optimization
            with torch.no_grad():
                generated_ids = self.model.generate(
                    **inputs, 
                    max_length=30,     # Shorter for faster generation
                    num_beams=2,       # Fewer beams for speed
                    early_stopping=True,
                    do_sample=False    # Deterministic for consistency
                )
                
            caption = self.processor.decode(generated_ids[0], skip_special_tokens=True)
            return caption.strip()
            
        except Exception as e:
            logger.error(f"Failed to generate caption for {image_path}: {e}")
            return None

    def generate_tags(self, image_path: str) -> List[str]:
        """Generate tags for an image with fallback to lite mode"""
        if not os.path.exists(image_path):
            logger.warning(f"Image file not found: {image_path}")
            return []
            
        try:
            # Check if we should use lite mode based on file characteristics
            file_size = os.path.getsize(image_path)
            if file_size > 50 * 1024 * 1024:  # > 50MB, use lite mode
                logger.info(f"Large file detected ({file_size} bytes), using lite mode")
                return self._fallback_to_lite_mode(image_path)
            
            # Generate caption first
            caption = self.generate_caption(image_path)
            if not caption:
                logger.warning(f"No caption generated for {image_path}, falling back to lite mode")
                return self._fallback_to_lite_mode(image_path)
                
            # Extract tags from caption
            tags = self.extract_tags_from_caption(caption)
            
            logger.info(f"Generated {len(tags)} tags for {image_path}: {tags}")
            return tags
            
        except Exception as e:
            logger.error(f"Failed to generate tags for {image_path}: {e}, falling back to lite mode")
            return self._fallback_to_lite_mode(image_path)

    def _fallback_to_lite_mode(self, image_path: str) -> List[str]:
        """Fallback to lite mode for problematic images"""
        try:
            from .ai_tagger_lite import get_ai_tagger_lite
            lite_tagger = get_ai_tagger_lite()
            return lite_tagger.generate_tags(image_path)
        except Exception as e:
            logger.error(f"Even lite mode failed for {image_path}: {e}")
            return []

    def batch_generate_tags(self, image_paths: List[str], 
                          progress_callback: Optional[callable] = None) -> Dict[str, List[str]]:
        """Generate tags for multiple images with progress tracking"""
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
        """Clean up model resources"""
        if self.model:
            del self.model
        if self.processor:
            del self.processor
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        self._initialized = False
        logger.info("AI tagger resources cleaned up")


# Global instance
_ai_tagger = None

def get_ai_tagger():
    """Get the appropriate AI tagger instance based on environment"""
    import os
    import psutil
    
    # Check if running in lite mode (for NAS or low-resource environments)
    use_lite_mode = os.environ.get('AI_TAGGER_LITE', 'false').lower() == 'true'
    
    # Auto-detect if we should use lite mode based on system resources
    if not use_lite_mode:
        try:
            # Check available RAM
            memory = psutil.virtual_memory()
            available_gb = memory.available / (1024**3)
            
            # Check if we're likely running in a container with limited resources
            if available_gb < 4.0:  # Less than 4GB available RAM
                logger.info(f"Low memory detected ({available_gb:.1f}GB available), using lite mode")
                use_lite_mode = True
            
            # Check if CUDA is available
            if not use_lite_mode:
                try:
                    import torch
                    if not torch.cuda.is_available():
                        logger.info("No CUDA detected, using lite mode for CPU optimization")
                        use_lite_mode = True
                except ImportError:
                    logger.info("PyTorch not available, using lite mode")
                    use_lite_mode = True
                    
        except Exception as e:
            logger.warning(f"Could not detect system resources: {e}, defaulting to lite mode")
            use_lite_mode = True
    
    if use_lite_mode:
        logger.info("Using lightweight AI tagger")
        from .ai_tagger_lite import get_ai_tagger_lite
        return get_ai_tagger_lite()
    
    logger.info("Using full AI tagger with BLIP-2")
    global _ai_tagger
    if _ai_tagger is None:
        _ai_tagger = AITagger()
    return _ai_tagger