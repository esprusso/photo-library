# GIF Display Issue Troubleshooting Log

## Problem Statement

The user has a Photo Library application running on a Synology NAS at `http://192.168.1.70:8087` with the following issues:

1. **Browse page shows no images at all** - Completely empty grid
2. **Modal shows tiny thumbnails instead of original GIFs** when clicking on images  
3. **Expected behavior**: Display and animate original GIF files from `/volume1/homes/rheritage/Spicy Gif Library`

## System Architecture

- **Frontend**: React TypeScript with nginx reverse proxy
- **Backend**: FastAPI Python application  
- **Database**: PostgreSQL
- **Deployment**: Docker Compose on Synology NAS
- **File Storage**: `/volume1/homes/rheritage/Spicy Gif Library` mounted to `/library` in container

## Environment Configuration (.env)

```bash
LIBRARY_PATHS="/volume1/homes/rheritage/Spicy Gif Library"
LIBRARY_HOST_PATH="/volume1/homes/rheritage/Spicy Gif Library"
SERVE_ORIGINALS_AS_THUMBNAILS=true
```

## Troubleshooting Steps Taken

### 1. Initial Investigation (Browser Console Errors)

**Finding**: User reported 502 Bad Gateway errors for `/api/jobs/` endpoints and no images displaying.

**Root Cause**: Backend container was not starting due to Python syntax errors.

### 2. Fixed Backend Container Startup Issues

**Problem**: IndentationError in `backend/api/images.py` at line 477
```
IndentationError: unindent does not match any outer indentation level
```

**Solution**: Fixed incorrect indentation in the file serving endpoint code.

**Commands Run**:
```bash
docker compose build backend
docker compose up -d
```

**Result**: Backend started successfully, 502 errors resolved.

### 3. API Connectivity Testing

**Tests Performed**:
```bash
curl -s "http://192.168.1.70:8087/api/health"
# Result: {"status":"healthy"}

curl -s "http://192.168.1.70:8087/api/images?limit=3"
# Result: Returns image data with paths like "/library/00 - Uncategorized/..."
```

**Finding**: API is working correctly and returning image data.

### 4. File Serving Endpoint Testing

**Problem**: Modal was using incorrect endpoint URL.

**Issue Found**: 
- Modal used: `/api/image-file/${image.id}` (incorrect)
- Correct endpoint: `/api/images/file/${image.id}`

**Solution**: Updated `frontend/src/components/ImageModal.tsx`:
```typescript
// Before
src={`/api/image-file/${image.id}`}

// After  
src={`/api/images/file/${image.id}`}
```

**Test Results**:
```bash
curl -s "http://192.168.1.70:8087/api/images/file/120311" | head -c 100
# Result: GIF89a�� �  �vXB (actual GIF binary data)
```

**Finding**: File endpoint works and serves actual GIF content.

### 5. Database Path Analysis

**API Response Analysis**:
```bash
curl -s "http://192.168.1.70:8087/api/images?limit=1" | jq '.[0] | {id, path, filename, is_animated, thumbnail_path}'
```

**Findings**:
- Database paths: `/library/00 - Uncategorized/...` (container paths)
- `is_animated`: `null` for all GIF files (should be `true`)
- `thumbnail_path`: `/thumbnails/120311.jpg` (static JPG thumbnails)

### 6. File Endpoint Path Mapping Investigation

**Code Analysis**: `backend/api/images.py` serve_image_file function

**Path Mapping Logic**:
```python
if image.path.startswith('/volume1/homes/rheritage/Spicy Gif Library'):
    container_path = image.path.replace('/volume1/homes/rheritage/Spicy Gif Library', '/library')
elif image.path.startswith('/library/'):
    container_path = image.path
```

**Issue**: Database contains `/library/` paths but mapping expects `/volume1/...` paths.

### 7. Frontend Component Analysis

**AnimatedThumbnail Component Issues**:

1. **getThumbnailSrc()** correctly returns `/api/images/file/${image.id}` for GIFs
2. **is_animated property** returns `null` instead of `true`
3. **Fallback logic** uses JPG thumbnails when file endpoint fails

**Component Logic Flow**:
```typescript
// Current logic
const isGif = image.filename.toLowerCase().endsWith('.gif')
if (isGif) {
  const originalUrl = `/api/images/file/${image.id}`
  return originalUrl
}
```

### 8. Backend Model Investigation

**Image Model Analysis**: `backend/models/image.py`

```python
@property
def is_animated(self):
    """Check if this image is animated based on file extension"""
    if not self.filename:
        return False
    ext = os.path.splitext(self.filename)[1].lower()
    return ext == '.gif'
```

**Issue**: Property looks correct but API returns `null` for `is_animated`.

### 9. Frontend Endpoint Corrections Applied

**Files Modified**:
- `frontend/src/components/ImageModal.tsx`: Fixed endpoint URLs
- `frontend/src/components/AnimatedThumbnail.tsx`: Simplified GIF detection logic

**Changes Made**:
```typescript
// Force GIFs to use file endpoint regardless of is_animated property
if (isGif) {
  const originalGifUrl = `/api/images/file/${image.id}`
  setCurrentSrc(originalGifUrl)
  setIsPlaying(true)
}
```

### 10. Container Rebuild and Deployment

**Commands Executed**:
```bash
docker compose build frontend
docker compose build backend  
docker compose up -d
```

**Result**: Same issues persist - empty browse page, tiny thumbnails in modal.

## Current Status

### Working Components
- ✅ Backend API health endpoint
- ✅ Images API returns data  
- ✅ File serving endpoint returns GIF binary data
- ✅ Modal opens and displays something (though wrong content)

### Failing Components  
- ❌ Browse page shows no images at all
- ❌ Modal shows JPG thumbnails instead of original GIFs
- ❌ `is_animated` property returns `null` for GIF files
- ❌ File endpoint path mapping may not be working correctly

## Key Technical Details for Further Investigation

### Database Paths vs Expected Paths
- **Database contains**: `/library/00 - Uncategorized/file.gif`
- **NAS actual path**: `/volume1/homes/rheritage/Spicy Gif Library/00 - Uncategorized/file.gif`
- **Container mount**: `/volume1/homes/rheritage/Spicy Gif Library:/library`

### Critical Files
1. `backend/api/images.py` - File serving endpoint and path mapping
2. `frontend/src/components/AnimatedThumbnail.tsx` - Browse page image display
3. `frontend/src/components/ImageModal.tsx` - Modal image display
4. `backend/models/image.py` - Image model with is_animated property

### Network Requests to Monitor
- `/api/images` - Should return image list for browse page
- `/api/images/file/{id}` - Should serve original GIF files
- `/thumbnails/{id}.jpg` - Static thumbnail fallbacks

### Debugging Commands
```bash
# Check container status
docker compose ps

# Check backend logs
docker compose logs backend --tail=20

# Test file serving
curl -I "http://192.168.1.70:8087/api/images/file/120311"

# Test API response format
curl -s "http://192.168.1.70:8087/api/images?limit=1" | jq '.'
```

## Next Investigation Areas

1. **Frontend Network Tab**: Check what requests browse page is making
2. **Browser Console**: Look for JavaScript errors on page load  
3. **File Permissions**: Verify container can access `/library` directory
4. **Database Query**: Check if is_animated column exists in database schema
5. **Path Resolution**: Test if files actually exist at computed container paths

## Environment Notes

- User accesses via: `http://192.168.1.70:8087/browse`
- Development happens on local Mac, deployment on Synology NAS
- Docker volume mounting from NAS path to container path
- nginx reverse proxy handles `/api/` routing to backend