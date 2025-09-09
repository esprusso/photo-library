# Video Serving & Frontend Build Issues - Troubleshooting Guide

## Overview

This document outlines the issues encountered with video/GIF serving and frontend builds on a Synology NAS, along with their solutions. These problems prevented the application from properly serving media files and caused desktop video scrubbing functionality to fail.

## Problems Encountered

### 1. Desktop Video Scrubbing Not Working

**Symptoms:**
- Video scrubbing (timeline interaction) worked perfectly on iPhone/mobile
- Desktop browsers could not interact with video timeline/controls
- Videos played but scrubbing was completely non-functional on desktop

**Root Cause:**
The VideoPlayer component lacked proper focus management for desktop interaction.

**Solution:**
Added `tabIndex={0}` to the `<video>` element in the VideoPlayer component:

```tsx
<video
  ref={videoRef}
  className="..."
  controls={isIOS && isMobileViewport ? showControls : true}
  tabIndex={0} // ← This enables proper focus for desktop scrubbing
  // ... other props
/>
```

**Why this worked:**
- HTML video elements need to receive focus to handle keyboard/mouse interactions properly
- `tabIndex={0}` ensures the video element can receive focus, enabling scrubbing functionality
- Mobile devices handle video controls differently and didn't require this fix

### 2. Synology Build Compatibility Issues

**Symptoms:**
- Consistent build failures with `SyntaxError: Unexpected end of input`
- npm packages appearing corrupted during download/extraction
- TypeScript compiler (`_tsc.js`) files truncated
- Same codebase that built successfully before now failing consistently

**Root Cause:**
Docker filesystem/networking issues on Synology NAS causing package corruption during npm installs.

**Solution:**
1. **Docker system cleanup:**
   ```bash
   sudo docker system prune -f
   sudo systemctl restart docker
   ```

2. **Use `--no-cache` flag for clean builds:**
   ```bash
   sudo docker compose build --no-cache frontend backend
   ```

3. **Simplified build configuration:**
   - Downgraded to more stable versions (Node 16, Vite 4.0.0)
   - Removed TypeScript compilation from build step
   - Let Vite handle TypeScript transpilation directly

**Prevention:**
- Monitor disk space and Docker daemon health
- Use stable, proven package versions for production deployments
- Implement fallback build strategies for problematic environments

### 3. Incorrect API Endpoint Configuration

**Symptoms:**
- 404 errors when trying to load videos/GIFs
- Thumbnails not loading on browse/clips pages
- Console errors: `Failed to load resource: api/image-file/xxxxx:1 404 (Not Found)`

**Root Cause:**
Frontend was calling `/api/image-file/{id}` but the correctly configured endpoint with NAS path mapping was `/api/images/file/{id}`.

**Backend Configuration:**
The backend had two endpoints:
- `/image-file/{id}` (main.py) - basic file serving
- `/api/images/file/{id}` (api/images.py) - **correct endpoint with NAS path mapping**

The NAS path mapping logic in `/api/images/file/{id}`:
```python
# Map the database path to container path
if image.path.startswith('/volume1/homes/rheritage/Spicy Gif Library'):
    container_path = image.path.replace('/volume1/homes/rheritage/Spicy Gif Library', '/library')
elif image.path.startswith('/volume1/homes/rheritage/Spicy Clip Library'):
    container_path = image.path.replace('/volume1/homes/rheritage/Spicy Clip Library', '/clips')
```

**Solution:**
Updated all frontend references from `/api/image-file/` to `/api/images/file/`:

**Files Updated:**
- `src/components/ImageModal.tsx`
- `src/components/AnimatedThumbnail.tsx`
- `src/components/CategoryCoverPicker.tsx`
- `src/pages/CategoriesPage.tsx`
- `src/pages/ClipCategoriesPage.tsx`

**Example Fix:**
```tsx
// Before (incorrect)
src={`/api/image-file/${image.id}`}

// After (correct)
src={`/api/images/file/${image.id}`}
```

### 4. GIF Animation Control Issues

**Symptoms:**
- GIFs not animating on browse page when "Playing" button was activated
- Static thumbnails shown instead of animated GIFs
- Animation only worked when clicking individual GIFs

**Root Cause:**
The `AnimatedThumbnail` component had the correct `paused` prop logic but was using the old, incorrect API endpoint.

**Solution:**
Fixed the endpoint in the GIF animation logic:
```tsx
// In AnimatedThumbnail.tsx
if (isGif) {
  if (paused) {
    setCurrentSrc(image.thumbnail_path) // Static thumbnail when paused
  } else {
    const originalGifUrl = `/api/images/file/${image.id}` // Fixed endpoint
    setCurrentSrc(originalGifUrl) // Animated GIF when playing
  }
}
```

## Environment-Specific Considerations

### Synology NAS Deployment
- **Architecture**: ARM-based Synology systems may have compatibility issues with certain npm packages
- **Docker Performance**: Synology Docker implementations can be slower and more prone to build failures
- **File System**: Synology file systems may have specific permissions/mounting considerations
- **Memory Constraints**: Limited RAM during builds can cause package extraction failures

### Volume Mounting Configuration
The application uses dual library setup:
```env
# .env configuration
LIBRARY_HOST_PATH="/volume1/homes/rheritage/Spicy Gif Library"
CLIPS_HOST_PATH="/volume1/homes/rheritage/Spicy Clip Library"
LIBRARY_PATHS=/library,/clips
```

Docker Compose volume mapping:
```yaml
volumes:
  - "${LIBRARY_HOST_PATH}:/library:ro"
  - "${CLIPS_HOST_PATH}:/clips:ro"
```

## Prevention & Best Practices

### 1. API Endpoint Management
- **Use consistent endpoint patterns** across the application
- **Implement endpoint configuration** in a central location
- **Test all media serving endpoints** during development
- **Document the correct endpoints** for different media types

### 2. Build Reliability
- **Use specific package versions** rather than ranges for production
- **Implement build health checks** in CI/CD pipelines
- **Monitor disk space and Docker daemon health**
- **Have fallback build strategies** for problematic environments

### 3. Video/Media Components
- **Always include `tabIndex={0}`** on interactive video elements
- **Test media controls on multiple platforms** (desktop, mobile, different browsers)
- **Implement proper focus management** for accessibility and functionality

### 4. Debugging Media Issues
1. **Check browser dev tools Network tab** for 404 errors
2. **Verify API endpoints** return 200 status codes
3. **Test direct file access** via browser URL bar
4. **Check Docker container logs** for backend errors
5. **Verify volume mounts and file permissions**

## Quick Diagnostic Commands

```bash
# Check disk space
df -h

# Restart Docker daemon
sudo docker system prune -f
sudo systemctl restart docker

# Test API endpoints directly
curl http://localhost:8087/api/health
curl http://localhost:8087/api/images
curl -I http://localhost:8087/api/images/file/123

# Check container logs
docker compose logs backend
docker compose logs frontend

# Clean rebuild
sudo docker compose build --no-cache frontend backend
```

## Conclusion

These issues were primarily caused by:
1. **Missing focus management** in video components
2. **Synology-specific build environment issues**
3. **Incorrect API endpoint configuration**
4. **Inconsistent endpoint usage across frontend**

The solutions involved systematic debugging, endpoint standardization, and platform-specific optimizations. All functionality now works correctly across desktop and mobile platforms with proper video scrubbing, GIF animation, and file serving from the dual NAS library setup.