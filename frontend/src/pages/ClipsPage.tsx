import { useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { imageApi, libraryApi } from '../services/api'
import { useMutation } from 'react-query'
import AspectRatioGrid from '../components/AspectRatioGrid'
import ImageModal from '../components/ImageModal'
import type { Image } from '../types'

export default function ClipsPage() {
  const [page, setPage] = useState(1)
  const [images, setImages] = useState<Image[]>([])
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [tileWidth, setTileWidth] = useState<number>(() => {
    const saved = localStorage.getItem('clipsTileWidth')
    const num = saved ? parseInt(saved, 10) : 300
    return isNaN(num) ? 300 : Math.min(700, Math.max(160, num))
  })
  const [shuffleCount, setShuffleCount] = useState<number>(0) // 0 = not shuffled, 1-5 = shuffle iterations

  const { data, isLoading, isFetching, refetch } = useQuery(
    ['clips', page, tileWidth, shuffleCount],
    () => imageApi.getImages(page, 50, { media: 'video' }, { sort_by: shuffleCount > 0 ? 'random' : 'created_at', sort_order: 'desc' }),
    {
      keepPreviousData: true,
      onSuccess: (res) => {
        if (page === 1) setImages(res)
        else setImages(prev => [...prev, ...res])
      }
    }
  )

  // If cached data is available immediately on mount, sync it into local state
  useEffect(() => {
    if (data && page === 1 && images.length === 0) setImages(data)
  }, [data])

  const scanMutation = useMutation(libraryApi.scanLibrary, {
    onSuccess: () => {
      // Kick off a refresh soon after triggering scan
      setTimeout(() => refetch(), 1500)
    }
  })

  useEffect(() => {
    localStorage.setItem('clipsTileWidth', String(tileWidth))
  }, [tileWidth])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (selectedImageId && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const isTyping = () => {
          const el = document.activeElement as HTMLElement | null
          if (!el) return false
          const tag = el.tagName
          const editable = (el as any).isContentEditable
          return tag === 'INPUT' || tag === 'TEXTAREA' || editable
        }

        if (!isTyping()) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            handleNavigate('prev')
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            handleNavigate('next')
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [selectedImageId, images])

  useEffect(() => {
    // Reset to page 1 when shuffle count changes
    setPage(1)
    setImages([])
  }, [shuffleCount])

  useEffect(() => {
    // Refetch on page change
    refetch()
  }, [page])

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const scrollHeight = document.documentElement.scrollHeight
      const clientHeight = window.innerHeight
      if (!isFetchingMore && data && data.length === 50 && scrollTop + clientHeight >= scrollHeight - 300) {
        setIsFetchingMore(true)
        setPage(p => p + 1)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isFetchingMore, data])

  useEffect(() => {
    if (isFetchingMore) refetch().finally(() => setIsFetchingMore(false))
  }, [isFetchingMore])

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!selectedImageId || !images.length) return

    const currentIndex = images.findIndex(img => img.id === selectedImageId)
    if (currentIndex === -1) return

    let newIndex: number
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1
    } else {
      newIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0
    }
    
    setSelectedImageId(images[newIndex].id)
  }

  const handleShuffleClick = () => {
    if (shuffleCount >= 5) {
      // Reset to original order after 5 shuffles
      setShuffleCount(0)
    } else {
      // Increment shuffle count
      setShuffleCount(prev => prev + 1)
    }
  }

  const getShuffleButtonStyle = () => {
    if (shuffleCount === 0) {
      return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    }
    
    const colors = [
      'bg-purple-600 text-white', // Shuffle 1
      'bg-blue-600 text-white',   // Shuffle 2
      'bg-green-600 text-white',  // Shuffle 3
      'bg-orange-600 text-white', // Shuffle 4
      'bg-red-600 text-white'     // Shuffle 5
    ]
    
    return colors[shuffleCount - 1] || colors[0]
  }

  const getShuffleButtonText = () => {
    if (shuffleCount === 0) {
      return 'Shuffle'
    } else if (shuffleCount === 1) {
      return '🔀 Shuffled'
    } else {
      return `🔀 Shuffled ${shuffleCount}`
    }
  }

  const getShuffleButtonTitle = () => {
    if (shuffleCount === 0) {
      return 'Shuffle Clips'
    } else if (shuffleCount < 5) {
      return `Shuffled order ${shuffleCount}/5 (click to shuffle again)`
    } else {
      return 'Shuffled 5/5 (click to reset to original order)'
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="hidden md:flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-1">
          <span className="text-xs text-gray-600 dark:text-gray-300">Size</span>
          <input
            type="range"
            min={160}
            max={700}
            step={10}
            value={tileWidth}
            onChange={(e) => setTileWidth(parseInt(e.target.value, 10))}
            className="w-40"
          />
          <span className="text-xs text-gray-600 dark:text-gray-300 w-10 text-right">{tileWidth}px</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShuffleClick}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${getShuffleButtonStyle()}`}
            title={getShuffleButtonTitle()}
          >
            {getShuffleButtonText()}
          </button>
          <button
            onClick={() => scanMutation.mutate()}
            className="px-3 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-60"
            disabled={scanMutation.isLoading}
          >
            {scanMutation.isLoading ? 'Scanning…' : 'Scan Clips'}
          </button>
        </div>
      </div>

      {(isLoading || isFetching) && images.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-300">Loading clips…</div>
      ) : (data && data.length === 0 && !isFetching) ? (
        <div className="text-gray-600 dark:text-gray-300">No clips found.</div>
      ) : (
        <AspectRatioGrid
          images={images}
          tileWidth={tileWidth}
          bulkMode={false}
          selectedImages={new Set()}
          onImageClick={(id) => setSelectedImageId(id)}
          onToggleSelection={() => {}}
          paused={false}
        />
      )}

      <ImageModal 
        imageId={selectedImageId} 
        onClose={() => setSelectedImageId(null)} 
        onNavigate={handleNavigate}
      />
    </div>
  )
}
