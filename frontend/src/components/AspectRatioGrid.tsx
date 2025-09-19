import React, { useState, useRef, useEffect, useCallback, memo } from 'react'
import type { Image } from '../types'
import AnimatedThumbnail from './AnimatedThumbnail'
import FavoriteButton from './FavoriteButton'
import StarRating from './StarRating'

interface AspectRatioGridProps {
  images: Image[]
  tileWidth: number  // approximate width per column in px
  bulkMode: boolean
  selectedImages: Set<number>
  onImageClick: (imageId: number, event: React.MouseEvent) => void
  onToggleSelection: (imageId: number) => void
  paused?: boolean
  onQuickFavorite?: (imageId: number) => void
  onQuickRate?: (imageId: number, rating: number) => void
  hoverOutlineEnabled?: boolean
}

function AspectRatioGrid({
  images,
  tileWidth,
  bulkMode,
  selectedImages,
  onImageClick,
  onToggleSelection,
  paused = false,
  onQuickFavorite,
  onQuickRate,
  hoverOutlineEnabled = true,
}: AspectRatioGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  
  // Observer for lazy loading - more aggressive loading for better UX
  const observerRef = useRef<IntersectionObserver>()
  
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const imageId = parseInt(entry.target.getAttribute('data-image-id') || '0')
            if (imageId) {
              setLoadedImages(prev => new Set(prev).add(imageId))
            }
          }
        })
      },
      {
        rootMargin: '800px 0px', // Prefetch earlier to reduce pop-in
        threshold: 0.01 // Lower threshold for earlier triggering
      }
    )
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])
  
  // Set up intersection observer for each image
  const imageRef = useCallback((node: HTMLDivElement | null, imageId: number) => {
    if (node && observerRef.current) {
      node.setAttribute('data-image-id', imageId.toString())
      observerRef.current.observe(node)
    }
  }, [])

  // Immediately load visible images when component mounts or images change
  useEffect(() => {
    if (images.length > 0) {
      // Load first batch of images immediately (first 20 or so)
      const immediateLoadCount = Math.min(20, images.length)
      const immediateIds = images.slice(0, immediateLoadCount).map(img => img.id)
      
      setLoadedImages(prev => {
        const newSet = new Set(prev)
        immediateIds.forEach(id => newSet.add(id))
        return newSet
      })
    }
  }, [images])
  
  
  // Minimal gaps for tighter layout
  const columnGap = 2
  const itemMarginBottom = 2
  
  const getImageDisplaySize = (image: Image) => {
    // For masonry layout, let the image determine its own height
    // based on its natural aspect ratio
    if (!image.width || !image.height) {
      return { height: 'auto' }
    }
    
    // Return auto height to let the image scale naturally
    return { height: 'auto' }
  }
  
  return (
    <div 
      ref={containerRef}
      className="pinterest-masonry"
      style={{ 
        columnGap: `${columnGap}px`,
        columnWidth: `${tileWidth}px`
      }}
    >
      {images.map((image, index) => {
        const isLoaded = loadedImages.has(image.id)
        const size = getImageDisplaySize(image)
        
        return (
          <div
            key={image.id}
            ref={(node) => imageRef(node, image.id)}
            className={`bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-lg transition-all break-inside-avoid group ${
              bulkMode && selectedImages.has(image.id) ? 'ring-2 ring-blue-500' : ''
            } ${hoverOutlineEnabled ? 'hover:ring-2 hover:ring-blue-400/60 dark:hover:ring-blue-300/60' : ''}`.trim()}
            style={{ 
              marginBottom: `${itemMarginBottom}px`,
              // Hint the browser to skip offscreen rendering for faster scroll
              // TS may not know these properties yet; cast to any for safety
              contentVisibility: 'auto' as any,
              containIntrinsicSize: '300px 300px' as any,
              transform: 'translateZ(0)',
              willChange: 'transform',
            }}
            onClick={(e) => onImageClick(image.id, e)}
          >
            <div className="relative overflow-hidden w-full" style={{ aspectRatio: (image.aspect_ratio || 1) as any }}>
              {isLoaded ? (
                <AnimatedThumbnail
                  key={`thumb-${image.id}`}
                  image={image}
                  className="absolute inset-0 w-full h-full object-cover"
                  paused={paused}
                  priority={index < 12}
                  onClick={(e) => onImageClick(image.id, e)}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                >
                  {/* Bulk selection checkbox */}
                  {bulkMode && (
                    <div className="absolute top-2 left-2 z-10">
                      <input
                        type="checkbox"
                        checked={selectedImages.has(image.id)}
                        onChange={() => onToggleSelection(image.id)}
                        className="w-5 h-5 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}

                  {/* Quick actions overlay - only show on hover and not in bulk mode */}
                  {!bulkMode && onQuickFavorite && onQuickRate && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-end p-2">
                      <div className="flex items-center gap-2 w-full">
                        <FavoriteButton
                          isFavorite={image.favorite}
                          onClick={(e) => {
                            e.stopPropagation()
                            onQuickFavorite(image.id)
                          }}
                          className="text-white hover:text-red-400"
                        />
                        <StarRating
                          rating={image.rating}
                          onRate={(rating) => {
                            onQuickRate(image.id, rating)
                          }}
                          className="text-white"
                          size="sm"
                        />
                      </div>
                    </div>
                  )}
                </AnimatedThumbnail>
              ) : (
                // Skeleton placeholder
                <div 
                  className="w-full bg-gray-300 dark:bg-gray-700 animate-pulse"
                  style={{ 
                    aspectRatio: image.aspect_ratio || 1,
                    minHeight: '200px'
                  }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default memo(AspectRatioGrid)
