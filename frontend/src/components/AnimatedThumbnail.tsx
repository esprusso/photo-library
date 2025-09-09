import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { Image } from '../types'

interface AnimatedThumbnailProps {
  image: Image
  className?: string
  style?: React.CSSProperties
  onLoad?: () => void
  onError?: () => void
  onClick?: (e: React.MouseEvent) => void
  children?: React.ReactNode
  paused?: boolean
}

export default function AnimatedThumbnail({ 
  image, 
  className = '', 
  style,
  onLoad,
  onError,
  onClick,
  children,
  paused = false
}: AnimatedThumbnailProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSrc, setCurrentSrc] = useState('')
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [fallbackIndex, setFallbackIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hoverTimeoutRef = useRef<NodeJS.Timeout>()
  
  // Configuration from environment or defaults
  const hoverDelay = parseInt(import.meta.env.VITE_HOVER_PRELOAD_DELAY_MS || '100')
  
  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])
  
  // Get all possible fallback sources for videos
  const getVideoFallbacks = useCallback(() => {
    const fallbacks = [
      // Try enhanced thumbnail endpoint first
      `/api/images/${image.id}/thumbnail/256`,
      // Try different sizes from enhanced thumbnails
      `/api/images/${image.id}/thumbnail/512`,
      // Try thumbnail paths if available
      image.thumbnail_paths?.['2x'],
      image.thumbnail_paths?.['1x'],
      // Try basic thumbnail
      image.thumbnail_path,
      // Try the original video file endpoint (may generate thumbnail on demand)
      `/api/images/file/${image.id}`
    ].filter(Boolean) as string[]
    
    return fallbacks
  }, [image.thumbnail_paths, image.thumbnail_path, image.id])

  // Get the best available thumbnail source (initial load - always use first option)
  const getThumbnailSrc = useCallback(() => {
    const lower = image.filename.toLowerCase()
    const isGif = lower.endsWith('.gif')
    const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.m4v')
    
    if (isGif) {
      const originalUrl = `/api/image-file/${image.id}`
      return originalUrl
    }
    
    if (isVideo) {
      // For initial load, always start with the best option
      const fallbacks = getVideoFallbacks()
      return fallbacks[0] || `/api/image-file/${image.id}`
    }
    
    // For non-GIF files, use thumbnail logic
    if (!image.thumbnail_paths || Object.keys(image.thumbnail_paths).length === 0) {
      return image.thumbnail_path
    }
    
    const dpr = window.devicePixelRatio || 1
    
    // Choose appropriate resolution based on DPR
    if (dpr >= 3 && image.thumbnail_paths['3x']) {
      return image.thumbnail_paths['3x']
    } else if (dpr >= 2 && image.thumbnail_paths['2x']) {
      return image.thumbnail_paths['2x']
    } else if (image.thumbnail_paths['2x']) {
      // Default to 2x for better quality
      return image.thumbnail_paths['2x']
    } else if (image.thumbnail_paths['1x']) {
      return image.thumbnail_paths['1x']
    }
    return image.thumbnail_path
  }, [image.thumbnail_paths, image.thumbnail_path, image.id, image.filename, getVideoFallbacks])
  
  // Get the best preview source for animated content
  const getPreviewSrc = useCallback(() => {
    
    // Check if this is a GIF by filename (more reliable than is_animated property)
    const lower = image.filename.toLowerCase()
    const isGif = lower.endsWith('.gif')
    const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.m4v')
    
    if (!image.is_animated && !isGif) {
      return null
    }
    
    // If we have animated preview paths, use them
    if (image.animated_preview_paths && Object.keys(image.animated_preview_paths).length > 0) {
      // Prefer MP4 > WebM > GIF for better performance
      if (image.animated_preview_paths.mp4) {
        return image.animated_preview_paths.mp4
      } else if (image.animated_preview_paths.webm) {
        return image.animated_preview_paths.webm
      } else if (image.animated_preview_paths.gif) {
        return image.animated_preview_paths.gif
      }
    }
    
    // For GIF files, we render with an <img> that points to the original;
    // do NOT provide a video preview source so the video overlay stays hidden.
    if (isGif) {
      return null
    }
    // For videos, cycle preview frames if available
    if (isVideo) {
      const frames = (image.animated_preview_paths && (image.animated_preview_paths as any).frames) as string[] | undefined
      if (frames && frames.length > 0) {
        return frames[0]
      }
      return null
    }
    
    return null
  }, [image.animated_preview_paths, image.is_animated, image.filename, image.id])
  
  // Initialize and reset fallback index when image changes
  useEffect(() => {
    setFallbackIndex(0) // Reset fallback index for new image
    
    const lower = image.filename.toLowerCase()
    const isGif = lower.endsWith('.gif')
    const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.m4v')
    
    if (isGif) {
      if (paused) {
        // Show static thumbnail when paused
        setCurrentSrc(image.thumbnail_path)
        setIsPlaying(false)
      } else {
        // For GIFs, always use the file endpoint to serve original
        const originalGifUrl = `/api/images/file/${image.id}`
        setCurrentSrc(originalGifUrl)
        setIsPlaying(true)
      }
    } else if (isVideo) {
      // Start with poster
      setCurrentSrc(getThumbnailSrc())
      setIsPlaying(false)
    } else {
      // For static images, use thumbnail normally
      setCurrentSrc(getThumbnailSrc())
      setIsPlaying(false)
    }
  }, [getThumbnailSrc, image.filename, image.id, paused, image.thumbnail_path])
  
  // Disabled hover functionality since we want auto-play
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
    const frames = (image.animated_preview_paths && (image.animated_preview_paths as any).frames) as string[] | undefined
    if (frames && frames.length > 1) {
      let idx = 0
      const advance = () => {
        idx = (idx + 1) % frames.length
        setCurrentSrc(frames[idx])
      }
      hoverTimeoutRef.current = setInterval(advance, 250) as any
    }
  }, [])
  
  // Disabled hover functionality since we want auto-play
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    if (hoverTimeoutRef.current) {
      clearInterval(hoverTimeoutRef.current)
      hoverTimeoutRef.current = undefined
    }
    // Reset to first poster frame
    const frames = (image.animated_preview_paths && (image.animated_preview_paths as any).frames) as string[] | undefined
    if (frames && frames.length > 0) setCurrentSrc(frames[0])
  }, [])
  
  const handlePlayToggle = useCallback((e: React.MouseEvent) => {
    if (!image.is_animated || !getPreviewSrc()) return
    
    e.preventDefault()
    e.stopPropagation()
    
    if (isPlaying) {
      setIsPlaying(false)
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      }
      setCurrentSrc(getThumbnailSrc())
    } else {
      setIsPlaying(true)
      const previewSrc = getPreviewSrc()!
      if (previewSrc.endsWith('.gif')) {
        setCurrentSrc(previewSrc)
      } else if (videoRef.current) {
        videoRef.current.src = previewSrc
        videoRef.current.play().catch(console.error)
      }
    }
  }, [image.is_animated, isPlaying, getPreviewSrc, getThumbnailSrc])
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && image.is_animated) {
      handlePlayToggle(e as any)
    }
  }, [image.is_animated, handlePlayToggle])
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])
  
  const previewSrc = getPreviewSrc()
  const hasVideoPreview = Boolean(previewSrc)
  
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={image.is_animated ? 0 : -1}
      role={image.is_animated ? 'button' : 'img'}
      aria-label={image.is_animated ? `Animated image: ${image.filename}. Press Enter or Space to play/pause.` : image.filename}
    >
      {/* Main image/gif */}
      <img
        src={currentSrc}
        alt={image.filename}
        className="w-full h-full object-contain transition-transform duration-200 hover:scale-105"
        style={{ display: hasVideoPreview && isPlaying ? 'none' : 'block' }}
        onLoad={onLoad}
        onError={(e) => {
          console.error(`Failed to load thumbnail: ${currentSrc}`)
          console.error(`Image ID: ${image.id}, filename: ${image.filename}`)
          
          const lower = image.filename.toLowerCase()
          const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.m4v')
          
          if (isVideo) {
            const fallbacks = getVideoFallbacks()
            const nextIndex = fallbackIndex + 1
            
            if (nextIndex < fallbacks.length) {
              console.log(`Trying video fallback ${nextIndex}/${fallbacks.length - 1}: ${fallbacks[nextIndex]}`)
              setFallbackIndex(nextIndex)
              setCurrentSrc(fallbacks[nextIndex])
              return // Don't call onError yet, we have more fallbacks to try
            } else {
              console.error(`All ${fallbacks.length} video fallbacks exhausted for ${image.filename}`)
            }
          } else {
            // For non-videos, try basic thumbnail fallback
            if (currentSrc !== image.thumbnail_path && image.thumbnail_path) {
              console.log(`Trying fallback thumbnail: ${image.thumbnail_path}`)
              setCurrentSrc(image.thumbnail_path)
              return
            }
          }
          
          console.error('All thumbnail fallbacks exhausted')
          if (onError) onError()
        }}
        loading="lazy"
      />
      
      {/* Video preview overlay */}
      {hasVideoPreview && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ display: isPlaying ? 'block' : 'none' }}
          loop
          muted
          playsInline
          preload="none"
        />
      )}
      
      {/* Animated badge removed per request */}
      
      {/* Manual play button for reduced motion users */}
      {prefersReducedMotion && image.is_animated && !isPlaying && (
        <button
          onClick={handlePlayToggle}
          className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 hover:bg-opacity-40 transition-colors"
          aria-label="Play animation"
        >
          <div className="bg-white bg-opacity-90 rounded-full p-2">
            <svg className="w-6 h-6 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </button>
      )}
      
      {children}
    </div>
  )
}
