 
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { imageApi, libraryApi, jobApi, categoryApi, tagApi } from '../services/api'
import CreatableSelect from 'react-select/creatable'
import ImageModal from '../components/ImageModal'
import StarRating from '../components/StarRating'
import FavoriteButton from '../components/FavoriteButton'
import AspectRatioGrid from '../components/AspectRatioGrid'
import type { Image, ImageFilters } from '../types'

type GridSize = 'small' | 'medium' | 'large' // legacy; will be replaced by slider

export default function BrowsePage() {
  const BROWSE_DEBUG = (import.meta as any)?.env?.VITE_BROWSE_DEBUG === 'true'
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [images, setImages] = useState<Image[]>([])
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [tileWidth, setTileWidth] = useState<number>(() => {
    const saved = localStorage.getItem('tileWidth')
    const num = saved ? parseInt(saved, 10) : 250
    return isNaN(num) ? 250 : Math.min(600, Math.max(120, num))
  })
  const [pauseGifs, setPauseGifs] = useState<boolean>(() => {
    return localStorage.getItem('pauseGifs') === 'true'
  })
  const [showAutoCategorize, setShowAutoCategorize] = useState<boolean>(() => {
    return localStorage.getItem('showAutoCategorize') !== 'false'
  })
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false)
  const [showSizePopover, setShowSizePopover] = useState(false)
  const [shuffleCount, setShuffleCount] = useState<number>(0) // 0 = not shuffled, 1-5 = shuffle iterations

  // Keyboard shortcuts for quick selection
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      const editable = (el as any).isContentEditable
      return tag === 'INPUT' || tag === 'TEXTAREA' || editable
    }

    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return
      if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        setBulkMode((v) => !v)
        if (!bulkMode) setSelectedImages(new Set())
      } else if (e.key.toLowerCase() === 'a' && bulkMode) {
        e.preventDefault()
        setSelectedImages(new Set(images.map((img) => img.id)))
      } else if (e.key === 'Escape' && bulkMode) {
        e.preventDefault()
        setBulkMode(false)
        setSelectedImages(new Set())
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bulkMode, images])


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

  const handleImageClick = (imageId: number, event: React.MouseEvent) => {
    if (bulkMode) {
      event.preventDefault()
      const clickedIndex = images.findIndex((img) => img.id === imageId)
      if (event.shiftKey && lastSelectedIndex !== null && clickedIndex !== -1) {
        const start = Math.min(lastSelectedIndex, clickedIndex)
        const end = Math.max(lastSelectedIndex, clickedIndex)
        setSelectedImages((prev) => {
          const newSet = new Set(prev)
          for (let i = start; i <= end; i++) {
            const id = images[i]?.id
            if (id != null) newSet.add(id)
          }
          return newSet
        })
      } else {
        // Default toggle for single item (supports cmd/ctrl multi toggling too)
        toggleImageSelection(imageId)
      }
      setLastSelectedIndex(clickedIndex)
    } else {
      setSelectedImageId(imageId)
    }
  }

  const toggleImageSelection = (imageId: number) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(imageId)) {
        newSet.delete(imageId)
      } else {
        newSet.add(imageId)
      }
      return newSet
    })
  }

  const toggleBulkMode = () => {
    setBulkMode(!bulkMode)
    if (bulkMode) {
      setSelectedImages(new Set())
    }
    setLastSelectedIndex(null)
  }

  const selectAll = () => {
    setSelectedImages(new Set(images.map(img => img.id)))
  }

  const clearSelection = () => {
    setSelectedImages(new Set())
  }

  // Bulk operations
  const bulkFavoriteMutation = useMutation(
    async (imageIds: number[]) => {
      await Promise.all(
        imageIds.map(id => imageApi.toggleFavorite(id))
      )
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['images'])
        refetch()
      }
    }
  )

  const bulkDownloadMutation = useMutation(
    (imageIds: number[]) => imageApi.downloadImages(imageIds),
    {
      onSuccess: (data) => {
        // Open download URL
        const link = document.createElement('a')
        link.href = data.download_url
        link.download = ''
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    }
  )

  const handleBulkFavorite = () => {
    const selectedIds = Array.from(selectedImages)
    bulkFavoriteMutation.mutate(selectedIds)
  }

  const handleBulkDownload = () => {
    const selectedIds = Array.from(selectedImages)
    bulkDownloadMutation.mutate(selectedIds)
  }

  const handleBulkRate = (rating: number) => {
    const selectedIds = Array.from(selectedImages)
    Promise.all(
      selectedIds.map(id => imageApi.setRating(id, rating))
    ).then(() => {
      queryClient.invalidateQueries(['images'])
      refetch()
    })
  }


  // Bulk tag state and mutation (disabled due to timeouts)
  type TagOption = { label: string; value: string }
  const { data: allTags } = useQuery('tags', () => tagApi.getTags('', 'name'), {
    enabled: false, // Temporarily disable due to API timeouts
    retry: 1,
  })
  const tagOptions: TagOption[] = (allTags || []).map((t: any) => ({ label: t.name, value: t.name }))
  const [bulkTagInput, setBulkTagInput] = useState('')
  const [bulkSelectedTagOptions, setBulkSelectedTagOptions] = useState<TagOption[]>([])
  const bulkAddTagsMutation = useMutation(
    async ({ imageIds, tags }: { imageIds: number[]; tags: string[] }) => {
      await Promise.all(imageIds.map((id) => imageApi.addTags(id, tags)))
    },
    {
      onSuccess: async () => {
        setBulkTagInput('')
        setBulkSelectedTagOptions([])
        await queryClient.invalidateQueries(['images'])
        await queryClient.invalidateQueries('tags')
        refetch()
      },
    }
  )

  const handleBulkApplyTags = () => {
    const ids = Array.from(selectedImages)
    if (ids.length === 0) return
    const typed = bulkTagInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const fromSelect = bulkSelectedTagOptions.map((o) => o.value)
    const tags = Array.from(new Set([...fromSelect, ...typed]))
    if (tags.length === 0) return
    bulkAddTagsMutation.mutate({ imageIds: ids, tags })
  }

  // Bulk categories state and mutation (disabled due to timeouts)
  type CatOption = { label: string; value: string; id?: number }
  const { data: allCategories } = useQuery(['categories', 'name'], () => categoryApi.getCategories('', 'name'), {
    enabled: false, // Temporarily disable due to API timeouts
    retry: 1,
  })
  const categoryOptions: CatOption[] = (allCategories || []).map((c: any) => ({ label: c.name, value: c.name, id: c.id }))
  const [bulkCategoryInput, setBulkCategoryInput] = useState('')
  const [bulkSelectedCategoryOptions, setBulkSelectedCategoryOptions] = useState<CatOption[]>([])

  const bulkAddCategoriesMutation = useMutation(
    async ({ imageIds, categoryNames }: { imageIds: number[]; categoryNames: string[] }) => {
      // Build a map of existing categories
      const existing = new Map<string, number>()
      for (const c of (allCategories || [])) existing.set(c.name, c.id)

      // Ensure categories exist
      const catIds: number[] = []
      for (const name of categoryNames) {
        const hit = existing.get(name)
        if (hit) {
          catIds.push(hit)
        } else {
          try {
            const created = await categoryApi.createCategory(name)
            catIds.push(created.id)
            existing.set(created.name, created.id)
          } catch (e) {
            const fallbackId = existing.get(name)
            if (fallbackId) catIds.push(fallbackId)
          }
        }
      }

      // Add images to each category
      await Promise.all(catIds.map((cid) => categoryApi.addImagesToCategory(cid, imageIds)))
    },
    {
      onSuccess: async () => {
        setBulkCategoryInput('')
        setBulkSelectedCategoryOptions([])
        await queryClient.invalidateQueries(['images'])
        await queryClient.invalidateQueries(['categories'])
        refetch()
      },
    }
  )

  const handleBulkApplyCategories = () => {
    const ids = Array.from(selectedImages)
    if (ids.length === 0) return
    const typed = bulkCategoryInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const fromSelect = bulkSelectedCategoryOptions.map((o) => o.value)
    const names = Array.from(new Set([...fromSelect, ...typed]))
    if (names.length === 0) return
    bulkAddCategoriesMutation.mutate({ imageIds: ids, categoryNames: names })
  }


  // Build filters from URL search params
  const filters: ImageFilters = {
    media: 'gif'  // Only show GIFs on Browse; videos are in Clips
  }
  const rating = searchParams.get('rating')
  const favorite = searchParams.get('favorite')
  const categories = searchParams.get('categories')
  const tagsParam = searchParams.get('tags')
  const includeStatic = searchParams.get('include_static')
  
  if (rating) filters.rating = parseInt(rating)
  if (favorite === 'true') filters.favorite = true
  if (categories) filters.categories = [categories]
  if (tagsParam) filters.tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean)
  if (includeStatic === 'true') filters.exclude_static = false

  const { data, isLoading, isError, refetch, isFetching, error } = useQuery(
    ['images', page, filters, shuffleCount],
    () => imageApi.getImages(page, 50, filters, { sort_by: shuffleCount > 0 ? 'random' : 'created_at', sort_order: 'desc' }),
    {
      keepPreviousData: true,
      retry: 2,
      retryDelay: 1000,
      onSuccess: (res) => {
        if (page === 1) setImages(res)
        else setImages((prev) => [...prev, ...res])
      },
      onError: (err: any) => {
        if (BROWSE_DEBUG) {
          console.error('Failed to fetch images:', err)
          if (err.code === 'ECONNABORTED') {
            console.error('API connection timed out - check if backend is running')
          }
        }
      }
    }
  )

  // Sync cached data to local state to avoid brief "No images" flash when toggling shuffle
  useEffect(() => {
    if (data && page === 1 && images.length === 0) setImages(data)
  }, [data])

  // Test API connectivity on mount and check file formats
  useEffect(() => {
    const testConnection = async () => {
      try {
        if (BROWSE_DEBUG) console.log('Testing API connectivity...')
        const result = await libraryApi.testConnection()
        if (BROWSE_DEBUG) console.log('API connection successful:', result)
        
        // Check what file formats we have
        try {
          const formatResponse = await fetch('/api/debug/file-formats')
          if (formatResponse.ok) {
            const formatData = await formatResponse.json()
            if (formatData.error) {
              if (BROWSE_DEBUG) console.error('Debug endpoint error:', formatData.error)
              // Try simpler fallback
              const simpleResponse = await fetch('/api/debug/simple-stats')
              if (simpleResponse.ok) {
                const simpleData = await simpleResponse.json()
                if (BROWSE_DEBUG) {
                  console.log('=== SIMPLE FILE BREAKDOWN ===')
                  console.log(`Total images in database: ${simpleData.total_images}`)
                  console.log(`GIF files found: ${simpleData.gif_files}`)
                  console.log('Sample filenames:', simpleData.sample_filenames)
                }
                
                if (simpleData.gif_files === 0) {
                  console.warn('⚠️ NO GIF FILES FOUND! Your library may contain only static images.')
                  console.warn('💡 Try clicking "🎬 Animated Only" button to switch to "📷 All Formats"')
                }
              }
            } else {
              if (BROWSE_DEBUG) {
                console.log('=== FILE FORMAT BREAKDOWN ===')
                console.log(`Total files in database: ${formatData.total_files}`)
                console.log(`Animated files (GIFs, videos): ${formatData.animated_files}`) 
                console.log(`Static files (JPGs, PNGs, etc.): ${formatData.static_files}`)
                console.log(`Files remaining after exclude_static filter: ${formatData.files_after_static_filter}`)
                console.log('Sample filenames:', formatData.sample_filenames)
                console.log('File formats breakdown:', formatData.formats)
              }
              
              if (formatData.animated_files === 0) {
                console.warn('⚠️ NO ANIMATED FILES FOUND! All files appear to be static images.')
                console.warn('💡 Try clicking "🎬 Animated Only" button to switch to "📷 All Formats"')
              } else if (formatData.files_after_static_filter === 0) {
                console.warn('⚠️ FILTER EXCLUDING ALL FILES! The exclude_static filter is removing everything.')
              } else {
                if (BROWSE_DEBUG) console.log(`✅ Found ${formatData.files_after_static_filter} files that should display with current filter`)
              }
            }
          }
        } catch (debugError) {
          if (BROWSE_DEBUG) console.error('Failed to fetch debug info:', debugError)
        }
      } catch (err) {
        if (BROWSE_DEBUG) console.error('API connection failed:', err)
      }
    }
    testConnection()
  }, [])

  // Poll running jobs for visibility of background processing
  const indexingJobs = useQuery(['jobs', 'indexing', 'running'], () => jobApi.getJobs('indexing', 'running'), {
    enabled: true, // Re-enabled for progress tracking
    refetchInterval: 2000,
    retry: 1,
  })
  const thumbnailJobs = useQuery(['jobs', 'thumbnailing', 'running'], () => jobApi.getJobs('thumbnailing', 'running'), {
    enabled: true, // Re-enabled for progress tracking
    refetchInterval: 2000, 
    retry: 1,
  })

  const scanMutation = useMutation(libraryApi.scanLibrary, {
    onSuccess: async () => {
      setPage(1)
      setImages([])
      await queryClient.invalidateQueries('library-stats')
      await refetch()
    },
  })

  const categorizeMutation = useMutation(categoryApi.autoCategorizeByFolders, {
    onSuccess: async () => {
      // Refresh images to show new categories
      await queryClient.invalidateQueries(['images'])
      await refetch()
    },
  })



  useEffect(() => {
    // Reset to page 1 when filters change
    setPage(1)
    setImages([])
  }, [JSON.stringify(filters), shuffleCount])

  useEffect(() => {
    // Refetch on page change
    refetch()
  }, [page])

  useEffect(() => {
    localStorage.setItem('tileWidth', String(tileWidth))
  }, [tileWidth])

  useEffect(() => {
    localStorage.setItem('pauseGifs', pauseGifs ? 'true' : 'false')
  }, [pauseGifs])

  // Show "Return to Top" after scrolling down
  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      setShowScrollTop(scrollTop > 200)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Listen for UI preference changes (from Settings) and apply instantly
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail || {}
      if (typeof detail.showAutoCategorize === 'boolean') {
        setShowAutoCategorize(detail.showAutoCategorize)
      }
    }
    window.addEventListener('ui-preferences', handler as any)
    return () => window.removeEventListener('ui-preferences', handler as any)
  }, [])

  // Keep grid in sync when a single image is updated in the modal
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail || {}
      const id: number | undefined = detail.id
      if (!id) return
      setImages(prev => prev.map(img => (
        img.id === id ? { ...img, ...('rating' in detail ? { rating: detail.rating } : {}), ...('favorite' in detail ? { favorite: detail.favorite } : {}) } : img
      )))
    }
    window.addEventListener('image-updated', handler as any)
    return () => window.removeEventListener('image-updated', handler as any)
  }, [])

  // Infinite scroll effect
  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId)
      
      timeoutId = setTimeout(() => {
        if (isFetching || !data || data.length < 50) return

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop
        const scrollHeight = document.documentElement.scrollHeight
        const clientHeight = window.innerHeight
        
        // Load more when user is 300px from bottom
        if (scrollTop + clientHeight >= scrollHeight - 300) {
          setPage(prevPage => prevPage + 1)
        }
      }, 100) // Throttle to 100ms
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [isFetching, data])

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
      return 'Shuffle GIFs'
    } else if (shuffleCount < 5) {
      return `Shuffled order ${shuffleCount}/5 (click to shuffle again)`
    } else {
      return 'Shuffled 5/5 (click to reset to original order)'
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {(filters.rating || filters.favorite || filters.exclude_static) && (
            <div className="flex items-center space-x-2 mt-1">
              {filters.rating && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  {filters.rating} Star{filters.rating !== 1 ? 's' : ''}
                </span>
              )}
              {filters.favorite && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                  Favorites
                </span>
              )}
              {filters.media === 'gif' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  GIFs Only
                </span>
              )}
              <Link 
                to="/browse" 
                className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Clear filters
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Format Filter Toggle */}
          <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => {
                const newUrl = new URL(window.location)
                if (filters.exclude_static) {
                  newUrl.searchParams.set('include_static', 'true')
                } else {
                  newUrl.searchParams.delete('include_static')
                }
                window.history.pushState({}, '', newUrl.toString())
                window.location.reload()
              }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                filters.exclude_static
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
              }`}
              title={filters.media === 'gif' ? 'Showing GIFs only' : 'Showing all formats'}
            >
              {filters.media === 'gif' ? '🎬 GIFs Only' : '📷 All Formats'}
            </button>
          </div>
          {/* Size Slider */}
          <div className="hidden md:flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-1">
            <span className="text-xs text-gray-600 dark:text-gray-300">Size</span>
            <input
              type="range"
              min={120}
              max={600}
              step={10}
              value={tileWidth}
              onChange={(e) => setTileWidth(parseInt(e.target.value, 10))}
              className="w-40"
            />
            <span className="text-xs text-gray-600 dark:text-gray-300 w-10 text-right">{tileWidth}px</span>
          </div>
          <button
            onClick={handleShuffleClick}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${getShuffleButtonStyle()}`}
            title={getShuffleButtonTitle()}
          >
            {getShuffleButtonText()}
          </button>
          <button
            onClick={toggleBulkMode}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              bulkMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {bulkMode ? 'Exit Selection' : 'Select Images'}
          </button>
          {showAutoCategorize && (
            <button
              onClick={() => categorizeMutation.mutate()}
              className="px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
              disabled={categorizeMutation.isLoading}
              title="Auto-categorize images based on folder structure"
            >
              {categorizeMutation.isLoading ? 'Categorizing…' : '📁 Auto-Categorize'}
            </button>
          )}
          <button
            onClick={() => scanMutation.mutate()}
            className="px-3 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-60"
            disabled={scanMutation.isLoading}
          >
            {scanMutation.isLoading ? 'Scanning…' : 'Scan Library'}
          </button>
        </div>
      </div>

      {/* Active job banners for scan progress */}
      {indexingJobs.data && indexingJobs.data.length > 0 && (
        <div className="space-y-2">
          {indexingJobs.data.map((job: any) => (
            <JobBanner key={job.id} title="🔍 Scanning Library" job={job} />
          ))}
        </div>
      )}
      
      {thumbnailJobs.data && thumbnailJobs.data.length > 0 && (
        <div className="space-y-2">
          {thumbnailJobs.data.map((job: any) => (
            <JobBanner key={job.id} title="🖼️ Generating Thumbnails" job={job} />
          ))}
        </div>
      )}

      {(isLoading || isFetching) && images.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-300">Loading images…</div>
      ) : isError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <div className="text-red-800 dark:text-red-200 font-medium">Failed to load images</div>
          <div className="text-red-600 dark:text-red-300 text-sm mt-2">
            {error && (error as any).code === 'ECONNABORTED' 
              ? 'API connection timed out. Check if the backend is running.'
              : 'Unable to connect to the API. Please check your connection.'}
          </div>
          <button 
            onClick={() => refetch()} 
            className="mt-3 px-3 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700 text-red-800 dark:text-red-200 rounded text-sm"
          >
            Retry
          </button>
        </div>
      ) : (data && data.length === 0 && !isFetching) ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
          <div className="text-yellow-800 dark:text-yellow-200 font-medium">No images found</div>
          <div className="text-yellow-700 dark:text-yellow-300 text-sm mt-2">
            {filters.media === 'gif' ? (
              <>
                Currently showing GIFs only. 
                <button 
                  onClick={() => {
                    const newUrl = new URL(window.location)
                    newUrl.searchParams.set('include_static', 'true')
                    window.history.pushState({}, '', newUrl.toString())
                    window.location.reload()
                  }}
                  className="ml-1 text-yellow-600 dark:text-yellow-400 underline hover:no-underline"
                >
                  Click here to show all formats
                </button>
                , or try scanning your library.
              </>
            ) : (
              'Try scanning your library to index new images.'
            )}
          </div>
          <div className="text-yellow-600 dark:text-yellow-400 text-xs mt-2">
            Check the browser console for file format statistics.
          </div>
        </div>
      ) : (
        <AspectRatioGrid
          images={images}
          tileWidth={tileWidth}
          bulkMode={bulkMode}
          selectedImages={selectedImages}
          onImageClick={handleImageClick}
          onToggleSelection={toggleImageSelection}
          paused={pauseGifs}
        />
      )}

      {isFetching && images.length > 0 && (
        <div className="flex justify-center py-8">
          <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm">Loading more images...</span>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {bulkMode && selectedImages.size > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {selectedImages.size} selected
              </span>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={selectAll}
                  className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
                >
                  Select All ({images.length})
                </button>
                
                <button
                  onClick={clearSelection}
                  className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear
                </button>
              </div>
              
              <div className="h-4 border-l border-gray-300 dark:border-gray-600"></div>
              
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <button
                  onClick={handleBulkFavorite}
                  disabled={bulkFavoriteMutation.isLoading}
                  className="px-3 py-1 text-sm rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800 transition-colors disabled:opacity-50"
                  title="Toggle favorites"
                >
                  {bulkFavoriteMutation.isLoading ? '⏳' : '❤️'} Favorite
                </button>
                
                <div className="relative group">
                  <button
                    className="px-3 py-1 text-sm rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:hover:bg-yellow-800 transition-colors"
                    title="Rate images"
                  >
                    ⭐ Rate
                  </button>
                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block">
                    <div className="bg-white dark:bg-gray-700 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 py-1">
                      {[1, 2, 3, 4, 5].map((stars) => (
                        <button
                          key={stars}
                          onClick={() => handleBulkRate(stars)}
                          className="flex items-center px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 w-full text-left"
                        >
                          <span className="flex">
                            {Array.from({ length: 5 }, (_, i) => (
                              <span key={i} className={i < stars ? 'text-yellow-400' : 'text-gray-300'}>⭐</span>
                            ))}
                          </span>
                          <span className="ml-2">{stars} Star{stars !== 1 ? 's' : ''}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => handleBulkRate(0)}
                        className="flex items-center px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 w-full text-left"
                      >
                        <span className="text-gray-400">Clear Rating</span>
                      </button>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={handleBulkDownload}
                  disabled={bulkDownloadMutation.isLoading}
                  className="px-3 py-1 text-sm rounded bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800 transition-colors disabled:opacity-50"
                  title="Download selected images as ZIP"
                >
                  {bulkDownloadMutation.isLoading ? '⏳' : '📥'} Download
                </button>
                

                {/* Bulk Tagging */}
                <div className="flex items-center space-x-2">
                  <div className="min-w-[220px]">
                    <CreatableSelect
                      isMulti
                      value={bulkSelectedTagOptions}
                      onChange={(val: any) => setBulkSelectedTagOptions(val || [])}
                      options={tagOptions}
                      placeholder="Add tags…"
                      classNamePrefix="select"
                      menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                      styles={{ menuPortal: (base: any) => ({ ...base, zIndex: 9999 }) }}
                      onKeyDown={(e: any) => {
                        if (e.key === 'Enter') {
                          setTimeout(() => handleBulkApplyTags(), 30)
                        }
                      }}
                    />
                  </div>
                  <input
                    value={bulkTagInput}
                    onChange={(e) => setBulkTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBulkApplyTags() } }}
                    placeholder="or type: tag1, tag2"
                    className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
                    style={{ minWidth: 180 }}
                  />
                  <button
                    onClick={handleBulkApplyTags}
                    disabled={bulkAddTagsMutation.isLoading || selectedImages.size === 0}
                    className="px-3 py-1 text-sm rounded bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800 transition-colors disabled:opacity-50"
                    title="Apply tags to all selected images"
                  >
                    {bulkAddTagsMutation.isLoading ? '⏳' : '➕ Tags'}
                  </button>
                </div>

                {/* Bulk Categories */}
                <div className="flex items-center space-x-2">
                  <div className="min-w-[220px]">
                    <CreatableSelect
                      isMulti
                      value={bulkSelectedCategoryOptions}
                      onChange={(val: any) => setBulkSelectedCategoryOptions(val || [])}
                      options={categoryOptions}
                      placeholder="Add categories…"
                      classNamePrefix="select"
                      menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                      styles={{ menuPortal: (base: any) => ({ ...base, zIndex: 9999 }) }}
                      onKeyDown={(e: any) => {
                        if (e.key === 'Enter') {
                          setTimeout(() => handleBulkApplyCategories(), 30)
                        }
                      }}
                    />
                  </div>
                  <input
                    value={bulkCategoryInput}
                    onChange={(e) => setBulkCategoryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBulkApplyCategories() } }}
                    placeholder="or type: Landscapes, Portraits"
                    className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
                    style={{ minWidth: 180 }}
                  />
                  <button
                    onClick={handleBulkApplyCategories}
                    disabled={bulkAddCategoriesMutation.isLoading || selectedImages.size === 0}
                    className="px-3 py-1 text-sm rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-800 transition-colors disabled:opacity-50"
                    title="Add to categories for all selected images"
                  >
                    {bulkAddCategoriesMutation.isLoading ? '⏳' : '➕ Categories'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      <ImageModal
        imageId={selectedImageId}
        onClose={() => setSelectedImageId(null)}
        onNavigate={handleNavigate}
      />

      {/* Floating Action Buttons (bottom-right) - Hidden on mobile when modal is open */}
      <div className={`fixed right-4 md:right-6 bottom-6 z-50 flex flex-col items-end gap-3 ${
        selectedImageId ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Select FAB */}
        <button
          onClick={toggleBulkMode}
          className={`rounded-full shadow-lg focus:outline-none transition transform hover:scale-105 px-4 py-3 
            ${bulkMode ? 'bg-blue-600 text-white' : 'bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900'}`}
          title={bulkMode ? 'Exit selection (Esc)' : 'Select images (S)'}
          aria-label={bulkMode ? 'Exit selection' : 'Select images'}
        >
          {bulkMode ? (
            <span className="flex items-center space-x-2">
              <span>Exit</span>
              <span className="ml-2 inline-flex items-center justify-center text-xs font-semibold bg-white/20 rounded px-2 py-0.5">
                {selectedImages.size}
              </span>
            </span>
          ) : (
            <span className="flex items-center space-x-2">
              <span>Select</span>
            </span>
          )}
        </button>

        {/* Size control FAB with popover (usable while scrolling) */}
        <div className="relative">
          <button
            onClick={() => setShowSizePopover((v) => !v)}
            className="rounded-full shadow-lg focus:outline-none transition transform hover:scale-105 px-4 py-3 bg-white dark:bg-gray-200 text-gray-900"
            title="Adjust size"
            aria-label="Adjust size"
          >
            📏 Size
          </button>
          {showSizePopover && (
            <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 shadow-xl w-64">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setTileWidth((w) => Math.max(120, w - 20))}
                  className="px-2 py-1 text-sm rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                  title="Smaller"
                >
                  −
                </button>
                <input
                  type="range"
                  min={120}
                  max={600}
                  step={10}
                  value={tileWidth}
                  onChange={(e) => setTileWidth(parseInt(e.target.value, 10))}
                  className="flex-1"
                />
                <button
                  onClick={() => setTileWidth((w) => Math.min(600, w + 20))}
                  className="px-2 py-1 text-sm rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                  title="Larger"
                >
                  +
                </button>
                <span className="text-xs text-gray-600 dark:text-gray-300 w-12 text-right">{tileWidth}px</span>
              </div>
            </div>
          )}
        </div>

        {/* Play/Pause GIFs FAB */}
        <button
          onClick={() => setPauseGifs((v) => !v)}
          className={`rounded-full shadow-lg focus:outline-none transition transform hover:scale-105 px-4 py-3 text-sm 
            ${pauseGifs ? 'bg-white dark:bg-gray-200 text-gray-900' : 'bg-green-600 text-white'}`}
          title={pauseGifs ? 'GIFs paused' : 'GIFs playing'}
          aria-label={pauseGifs ? 'Pause GIFs' : 'Play GIFs'}
        >
          {pauseGifs ? '⏸️ Paused' : '▶️ Playing'}
        </button>

        {/* Return to Top FAB */}
        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="rounded-full shadow-lg focus:outline-none transition transform hover:scale-105 px-4 py-3 bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900"
            title="Return to top"
            aria-label="Return to top"
          >
            ↑ Top
          </button>
        )}
      </div>
    </div>
  )
}

function JobBanner({ title, job }: { title: string; job: { progress: number; processed: number; total: number } }) {
  return (
    <div className="rounded-md bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 p-3">
      <div className="flex items-center justify-between text-sm">
        <div className="text-blue-900 dark:text-blue-100 font-medium">{title}</div>
        <div className="text-blue-800 dark:text-blue-200">{job.processed}/{job.total} • {job.progress}%</div>
      </div>
      <div className="mt-2 h-2 w-full bg-blue-100 dark:bg-blue-800 rounded">
        <div className="h-2 bg-blue-500 dark:bg-blue-400 rounded" style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }} />
      </div>
    </div>
  )
}
