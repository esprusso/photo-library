import os
from typing import Dict, Optional

from sqlalchemy.orm import Session

from backend.models import Image, PurgedImage
from backend.utils.file_fingerprint import compute_file_hash
from backend.utils.path_utils import get_container_path


def resolve_original_path(image: Image) -> Optional[str]:
  """Resolve an accessible path for the source image.

  Prefers the stored original path if it exists, otherwise tries known NAS to
  container mappings.
  """
  if image.path:
    if os.path.exists(image.path):
      return image.path
    mapped = get_container_path(image.path)
    if mapped and os.path.exists(mapped):
      return mapped

  return None


def collect_blacklist_fingerprint(image: Image) -> Dict[str, Optional[object]]:
  """Gather metadata for a blacklist entry (size + hash)."""
  file_size = image.file_size
  file_hash = None

  candidate_paths = []
  if getattr(image, 'local_path', None):
    candidate_paths.append(image.local_path)

  resolved_original = resolve_original_path(image)
  if resolved_original:
    candidate_paths.append(resolved_original)

  for path in candidate_paths:
    if not path or not os.path.exists(path):
      continue
    if file_size is None:
      try:
        file_size = os.path.getsize(path)
      except Exception:
        pass
    file_hash = compute_file_hash(path)
    if file_hash:
      break

  return {
    'file_size': file_size,
    'file_hash': file_hash,
  }


def add_blacklist_entry(db: Session, image: Image, reason: str) -> None:
  fingerprint = collect_blacklist_fingerprint(image)
  entry = PurgedImage(
    filename=image.filename,
    file_size=fingerprint.get('file_size'),
    file_hash=fingerprint.get('file_hash'),
    width=image.width,
    height=image.height,
    original_path=image.path,
    purge_reason=reason,
  )
  db.add(entry)
