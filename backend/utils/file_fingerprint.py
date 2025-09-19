import hashlib
from typing import Optional


def compute_file_hash(path: str, chunk_size: int = 1024 * 1024) -> Optional[str]:
  """Return the SHA-256 hash for the file at ``path``.

  Returns ``None`` if the file cannot be read. The chunked read keeps memory
  usage reasonable for very large media files.
  """
  try:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
      for chunk in iter(lambda: handle.read(chunk_size), b''):
        if not chunk:
          break
        digest.update(chunk)
    return digest.hexdigest()
  except Exception:
    return None
