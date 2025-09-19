import os
import threading
import time
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from backend.services.image_scanner import ImageScanner
from backend.models.database import SessionLocal


class ImportWatcher:
    """Background watcher that periodically scans source paths for new media.

    This uses periodic polling to avoid inotify dependencies on NAS devices.
    It reuses ImageScanner which is already incremental and safe to run often.
    """

    def __init__(self,
                 interval_seconds: Optional[int] = None,
                 enabled: Optional[bool] = None,
                 library_paths: Optional[List[str]] = None):
        self.interval_seconds = int(os.getenv("IMPORT_WATCH_INTERVAL_SECONDS", str(interval_seconds or 60)))
        self.enabled = (os.getenv("IMPORT_WATCH_ENABLED", "true").lower() == "true") if enabled is None else enabled
        self._scanner = ImageScanner()
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._last_run: Optional[datetime] = None
        self._last_result: Optional[dict] = None
        # Default to LIBRARY_PATHS env (/library)
        if library_paths is None:
            lib_paths = os.getenv('LIBRARY_PATHS', '/library').split(',')
            self.library_paths = [p.strip() for p in lib_paths if p.strip()]
        else:
            self.library_paths = library_paths

    # Public API
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        if not self.enabled:
            return
        self._thread = threading.Thread(target=self._run_loop, name="ImportWatcher", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def trigger_scan_now(self):
        # Run a single scan cycle synchronously (on caller thread)
        return self._scan_once()

    def status(self) -> dict:
        return {
            "enabled": self.enabled,
            "running": bool(self._thread and self._thread.is_alive()),
            "interval_seconds": self.interval_seconds,
            "library_paths": self.library_paths,
            "last_run": self._last_run.isoformat() if self._last_run else None,
            "last_result": self._last_result,
        }

    # Internal
    def _run_loop(self):
        while not self._stop_event.is_set():
            try:
                self._scan_once()
            except Exception as e:
                print(f"ImportWatcher error: {e}")
            # Sleep in small chunks to allow faster shutdown
            slept = 0
            while slept < self.interval_seconds and not self._stop_event.is_set():
                time.sleep(1)
                slept += 1

    def _scan_once(self):
        self._last_run = datetime.now()
        processed = added = updated = orphaned_removed = 0
        # Each scan uses a fresh DB session to avoid long-lived connections in threads
        db: Session = SessionLocal()
        try:
            # Use ImageScanner.scan_library but constrain to each path separately
            for path in self.library_paths:
                try:
                    self._scanner.scan_library(db, job_id=None, library_paths=[path])
                except Exception as e:
                    print(f"ImportWatcher path scan failed for {path}: {e}")
            # scan_library already prints job-like counts into Job when used with job_id;
            # here we compute approximate stats from DB deltas if needed in future.
            self._last_result = {
                "message": "Scan completed",
                "timestamp": self._last_run.isoformat(),
            }
        finally:
            try:
                db.close()
            except Exception:
                pass
        return self._last_result


# Singleton instance used by app
import_watcher: Optional[ImportWatcher] = None

def get_import_watcher() -> ImportWatcher:
    global import_watcher
    if import_watcher is None:
        import_watcher = ImportWatcher()
    return import_watcher