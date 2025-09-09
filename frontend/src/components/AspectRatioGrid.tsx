import React, { useState, useRef, useEffect, useCallback } from 'react'
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
}

export default function AspectRatioGrid({
  images,
  tileWidth,
  bulkMode,
  selectedImages,
  onImageClick,
  onToggleSelection,
  paused = false
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
        rootMargin: '400px', // Load images 400px before they come into view (more aggressive)
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
  
  // Gutter between columns (in px)
  const columnGap = 6
  
  const calculateImageHeight = (image: Image) => {
    if (!image.aspect_ratio || !image.width || !image.height) {
      return `${Math.max(120, Math.min(600, tileWidth * 0.9))}px`
    }
    const height = tileWidth / image.aspect_ratio
    const bounded = Math.max(120, Math.min(700, height))
    return `${Math.round(bounded)}px`
  }
  
  return (
    <div 
      ref={containerRef}
      className={"masonry-grid"}
      style={{ columnFill: 'balance', columnGap: `${columnGap}px`, columnWidth: `${tileWidth}px` }}
    >
      {images.map((image) => {
        const isLoaded = loadedImages.has(image.id)
        const imageHeight = calculateImageHeight(image)
        
        return (
          <div
            key={image.id}
            ref={(node) => imageRef(node, image.id)}
            className={`bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-lg transition-all mb-1 break-inside-avoid ${
              bulkMode && selectedImages.has(image.id) ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={(e) => onImageClick(image.id, e)}
          >
            <div
              className="relative bg-gray-100 dark:bg-gray-700 overflow-hidden"
              style={{ height: imageHeight }}
            >
              {isLoaded ? (
                <AnimatedThumbnail
                  image={image}
                  className="w-full h-full"
                  paused={paused}
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
                  
                  {/* Favorite indicator */}
                  {image.favorite && (
                    <div className={`absolute top-2 ${bulkMode ? 'right-2' : 'right-2'}`}>
                      <FavoriteButton isFavorite={true} readonly size="sm" />
                    </div>
                  )}
                  
                  {/* Rating indicator */}
                  {image.rating > 0 && (
                    <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 rounded px-1">
                      <StarRating rating={image.rating} readonly size="sm" />
                    </div>
                  )}
                </AnimatedThumbnail>
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-gray-600 animate-pulse flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            
            {/* Metadata hidden for cleaner view */}
          </div>
        )
      })}
    </div>
  )
}
