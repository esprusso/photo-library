import React, { useState, useRef, useEffect, useCallback, memo } from 'react'
import type { Image } from '../types'
import logger from '../utils/logger'

interface AnimatedThumbnailProps {
  image: Image
  className?: string
  style?: React.CSSProperties
  onLoad?: () => void
  onError?: () => void
  onClick?: (e: React.MouseEvent) => void
  children?: React.ReactNode
  paused?: boolean
  priority?: boolean
}

function AnimatedThumbnail({ 
  image, 
  className = '', 
  style,
  onLoad,
  onError,
  onClick,
  children,
  paused = false,
  priority = false
}: AnimatedThumbnailProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSrc, setCurrentSrc] = useState('')
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [imageError, setImageError] = useState(false)
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
  
  // Get the best available thumbnail source
  const cacheKey = encodeURIComponent(image.indexed_at || image.modified_at || image.created_at || '')

  const bust = (url: string) => (cacheKey ? `${url}?v=${cacheKey}` : url)

  // Build responsive srcset using available thumbnail_paths and on-demand previews
  const getSrcSet = useCallback(() => {
    const entries: string[] = []
    // Base 1x thumbnail
    const base = image.thumbnail_paths?.['1x'] || image.thumbnail_path || `/thumbnails/${image.id}.jpg`
    if (base) entries.push(`${bust(base)} 256w`)
    // Prefer provided higher densities if present
    if (image.thumbnail_paths?.['2x']) entries.push(`${bust(image.thumbnail_paths['2x'])} 512w`)
    else entries.push(`${bust(`/api/images/${image.id}/thumbnail/512`)} 512w`)
    if (image.thumbnail_paths?.['3x']) entries.push(`${bust(image.thumbnail_paths['3x'])} 768w`)
    else entries.push(`${bust(`/api/images/${image.id}/thumbnail/768`)} 768w`)
    return entries.length ? entries.join(', ') : undefined
  }, [image.id, image.thumbnail_paths, image.thumbnail_path, cacheKey])

  const sizes = "(min-width: 1280px) 320px, (min-width: 768px) 33vw, 100vw"

  const getThumbnailSrc = useCallback(() => {
    const lower = image.filename.toLowerCase()
    const isGif = lower.endsWith('.gif')
    
    if (isGif) {
      // For GIFs, we have two modes: static thumbnail or animated original
      if (isPlaying && !prefersReducedMotion && !paused) {
        return `/image-file/${image.id}`
      } else {
        // Use thumbnail for initial load
        return bust(image.thumbnail_path || `/thumbnails/${image.id}.jpg`)
      }
    }
    
    // For non-GIF images, always use thumbnail
    return bust(image.thumbnail_path || `/thumbnails/${image.id}.jpg`)
  }, [image.id, image.filename, image.thumbnail_path, isPlaying, prefersReducedMotion, paused, cacheKey])

  // Initialize source
  useEffect(() => {
    setCurrentSrc(getThumbnailSrc())
  }, [getThumbnailSrc])

  // Handle hover events for GIF animation
  const handleMouseEnter = useCallback(() => {
    if (paused || prefersReducedMotion) return
    
    setIsHovered(true)
    
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    
    // Start playing after delay
    hoverTimeoutRef.current = setTimeout(() => {
      const lower = image.filename.toLowerCase()
      const isGif = lower.endsWith('.gif')
      
      if (isGif) {
        setIsPlaying(true)
        setCurrentSrc(`/image-file/${image.id}`)
        logger.debug('Starting GIF animation for', image.filename)
      }
    }, hoverDelay)
  }, [image.id, image.filename, hoverDelay, paused, prefersReducedMotion])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    
    // Clear timeout if still waiting
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    
    // Stop playing and return to thumbnail
    if (isPlaying) {
      setIsPlaying(false)
      setCurrentSrc(bust(image.thumbnail_path || `/thumbnails/${image.id}.jpg`))
      logger.debug('Stopping GIF animation for', image.filename)
    }
  }, [image.id, image.filename, image.thumbnail_path, isPlaying, cacheKey])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  const handleImageLoad = useCallback(() => {
    setImageError(false)
    onLoad?.()
  }, [onLoad])

  const handleImageError = useCallback(() => {
    logger.warn('Image load error for', image.filename, 'trying fallback')
    setImageError(true)
    
    // Try fallback to different endpoint
    if (currentSrc.includes('/image-file/')) {
      setCurrentSrc(bust(image.thumbnail_path || `/thumbnails/${image.id}.jpg`))
    } else if (currentSrc.includes('/thumbnails/')) {
      // For thumbnails, fallback to the proper API endpoint for original image
      setCurrentSrc(`/api/images/${image.id}/thumbnail/512`)
    }
    
    onError?.()
  }, [currentSrc, image.id, image.filename, image.thumbnail_path, onError])

  const isGif = image.filename.toLowerCase().endsWith('.gif')
  const showPlayIndicator = isGif && !isPlaying && !prefersReducedMotion

  return (
    <div 
      className={`relative ${className}`}
      style={{ transform: 'translateZ(0)', willChange: 'transform', ...style }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <img
        src={currentSrc}
        srcSet={isGif ? undefined : getSrcSet()}
        sizes={isGif ? undefined : sizes}
        alt={image.filename}
        className="w-full h-full object-cover"
        decoding="async"
        fetchPriority={priority ? 'high' as any : 'auto' as any}
        onLoad={handleImageLoad}
        onError={handleImageError}
        loading="lazy"
      />
      
      {/* GIF Play Indicator */}
      {showPlayIndicator && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black bg-opacity-20">
          <div className="bg-white bg-opacity-80 rounded-full p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      )}
      
      {/* Reduced Motion Manual Control */}
      {isGif && prefersReducedMotion && (
        <button
          className="absolute top-2 right-2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded px-2 py-1 text-xs"
          onClick={(e) => {
            e.stopPropagation()
            setIsPlaying(!isPlaying)
            setCurrentSrc(isPlaying ? bust(image.thumbnail_path || `/thumbnails/${image.id}.jpg`) : `/image-file/${image.id}`)
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      )}
      
      {children}
    </div>
  )
}

export default memo(AnimatedThumbnail)
