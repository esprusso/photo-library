from fastapi import APIRouter

from backend.services.import_watcher import get_import_watcher


router = APIRouter()


@router.get("/status")
async def watch_status():
    iw = get_import_watcher()
    return iw.status()


@router.post("/scan-now")
async def watch_scan_now():
    iw = get_import_watcher()
    result = iw.trigger_scan_now()
    return {"message": "Triggered scan", "result": result}


@router.post("/enable")
async def watch_enable():
    iw = get_import_watcher()
    iw.enabled = True
    iw.start()
    return {"enabled": True}


@router.post("/disable")
async def watch_disable():
    iw = get_import_watcher()
    iw.enabled = False
    iw.stop()
    return {"enabled": False}