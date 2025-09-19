 
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { imageApi, libraryApi, jobApi, categoryApi, tagApi } from '../services/api'
import CreatableSelect from 'react-select/creatable'
import ImageModal from '../components/ImageModal'
import StarRating from '../components/StarRating'
import FavoriteButton from '../components/FavoriteButton'
import AspectRatioGrid from '../components/AspectRatioGrid'
import ErrorBoundary from '../components/ErrorBoundary'
import type { Image, ImageFilters } from '../types'

type GridSize = 'small' | 'medium' | 'large'

export default function BrowsePage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [images, setImages] = useState<Image[]>([])
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)
  const [viewHistory, setViewHistory] = useState<number[]>([])
  const historyIndexRef = useRef(-1)
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set())
  const [pendingDeletes, setPendingDeletes] = useState<Record<number, { image: Image; timer: number }>>({})
  const [toast, setToast] = useState<{ ids: number[] } | null>(null)
  const [toastTimer, setToastTimer] = useState<number | null>(null)
  // UI prefs: auto-categorize visibility
  const [showAutoCategorize, setShowAutoCategorize] = useState<boolean>(() => {
    const v = localStorage.getItem('ui.showAutoCategorize')
    return v == null ? true : v === 'true'
  })
  const [hoverOutlineEnabled, setHoverOutlineEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem('ui.hoverOutline')
    return v == null ? true : v === 'true'
  })
  useEffect(() => {
    const handler = () => {
      const v = localStorage.getItem('ui.showAutoCategorize')
      setShowAutoCategorize(v == null ? true : v === 'true')
    }
    window.addEventListener('ui-settings-changed', handler as any)
    return () => window.removeEventListener('ui-settings-changed', handler as any)
  }, [])

  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail || {}
      if (typeof detail.hoverOutlineEnabled === 'boolean') {
        setHoverOutlineEnabled(detail.hoverOutlineEnabled)
      } else {
        const v = localStorage.getItem('ui.hoverOutline')
        setHoverOutlineEnabled(v == null ? true : v === 'true')
      }
    }
    window.addEventListener('ui-preferences', handler as any)
    return () => window.removeEventListener('ui-preferences', handler as any)
  }, [])

  // Back to Top visibility
  const [showBackToTop, setShowBackToTop] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 600)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const [gridSize, setGridSize] = useState<GridSize>(() => {
    const saved = localStorage.getItem('gridSize') as GridSize
    return saved && ['small', 'medium', 'large'].includes(saved) ? saved : 'medium'
  })
  const [packagingJobId, setPackagingJobId] = useState<number | null>(null)
  const [packagingProgress, setPackagingProgress] = useState<number>(0)

  useEffect(() => {
    if (selectedImageId == null) {
      setViewHistory([])
      historyIndexRef.current = -1
      return
    }

    setViewHistory((prev) => {
      const currentIdx = historyIndexRef.current
      if (currentIdx !== -1 && prev[currentIdx] === selectedImageId) {
        return prev
      }

      const truncated = currentIdx >= 0 ? prev.slice(0, currentIdx + 1) : []
      if (truncated[truncated.length - 1] === selectedImageId) {
        historyIndexRef.current = truncated.length - 1
        return truncated
      }

      truncated.push(selectedImageId)
      historyIndexRef.current = truncated.length - 1
      return truncated
    })
  }, [selectedImageId])

  // Keyboard shortcuts for quick selection + quick rating/favorite on selected image
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
      } else if (!bulkMode && selectedImageId) {
        // Quick rating: 1-5
        if (['1','2','3','4','5'].includes(e.key)) {
          e.preventDefault()
          const rating = parseInt(e.key, 10)
          if (rating >= 1 && rating <= 5) {
            rateImage.mutate({ imageId: selectedImageId, rating })
          }
        } else if (e.key === 'f' || e.key === 'F') {
          // Quick favorite toggle
          e.preventDefault()
          const img = images.find(im => im.id === selectedImageId)
          if (img) toggleFavorite.mutate({ imageId: img.id, favorite: !img.favorite })
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bulkMode, images, selectedImageId])

  // Listen for soft deletions from ImageModal to animate removal with undo window
  useEffect(() => {
    const onSoftDelete = (e: any) => {
      const id = e?.detail?.id as number | undefined
      const img = e?.detail?.image as Image | undefined
      if (!id || !img) return
      // Ensure modal (if open) is closed immediately
      setSelectedImageId((prev) => (prev === id ? null : prev))
      // Animate out immediately
      setRemovingIds((prev) => new Set(prev).add(id))
      // After CSS transition, remove from grid but keep in pending for potential undo
      const t = window.setTimeout(() => {
        setImages((prev) => prev.filter((im) => im.id !== id))
        setSelectedImages((prev) => { const s = new Set(prev); s.delete(id); return s })
        setRemovingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
      }, 300)
      // Schedule finalize delete after 5s unless undone
      const finalizeTimer = window.setTimeout(async () => {
        let blacklist = true
        try {
          const v = localStorage.getItem('blacklistOnDelete')
          blacklist = v == null ? true : v === 'true'
        } catch {}
        try { await imageApi.deleteImage(id, false, blacklist) } catch {}
        setPendingDeletes((prev) => { const cp = { ...prev }; delete cp[id]; return cp })
        // Also refresh stats and list lazily
        queryClient.invalidateQueries(['images'])
        queryClient.invalidateQueries('library-stats')
      }, 5000)
      setPendingDeletes((prev) => ({ ...prev, [id]: { image: img, timer: finalizeTimer } }))
      // Show toast for 5s
      setToast({ ids: [id] })
      if (toastTimer) window.clearTimeout(toastTimer)
      const tt = window.setTimeout(() => setToast(null), 5000)
      setToastTimer(tt)
    }
    window.addEventListener('ai-image-soft-delete' as any, onSoftDelete as any)
    return () => window.removeEventListener('ai-image-soft-delete' as any, onSoftDelete as any)
  }, [])

  const undoDeleteBatch = (ids: number[]) => {
    ids.forEach((id) => {
      const pending = pendingDeletes[id]
      if (!pending) return
      // Cancel finalize timer and restore image
      window.clearTimeout(pending.timer)
      setPendingDeletes((prev) => { const cp = { ...prev }; delete cp[id]; return cp })
      setImages((prev) => [pending.image, ...prev])
    })
    setToast(null)
    if (toastTimer) window.clearTimeout(toastTimer)
  }

  const bulkSoftDelete = (ids: number[]) => {
    if (!ids.length) return
    // Close modal if any selected image is shown
    setSelectedImageId((prev) => (prev && ids.includes(prev) ? null : prev))
    // Animate all out
    setRemovingIds((prev) => {
      const s = new Set(prev)
      ids.forEach((id) => s.add(id))
      return s
    })
    // After transition, remove and clean selection
    window.setTimeout(() => {
      setImages((prev) => prev.filter((im) => !ids.includes(im.id)))
      setSelectedImages((prev) => {
        const s = new Set(prev)
        ids.forEach((id) => s.delete(id))
        return s
      })
      setRemovingIds((prev) => {
        const s = new Set(prev)
        ids.forEach((id) => s.delete(id))
        return s
      })
    }, 300)
    // Set up pending deletes and timers
    const imgsById = new Map(images.map((im) => [im.id, im]))
    ids.forEach((id) => {
      const img = imgsById.get(id)
      if (!img) return
      const finalizeTimer = window.setTimeout(async () => {
        let blacklist = true
        try {
          const v = localStorage.getItem('blacklistOnDelete')
          blacklist = v == null ? true : v === 'true'
        } catch {}
        try { await imageApi.deleteImage(id, false, blacklist) } catch {}
        setPendingDeletes((prev) => { const cp = { ...prev }; delete cp[id]; return cp })
        queryClient.invalidateQueries(['images'])
        queryClient.invalidateQueries('library-stats')
      }, 5000)
      setPendingDeletes((prev) => ({ ...prev, [id]: { image: img, timer: finalizeTimer } }))
    })
    // Toast for batch
    setToast({ ids: [...ids] })
    if (toastTimer) window.clearTimeout(toastTimer)
    const tt = window.setTimeout(() => setToast(null), 5000)
    setToastTimer(tt)
  }

  const getGridClasses = (size: GridSize) => {
    switch (size) {
      case 'small':
        return 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2'
      case 'medium':
        return 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3'
      case 'large':
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
      default:
        return 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3'
    }
  }

  const getThumbnailClasses = (size: GridSize) => {
    switch (size) {
      case 'small':
        return 'aspect-square'  // Small squares
      case 'medium':
        return 'aspect-square'  // Medium squares
      case 'large':
        return 'aspect-[4/3]'   // Larger, more rectangular
      default:
        return 'aspect-square'
    }
  }

  const getPreviewSize = (size: GridSize) => {
    switch (size) {
      case 'small':
        return 512
      case 'medium':
        return 768
      case 'large':
        return 1280
      default:
        return 768
    }
  }

  const getContentClasses = (size: GridSize) => {
    switch (size) {
      case 'small':
        return {
          padding: 'p-1',
          filename: 'text-[10px]',
          dimensions: 'text-[9px]'
        }
      case 'medium':
        return {
          padding: 'p-2',
          filename: 'text-xs',
          dimensions: 'text-[11px]'
        }
      case 'large':
        return {
          padding: 'p-3',
          filename: 'text-sm',
          dimensions: 'text-xs'
        }
      default:
        return {
          padding: 'p-2',
          filename: 'text-xs',
          dimensions: 'text-[11px]'
        }
    }
  }

  // Convert grid size to tile width for AspectRatioGrid
  const getTileWidth = (size: GridSize) => {
    switch (size) {
      case 'small':
        return 150
      case 'medium':
        return 220
      case 'large':
        return 300
      default:
        return 220
    }
  }

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!selectedImageId || !images.length) return

    if (direction === 'prev' && historyIndexRef.current > 0) {
      const newIndex = historyIndexRef.current - 1
      const previousId = viewHistory[newIndex]
      if (previousId) {
        historyIndexRef.current = newIndex
        setSelectedImageId(previousId)
        return
      }
    }

    if (
      direction === 'next' &&
      historyIndexRef.current >= 0 &&
      historyIndexRef.current < viewHistory.length - 1
    ) {
      const newIndex = historyIndexRef.current + 1
      const nextId = viewHistory[newIndex]
      if (nextId) {
        historyIndexRef.current = newIndex
        setSelectedImageId(nextId)
        return
      }
    }

    const currentIndex = images.findIndex(img => img.id === selectedImageId)
    if (currentIndex === -1) {
      // If current image is not found in the list, don't navigate
      return
    }

    const sequentialIndex = direction === 'prev'
      ? (currentIndex > 0 ? currentIndex - 1 : null)
      : (currentIndex < images.length - 1 ? currentIndex + 1 : null)

    if (sequentialIndex == null) return
    const target = images[sequentialIndex]
    if (!target) return
    setSelectedImageId(target.id)
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


  // Bulk tag state and mutation
  type TagOption = { label: string; value: string }
  const { data: allTags } = useQuery('tags', () => tagApi.getTags('', 'name'))
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

  // Bulk categories state and mutation
  type CatOption = { label: string; value: string; id?: number }
  const { data: allCategories } = useQuery(['categories', 'name'], () => categoryApi.getCategories('', 'name'))
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
  const filters: ImageFilters = {}
  const rating = searchParams.get('rating')
  const favorite = searchParams.get('favorite')
  const categories = searchParams.get('categories')
  const modelName = searchParams.get('model_name')
  const tagsParam = searchParams.get('tags')
  if (rating) filters.rating = parseInt(rating)
  if (favorite === 'true') filters.favorite = true
  if (categories) filters.categories = [categories]
  if (modelName) (filters as any).model_name = modelName
  if (tagsParam) filters.tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean)

  const { data, isLoading, isError, refetch, isFetching } = useQuery(
    ['images', page, filters],
    () => imageApi.getImages(page, 50, filters),
    {
      keepPreviousData: true,
      onSuccess: (res) => {
        if (page === 1) setImages(res)
        else setImages((prev) => [...prev, ...res])
      },
    }
  )

  // Poll running jobs for visibility of background processing
  const indexingJobs = useQuery(['jobs', 'indexing', 'running'], () => jobApi.getJobs('indexing', 'running'), {
    refetchInterval: 3000,
  })
  const thumbnailJobs = useQuery(['jobs', 'thumbnailing', 'running'], () => jobApi.getJobs('thumbnailing', 'running'), {
    refetchInterval: 3000,
  })
  // Poll packaging job progress
  useQuery(['job', 'category-zip', packagingJobId], () => jobApi.getJob(packagingJobId as number), {
    enabled: !!packagingJobId,
    refetchInterval: 1000,
    onSuccess: (job: any) => {
      if (!job) return
      setPackagingProgress(job.progress || 0)
      if (job.status === 'completed' && job.result?.download_url) {
        // Trigger download
        const link = document.createElement('a')
        link.href = job.result.download_url
        link.download = ''
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setPackagingJobId(null)
        setPackagingProgress(0)
      } else if (job.status === 'failed') {
        alert(job.error_message || 'Failed to package category')
        setPackagingJobId(null)
        setPackagingProgress(0)
      }
    }
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

  const toggleFavorite = useMutation(
    async ({ imageId, favorite }: { imageId: number, favorite: boolean }) => 
      await imageApi.toggleFavorite(imageId),
    {
      onSuccess: (_, { imageId }) => {
        // Optimistically update the image in our state
        setImages(prevImages => 
          prevImages.map(img => 
            img.id === imageId ? { ...img, favorite: !img.favorite } : img
          )
        )
        queryClient.invalidateQueries(['images'])
      }
    }
  )

  const rateImage = useMutation(
    async ({ imageId, rating }: { imageId: number, rating: number }) => 
      await imageApi.rateImage(imageId, rating),
    {
      onSuccess: (_, { imageId, rating }) => {
        // Optimistically update the image in our state
        setImages(prevImages => 
          prevImages.map(img => 
            img.id === imageId ? { ...img, rating } : img
          )
        )
        queryClient.invalidateQueries(['images'])
      }
    }
  )



  useEffect(() => {
    // Reset to page 1 when filters change
    setPage(1)
    setImages([])
  }, [JSON.stringify(filters)])

  useEffect(() => {
    // Refetch on page change
    refetch()
  }, [page])

  useEffect(() => {
    // Save grid size preference to localStorage
    localStorage.setItem('gridSize', gridSize)
  }, [gridSize])

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
        
        // Load more when user is 800px from bottom to reduce stutter
        if (scrollTop + clientHeight >= scrollHeight - 800) {
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

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {(filters.rating || filters.favorite) && (
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
          {/* Grid Size Toggle */}
          <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setGridSize('small')}
              className={`p-1.5 rounded text-xs font-medium transition-colors ${
                gridSize === 'small'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Small thumbnails"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="4" height="4" />
                <rect x="10" y="3" width="4" height="4" />
                <rect x="17" y="3" width="4" height="4" />
                <rect x="3" y="10" width="4" height="4" />
                <rect x="10" y="10" width="4" height="4" />
                <rect x="17" y="10" width="4" height="4" />
                <rect x="3" y="17" width="4" height="4" />
                <rect x="10" y="17" width="4" height="4" />
                <rect x="17" y="17" width="4" height="4" />
              </svg>
            </button>
            <button
              onClick={() => setGridSize('medium')}
              className={`p-1.5 rounded text-xs font-medium transition-colors ${
                gridSize === 'medium'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Medium thumbnails"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              onClick={() => setGridSize('large')}
              className={`p-1.5 rounded text-xs font-medium transition-colors ${
                gridSize === 'large'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Large thumbnails"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="8" />
                <rect x="3" y="13" width="18" height="8" />
              </svg>
            </button>
          </div>
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
          {(() => {
            const catName = searchParams.get('categories')
            if (!catName) return null
            const cat = (allCategories || []).find((c: any) => c.name === catName)
            return (
              <button
                onClick={async () => {
                  if (!cat) return
                  try {
                    const { job_id } = await categoryApi.downloadCategoryAsync(cat.id)
                    setPackagingJobId(job_id)
                  } catch (e: any) {
                    const msg = e?.response?.data?.detail || e?.message || 'Failed to start category packaging'
                    alert(msg)
                  }
                }}
                disabled={!cat || !!packagingJobId}
                className="px-3 py-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 text-sm flex items-center gap-2"
                title={cat ? `Download all originals in ${cat.name}` : 'Loading category…'}
              >
                {packagingJobId ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-900 border-t-transparent animate-spin" />
                    Packaging… {packagingProgress}%
                  </>
                ) : (
                  'Download Category'
                )}
              </button>
            )
          })()}
        </div>
      </div>

      {/* Active job banners */}
      {indexingJobs.data && indexingJobs.data[0] && (
        <JobBanner title="Indexing" job={{
          progress: indexingJobs.data[0].progress,
          processed: indexingJobs.data[0].processed_items,
          total: indexingJobs.data[0].total_items,
        }} />
      )}
      {thumbnailJobs.data && thumbnailJobs.data[0] && (
        <JobBanner title="Generating thumbnails" job={{
          progress: thumbnailJobs.data[0].progress,
          processed: thumbnailJobs.data[0].processed_items,
          total: thumbnailJobs.data[0].total_items,
        }} />
      )}

      {isLoading && images.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-300">Loading images…</div>
      ) : isError ? (
        <div className="text-red-600">Failed to load images.</div>
      ) : images.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-300">No images found. Try Scan Library.</div>
      ) : (
        <ErrorBoundary>
          <AspectRatioGrid
            images={images}
            tileWidth={getTileWidth(gridSize)}
            bulkMode={bulkMode}
            selectedImages={selectedImages}
            onImageClick={handleImageClick}
            onToggleSelection={toggleImageSelection}
            onQuickFavorite={(imageId) => {
              // Quick favorite toggle
              const image = images.find(img => img.id === imageId)
              if (image) {
                toggleFavorite.mutate({ imageId, favorite: !image.favorite })
              }
            }}
            onQuickRate={(imageId, rating) => {
              // Quick rating
              rateImage.mutate({ imageId, rating })
            }}
            hoverOutlineEnabled={hoverOutlineEnabled}
          />
        </ErrorBoundary>
      )}

      {/* Undo Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/80 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <span>{toast.ids.length === 1 ? 'Image deleted' : `${toast.ids.length} images deleted`}</span>
          <button
            onClick={() => undoDeleteBatch(toast.ids)}
            className="px-2 py-1 rounded bg-white text-gray-900 hover:bg-gray-100"
          >Undo</button>
        </div>
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
                <button
                  onClick={() => bulkSoftDelete(Array.from(selectedImages))}
                  className="px-3 py-1 text-sm rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800 transition-colors"
                  title="Delete selected images (Undo within 5s)"
                >
                  🗑️ Delete
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
        key={selectedImageId} // Force re-render when imageId changes
        imageId={selectedImageId}
        onClose={() => setSelectedImageId(null)}
        onNavigate={handleNavigate}
        onDeleted={(id) => {
          // In case modal delete is used outside of window event flow
          setRemovingIds((prev) => new Set(prev).add(id))
          setTimeout(() => {
            setImages((prev) => prev.filter((im) => im.id !== id))
            setSelectedImages((prev) => { const s = new Set(prev); s.delete(id); return s })
            setRemovingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
          }, 320)
        }}
      />

      {/* Floating Select FAB */}
      <button
        onClick={toggleBulkMode}
        className={`fixed right-4 md:right-6 bottom-6 z-40 rounded-full shadow-lg focus:outline-none transition transform hover:scale-105 
          ${bulkMode ? 'bg-blue-600 text-white' : 'bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900'}`}
        style={{ padding: '12px 16px' }}
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

      {/* Back to Top FAB */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed right-4 md:right-6 bottom-20 z-40 rounded-full shadow-lg focus:outline-none transition transform hover:scale-105 bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900"
          style={{ padding: '10px 12px' }}
          title="Back to top"
          aria-label="Back to top"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 5l7 7-1.4 1.4L13 8.8V20h-2V8.8l-4.6 4.6L5 12z" />
          </svg>
        </button>
      )}
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
