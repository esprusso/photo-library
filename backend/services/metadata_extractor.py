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
    """Extract metadata from various AI image formats"""
    
    def __init__(self):
        self.supported_formats = {'.png', '.jpg', '.jpeg', '.webp', '.tiff'}
    
    def extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract all available metadata from an image file"""
        if not os.path.exists(file_path):
            return {}
        
        metadata = {
            'file_info': self._get_file_info(file_path),
            'image_info': {},
            'ai_metadata': {},
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
                
                # Extract AI metadata from PNG text chunks
                if img.format == 'PNG' and hasattr(img, 'text'):
                    metadata['ai_metadata'] = self._extract_png_metadata(img.text)
                
                # Extract EXIF data
                if hasattr(img, '_getexif'):
                    exif = img._getexif()
                    if exif:
                        metadata['exif_data'] = self._process_exif(exif)
        
        except Exception as e:
            import logging
            logging.error(f"Error extracting metadata from {file_path}: {e}")
            metadata['error'] = str(e)
        
        # Look for sidecar JSON files (ComfyUI, etc.)
        sidecar_metadata = self._extract_sidecar_metadata(file_path)
        if sidecar_metadata:
            metadata['ai_metadata'].update(sidecar_metadata)
        
        # Normalize AI metadata fields
        metadata['normalized'] = self._normalize_ai_metadata(metadata['ai_metadata'])
        
        return metadata
    
    def _get_file_info(self, file_path: str) -> Dict[str, Any]:
        """Get basic file information"""
        try:
            stat = os.stat(file_path)
            mime_type = magic.from_file(file_path, mime=True)
            
            return {
                'size': stat.st_size,
                'created': datetime.fromtimestamp(stat.st_ctime),
                'modified': datetime.fromtimestamp(stat.st_mtime),
                'mime_type': mime_type
            }
        except Exception as e:
            import logging
            logging.error(f"Error getting file info for {file_path}: {e}")
            return {
                'size': None,
                'created': None,
                'modified': None,
                'mime_type': 'application/octet-stream',
                'error': str(e)
            }
    
    def _extract_png_metadata(self, png_text: Dict[str, str]) -> Dict[str, Any]:
        """Extract AI metadata from PNG text chunks"""
        metadata = {}
        
        # Common PNG text chunk keys used by AI tools
        key_mappings = {
            'parameters': 'parameters',
            'Parameters': 'parameters',
            'prompt': 'prompt',
            'Prompt': 'prompt',
            'workflow': 'workflow',
            'Workflow': 'workflow',
            'comfyui': 'comfyui_workflow'
        }
        
        for key, value in png_text.items():
            mapped_key = key_mappings.get(key, key.lower())
            
            # Try to parse JSON values
            try:
                if value.startswith('{') or value.startswith('['):
                    metadata[mapped_key] = json.loads(value)
                else:
                    metadata[mapped_key] = value
            except json.JSONDecodeError:
                metadata[mapped_key] = value
        
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
                # Some AI tools store metadata in UserComment
                try:
                    if isinstance(value, bytes):
                        comment = value.decode('utf-8', errors='ignore')
                    else:
                        comment = str(value)
                    
                    if comment.startswith('{"') or comment.startswith('{'):
                        processed['ai_comment'] = json.loads(comment)
                    else:
                        processed['user_comment'] = comment
                except:
                    processed['user_comment'] = str(value)
            else:
                processed[tag.lower()] = value
        
        return processed
    
    def _extract_sidecar_metadata(self, image_path: str) -> Dict[str, Any]:
        """Look for and extract sidecar JSON files"""
        base_path = os.path.splitext(image_path)[0]
        sidecar_extensions = ['.json', '.txt']
        
        metadata = {}
        
        for ext in sidecar_extensions:
            sidecar_path = base_path + ext
            if os.path.exists(sidecar_path):
                try:
                    with open(sidecar_path, 'r', encoding='utf-8') as f:
                        content = f.read().strip()
                        
                        # Try to parse as JSON
                        if content.startswith('{') or content.startswith('['):
                            sidecar_data = json.loads(content)
                            metadata[f'sidecar_{ext[1:]}'] = sidecar_data
                        else:
                            # Plain text, might contain parameters
                            metadata[f'sidecar_text'] = content
                            
                            # Try to parse Stable Diffusion style parameters
                            sd_params = self._parse_sd_parameters(content)
                            if sd_params:
                                metadata.update(sd_params)
                
                except Exception as e:
                    import logging
                    logging.warning(f"Error reading sidecar file {sidecar_path}: {e}")
                    metadata[f'sidecar_{ext[1:]}_error'] = str(e)
        
        return metadata
    
    def _parse_sd_parameters(self, text: str) -> Dict[str, Any]:
        """Parse Stable Diffusion style parameter text"""
        if 'Steps:' not in text and 'Sampler:' not in text:
            return {}
        
        metadata = {}
        
        # Split prompt and parameters
        parts = text.split('Negative prompt:')
        if len(parts) >= 2:
            metadata['prompt'] = parts[0].strip()
            remaining = parts[1]
            
            # Split negative prompt and parameters
            param_parts = remaining.split('\n', 1)
            if len(param_parts) >= 2:
                metadata['negative_prompt'] = param_parts[0].strip()
                params_text = param_parts[1]
            else:
                params_text = remaining
        else:
            # No negative prompt, split by common parameter indicators
            for indicator in ['Steps:', 'Sampler:', 'CFG scale:']:
                if indicator in text:
                    parts = text.split(indicator, 1)
                    metadata['prompt'] = parts[0].strip()
                    params_text = indicator + parts[1]
                    break
            else:
                return {}
        
        # Parse individual parameters
        param_patterns = {
            'steps': r'Steps: (\d+)',
            'sampler': r'Sampler: ([^,\n]+)',
            'cfg_scale': r'CFG scale: ([\d.]+)',
            'seed': r'Seed: (\d+)',
            'model_hash': r'Model hash: ([a-f0-9]+)',
            'model': r'Model: ([^,\n]+)',
            'size': r'Size: (\d+x\d+)'
        }
        
        import re
        for key, pattern in param_patterns.items():
            match = re.search(pattern, params_text)
            if match:
                value = match.group(1)
                if key in ['steps', 'seed']:
                    try:
                        metadata[key] = int(value)
                    except ValueError:
                        metadata[key] = value
                elif key == 'cfg_scale':
                    try:
                        metadata[key] = float(value)
                    except ValueError:
                        metadata[key] = value
                else:
                    metadata[key] = value.strip()
        
        return metadata
    
    def _normalize_ai_metadata(self, ai_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize AI metadata to consistent field names"""
        normalized = {}
        
        # Field mappings for common variations
        field_mappings = {
            # Prompt fields
            ('prompt', 'Prompt', 'positive_prompt'): 'prompt',
            ('negative_prompt', 'Negative prompt', 'negative'): 'negative_prompt',
            
            # Model fields
            ('model', 'Model', 'model_name', 'checkpoint'): 'model_name',
            ('model_hash', 'Model hash', 'hash'): 'model_hash',
            
            # Generation parameters
            ('steps', 'Steps', 'sampling_steps'): 'steps',
            ('cfg_scale', 'CFG scale', 'guidance_scale'): 'cfg_scale',
            ('sampler', 'Sampler', 'scheduler'): 'sampler',
            ('seed', 'Seed'): 'seed',
            
            # Size fields
            ('width', 'Width'): 'width',
            ('height', 'Height'): 'height',
            ('size', 'Size'): 'size'
        }
        
        # Flatten nested metadata for easier searching
        flat_metadata = self._flatten_dict(ai_metadata)

        def first_scalar(value: Any) -> Any:
            """Extract a representative scalar from potentially nested/list values.
            - If list/tuple: return first non-empty element (recursively)
            - If dict: return common value-like fields if present
            - If string looks like a Python/JSON list/dict: try literal_eval/JSON then recurse
            """
            # Unwrap lists/tuples
            if isinstance(value, (list, tuple)) and value:
                for v in value:
                    fv = first_scalar(v)
                    if fv not in (None, ""):
                        return fv
                return value[0]
            # Unwrap dicts
            if isinstance(value, dict):
                for key in ("value", "text", "data"):
                    if key in value:
                        return first_scalar(value[key])
                # Fallback: return any first scalar
                for v in value.values():
                    fv = first_scalar(v)
                    if fv not in (None, ""):
                        return fv
            # Try to parse string that looks like a list/dict
            if isinstance(value, str):
                s = value.strip()
                if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
                    try:
                        parsed = ast.literal_eval(s)
                        return first_scalar(parsed)
                    except Exception:
                        pass
            return value
        
        for field_variations, normalized_name in field_mappings.items():
            for variation in field_variations:
                if variation in flat_metadata:
                    raw_value = flat_metadata[variation]
                    value = first_scalar(raw_value)

                    # Type conversion
                    if normalized_name in ['steps', 'width', 'height']:
                        try:
                            normalized[normalized_name] = int(value)
                        except (ValueError, TypeError):
                            # Try parsing numeric from string with brackets
                            try:
                                parsed = first_scalar(value)
                                normalized[normalized_name] = int(parsed)  # may still raise
                            except Exception:
                                normalized[normalized_name] = None
                    elif normalized_name == 'cfg_scale':
                        try:
                            normalized[normalized_name] = float(value)
                        except (ValueError, TypeError):
                            try:
                                parsed = first_scalar(value)
                                normalized[normalized_name] = float(parsed)
                            except Exception:
                                normalized[normalized_name] = None
                    else:
                        normalized[normalized_name] = str(value) if value is not None else None
                    break
        
        return normalized
    
    def _flatten_dict(self, d: Dict[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, Any]:
        """Flatten a nested dictionary"""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep=sep).items())
            else:
                items.append((new_key, v))
                items.append((k, v))  # Also keep original key for searching
        return dict(items)
