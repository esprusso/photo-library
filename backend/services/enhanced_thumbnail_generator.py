import os
from typing import Dict, List

THUMB_DIR = os.getenv('THUMBNAILS_DIR', '/thumbnails')

class EnhancedThumbnailGenerator:
    """Lightweight helper to expose generated thumbnail paths to the API layer.
    We keep it filesystem-based so it works regardless of DB schema.
    """

    def __init__(self):
        self.base = THUMB_DIR

    def get_thumbnail_paths(self, image_id: int) -> Dict[str, str]:
        # We currently generate a single standard JPEG thumbnail at {id}.jpg
        path = os.path.join(self.base, f"{image_id}.jpg")
        if os.path.exists(path):
            return {
                '1x': f"/thumbnails/{image_id}.jpg"
            }
        return {}

    def get_animated_preview_paths(self, image_id: int) -> Dict[str, List[str]]:
        """Return list of multiple preview frames for hover previews if present.
        We look in /thumbnails/previews/{id}/frame_*.jpg
        """
        previews_dir = os.path.join(self.base, 'previews', str(image_id))
        frames: List[str] = []
        if os.path.isdir(previews_dir):
            for name in sorted(os.listdir(previews_dir)):
                if name.lower().endswith('.jpg'):
                    frames.append(f"/thumbnails/previews/{image_id}/{name}")
        if frames:
            return {'frames': frames}
        return {}

