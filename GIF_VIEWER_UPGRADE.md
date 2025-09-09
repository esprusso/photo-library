# GIF Library Upgrade Documentation

This document describes the upgrade from photo-library to an animated GIF viewer with enhanced features.

## 🎯 Features Implemented

### ✅ Aspect-Ratio Preserving Grid Layout
- **Masonry-style grid** that preserves original image aspect ratios
- **No forced cropping** - images maintain their natural proportions
- **Responsive breakpoints** for optimal viewing on all devices
- **Three grid sizes**: Small, Medium, Large with intelligent column counts

### ✅ Hover-to-Play Animation
- **Desktop hover**: Animated GIFs/videos start playing on mouse hover
- **Touch devices**: First tap plays, second tap opens detail view
- **Smooth transitions** with configurable delay (100ms default)
- **CPU-friendly**: Animations pause when not hovered

### ✅ High-Resolution Thumbnails
- **2x DPR support** (512px) for crisp thumbnails on high-DPI screens
- **3x DPR support** (768px) optional for ultra-high-DPI displays
- **Intelligent selection** based on device pixel ratio
- **Backward compatible** with existing 256px thumbnails

### ✅ Video Preview Generation
- **MP4 H.264 previews** for better performance than GIF decoding
- **WebM VP9 support** as alternative format
- **Optimized encoding** with fast preset and reasonable quality
- **Automatic fallback** to GIF if video generation fails

### ✅ Accessibility Features
- **Reduced motion support**: Respects `prefers-reduced-motion` preference
- **Manual play controls** for users who prefer not to auto-play
- **Keyboard navigation**: Enter/Space to play/pause animations
- **Proper ARIA labels** and semantic markup
- **Focus indicators** for keyboard navigation

### ✅ Lazy Loading & Performance
- **IntersectionObserver** for efficient lazy loading
- **50px root margin** for smooth prefetching
- **Progressive image loading** with placeholder states
- **Memory-efficient** video handling with pause/cleanup

### ✅ Configuration Options
- **Environment-driven config** for easy customization
- **Thumbnail scale** adjustable (2x, 3x)
- **Preview format** selection (auto, mp4, webm, gif)
- **Hover delay** tuning (default 100ms)

## 🚀 Getting Started

### 1. Configuration

Copy and customize environment files:

```bash
# Backend configuration
cp .env.example .env

# Frontend configuration (Vite)
cp frontend/.env.example frontend/.env
```

Key settings in `.env`:
```env
# Thumbnail generation
THUMBNAIL_SIZE=256          # Base thumbnail size
THUMBNAIL_SCALE=2           # Scale factor (2x = 512px)
ENABLE_3X_DPR=false        # Enable 3x DPR (768px)

# Animated previews
ANIMATED_PREVIEW_FORMAT=auto  # auto, mp4, webm, gif
HOVER_PRELOAD_DELAY_MS=100   # Hover delay

# Performance
ENABLE_FFMPEG_FALLBACK=false # Enable ffmpeg for video generation
```

### 2. Generate Enhanced Thumbnails

Run the enhanced thumbnail generator:

```bash
# Generate with default settings (2x scale, auto format)
python generate_enhanced_thumbnails.py

# Force regeneration with 3x DPR support
python generate_enhanced_thumbnails.py --force --enable-3x

# Use specific video format
python generate_enhanced_thumbnails.py --format mp4
```

### 3. Start the Application

```bash
# Start backend
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Start frontend
cd frontend
npm install
npm run dev
```

## 📁 Directory Structure

The enhanced thumbnail system creates the following structure:

```
/thumbnails/
├── [id].jpg              # Standard 1x thumbnails (256px)
├── [id]@2x.jpg           # High-DPI 2x thumbnails (512px)  
├── [id]@3x.jpg           # Ultra-high-DPI 3x thumbnails (768px)
└── previews/
    ├── [id].mp4          # MP4 video previews
    ├── [id].webm         # WebM video previews
    └── [id].gif          # Optimized GIF previews
```

## 🎨 UI Changes

### Browse Page Grid
- **Masonry layout** replaces fixed aspect ratio grid
- **Dynamic image heights** based on actual aspect ratios
- **Smooth column balancing** across breakpoints
- **Animated badges** show playable content

### Thumbnail Behavior
- **Static poster** shown by default
- **Hover animation** starts after configurable delay
- **Play/pause indicators** for animated content
- **Reduced motion** users see manual play buttons

### Visual Indicators
- **GIF badge** with play/pause state
- **Smooth transitions** for hover effects
- **Loading states** with skeleton placeholders

## ⚙️ Technical Implementation

### Backend Components

1. **EnhancedThumbnailGenerator** (`backend/services/enhanced_thumbnail_generator.py`)
   - Multi-resolution thumbnail generation
   - Video preview creation with ffmpeg
   - Intelligent format selection

2. **Updated Image Model** (`backend/models/image.py`)
   - New properties: `thumbnail_paths`, `animated_preview_paths`, `is_animated`
   - Backward-compatible API responses

### Frontend Components

1. **AnimatedThumbnail** (`frontend/src/components/AnimatedThumbnail.tsx`)
   - Hover-to-play functionality
   - Device pixel ratio awareness
   - Accessibility support

2. **AspectRatioGrid** (`frontend/src/components/AspectRatioGrid.tsx`)
   - Masonry layout implementation
   - Lazy loading with IntersectionObserver
   - Dynamic height calculation

## 📊 Performance Metrics

### Thumbnail Sizes
- **1x (256px)**: ~15-30KB JPEG
- **2x (512px)**: ~40-80KB JPEG  
- **3x (768px)**: ~80-150KB JPEG

### Video Previews
- **MP4**: ~50-200KB per 10-second loop
- **WebM**: ~40-160KB per 10-second loop
- **Optimized GIF**: ~100-500KB (30 frame limit)

### Loading Strategy
- **Progressive**: 1x → 2x/3x based on DPR
- **Format selection**: MP4 → WebM → GIF
- **Lazy loading**: Only visible thumbnails loaded

## 🔧 Customization

### Adjusting Thumbnail Sizes

Edit `.env` and regenerate:
```env
THUMBNAIL_SIZE=320    # Base size (320px)
THUMBNAIL_SCALE=2     # 2x = 640px
ENABLE_3X_DPR=true   # 3x = 960px
```

### Changing Hover Behavior

Frontend `.env`:
```env
VITE_HOVER_PRELOAD_DELAY_MS=200  # Slower hover response
```

### Video Preview Settings

Backend `.env`:
```env
ANIMATED_PREVIEW_FORMAT=mp4  # Force MP4 only
ENABLE_FFMPEG_FALLBACK=true  # Enable ffmpeg
```

## 🐛 Troubleshooting

### Missing Video Previews
1. Check ffmpeg availability: `ffmpeg -version`
2. Enable fallback: `ENABLE_FFMPEG_FALLBACK=true`
3. Check preview directory permissions

### High DPR Thumbnails Not Loading
1. Verify files exist: `ls /thumbnails/*@2x.jpg`
2. Check browser DevTools for 404 errors
3. Regenerate with `--force` flag

### Performance Issues
1. Disable 3x DPR: `ENABLE_3X_DPR=false`
2. Increase hover delay: `VITE_HOVER_PRELOAD_DELAY_MS=200`
3. Use GIF previews only: `ANIMATED_PREVIEW_FORMAT=gif`

## 📈 Future Enhancements

### Planned Features
- **WebP thumbnail format** for better compression
- **Adaptive bitrate** video previews
- **Background preloading** of next page images
- **Touch gesture** improvements
- **Advanced caching** strategies

### Performance Optimizations
- **Service Worker** for intelligent caching
- **Image CDN** integration
- **Progressive JPEG** generation
- **Client-side** image optimization

## 🎉 Migration Complete!

Your photo library has been successfully upgraded to a high-performance animated GIF viewer with:

- ✅ Aspect-ratio preserving masonry grid
- ✅ Hover-to-play animations  
- ✅ High-resolution thumbnails (2x/3x DPR)
- ✅ Video preview generation (MP4/WebM)
- ✅ Full accessibility support
- ✅ Configurable performance settings
- ✅ Progressive loading & lazy loading

The application now provides a smooth, responsive experience for browsing and viewing animated content while maintaining excellent performance and accessibility standards.