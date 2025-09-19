"""Utilities for mapping host file-system paths to container paths."""

from __future__ import annotations

import os
from typing import Optional, Tuple


def _get_path_config() -> Tuple[str, str]:
    """Return (host_path, container_path) from environment variables."""
    host = (os.getenv('LIBRARY_HOST_PATH') or '').rstrip('/')
    container = (os.getenv('LIBRARY_CONTAINER_PATH') or '/library').rstrip('/') or '/library'
    return host, container


def get_container_path(original_path: Optional[str]) -> Optional[str]:
    """Map a host path to the mounted container path if configured.

    Args:
        original_path: Absolute path stored in the database (host or container path).

    Returns:
        Path accessible inside the container, or the original path if no mapping applies.
    """
    if not original_path:
        return original_path

    host, container = _get_path_config()
    if host and original_path.startswith(host):
        return original_path.replace(host, container, 1)
    return original_path


def get_host_paths() -> Tuple[str]:
    """Expose configured host paths for diagnostics/tests."""
    host, _ = _get_path_config()
    return (host,)


def get_container_root() -> str:
    """Return the configured container mount point for the library."""
    _, container = _get_path_config()
    return container or '/library'
