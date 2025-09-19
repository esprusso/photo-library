from PIL import Image
import os
from typing import Optional


def _open_image(path: str) -> Optional[Image.Image]:
    try:
        return Image.open(path).convert('L')
    except Exception:
        return None


def average_hash(img: Image.Image, hash_size: int = 16) -> int:
    # Resize and compute mean
    img = img.resize((hash_size, hash_size), Image.Resampling.LANCZOS)
    pixels = list(img.getdata())
    avg = sum(pixels) / len(pixels)
    bits = 0
    for i, px in enumerate(pixels):
        if px >= avg:
            bits |= 1 << i
    return bits


def phash_from_path(path: str) -> Optional[str]:
    img = _open_image(path)
    if img is None:
        return None
    try:
        # Use average hash as a simple, fast perceptual hash
        h = average_hash(img, hash_size=16)  # 256-bit; we can store hex
        # Return hex string
        return f"{h:0{(16*16)//4}x}"  # 256-bit => 64 hex chars
    except Exception:
        return None


def hamming_distance_hex(a: str, b: str) -> int:
    try:
        return bin(int(a, 16) ^ int(b, 16)).count('1')
    except Exception:
        return 256  # treat as far apart


def prefix(a: str, bits: int = 16) -> str:
    # Return first N bits encoded as hex substring
    if not a:
        return ''
    hex_chars = (bits + 3) // 4
    return a[:hex_chars]

