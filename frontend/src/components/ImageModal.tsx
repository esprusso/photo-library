import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { imageApi, tagApi, categoryApi } from '../services/api'
import CreatableSelect from 'react-select/creatable'
import type { Image, Category } from '../types'
import StarRating from './StarRating'
import FavoriteButton from './FavoriteButton'

interface ImageModalProps {
  imageId: number | null
  onClose: () => void
  onNavigate?: (direction: 'prev' | 'next') => void
  onDeleted?: (id: number) => void
}

export default function ImageModal({ imageId, onClose, onNavigate, onDeleted }: ImageModalProps) {
  const [isClosing, setIsClosing] = useState(false)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const queryClient = useQueryClient()

  // Debug: Log when imageId changes to help diagnose the issue
  useEffect(() => {
    if (imageId) {
      console.log('ImageModal: imageId changed to', imageId)
    }
    setIsInfoOpen(false)
  }, [imageId])

  const { data: image, isLoading } = useQuery(
    ['image', imageId],
    () => imageApi.getImage(imageId!),
    {
      enabled: !!imageId,
      staleTime: 1000 * 60, // Consider data fresh for 1 minute
      cacheTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
      onSuccess: (data) => {
        console.log('ImageModal: Loaded image data for ID', imageId, 'Got image:', data?.filename, 'ID:', data?.id)
      }
    }
  )

  const favoriteMutation = useMutation(
    (id: number) => imageApi.toggleFavorite(id),
    {
      onSuccess: (data) => {
        queryClient.setQueryData(['image', imageId], (old: any) => 
          old ? { ...old, favorite: data.favorite } : old
        )
        queryClient.invalidateQueries(['images'])
      }
    }
  )
  
  const ratingMutation = useMutation(
    ({ id, rating }: { id: number; rating: number }) => imageApi.setRating(id, rating),
    {
      onSuccess: (data) => {
        queryClient.setQueryData(['image', imageId], (old: any) => 
          old ? { ...old, rating: data.rating } : old
        )
        queryClient.invalidateQueries(['images'])
      }
    }
  )


  // Handle keyboard navigation + rating/favorite hotkeys
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      const editable = (el as any).isContentEditable
      return tag === 'INPUT' || tag === 'TEXTAREA' || editable
    }

    const handleKeyboard = (e: KeyboardEvent) => {
      if (!imageId) return
      if (!image) return
      if (isTyping()) return

      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      } else if (e.key === 'ArrowLeft' && onNavigate) {
        e.preventDefault()
        onNavigate('prev')
      } else if (e.key === 'ArrowRight' && onNavigate) {
        e.preventDefault()
        onNavigate('next')
      } else if (['1','2','3','4','5'].includes(e.key)) {
        // Star rating hotkeys
        e.preventDefault()
        const rating = parseInt(e.key, 10)
        if (rating >= 1 && rating <= 5) {
          ratingMutation.mutate({ id: image.id, rating })
        }
      } else if (e.key === 'f' || e.key === 'F') {
        // Favorite toggle
        e.preventDefault()
        favoriteMutation.mutate(image.id)
      }
    }

    if (imageId) {
      window.addEventListener('keydown', handleKeyboard, { capture: true })
      document.body.style.overflow = 'hidden'
    }

    return () => {
      window.removeEventListener('keydown', handleKeyboard as any, { capture: true } as any)
      document.body.style.overflow = 'unset'
    }
  }, [imageId, image?.id, onNavigate])

  const handleClose = () => {
    setIsInfoOpen(false)
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 200)
  }

  // Close modal after deletion
  useEffect(() => {
    const handler = () => handleClose()
    window.addEventListener('ai-image-deleted', handler as any)
    return () => window.removeEventListener('ai-image-deleted', handler as any)
  }, [])

  if (!imageId) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 bg-black bg-opacity-90 z-50 transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        className={`relative w-full h-full transform transition-transform duration-200 ${
          isClosing ? 'scale-95' : 'scale-100'
        }`}
      >
        <button
          onClick={handleClose}
          className="absolute top-6 right-6 text-white hover:text-gray-300 z-20 bg-black/60 rounded-full p-2"
          aria-label="Close modal"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <button
          onClick={() => setIsInfoOpen((open) => !open)}
          className="absolute top-6 right-20 text-white hover:text-gray-300 z-20 bg-black/60 rounded-full p-2"
          aria-label={isInfoOpen ? 'Hide image information' : 'Show image information'}
          aria-pressed={isInfoOpen}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"
            />
          </svg>
        </button>

        <div className="absolute inset-0 flex items-center justify-center">
          {isLoading ? (
            <div className="text-white text-lg">Loading...</div>
          ) : image ? (
            <img
              src={`/api/image-file/${image.id}`}
              alt={image.filename}
              className="w-full h-full object-contain"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement
                img.src = image.thumbnail_path
              }}
            />
          ) : (
            <div className="text-white text-lg">Image not found</div>
          )}
        </div>

        {image && (
          <div className="absolute bottom-6 right-6 flex items-center gap-4 rounded-full bg-black/60 px-4 py-2 backdrop-blur-sm z-20">
            <StarRating
              rating={image.rating || 0}
              onRatingChange={(rating) => ratingMutation.mutate({ id: image.id, rating })}
              size="lg"
            />
            <FavoriteButton
              isFavorite={image.favorite || false}
              onToggle={() => favoriteMutation.mutate(image.id)}
              size="lg"
            />
          </div>
        )}

        <div
          className={`absolute top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto transition-transform duration-300 ${
            isInfoOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-hidden={!isInfoOpen}
        >
          <div className="p-6">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
            ) : !image ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Image not found</div>
            ) : (
              <ImageDetails image={image} onClose={handleClose} onDeleted={onDeleted} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ImageDetails({ image, onClose, onDeleted }: { 
  image: Image
  onClose?: () => void
  onDeleted?: (id: number) => void
}) {
  const queryClient = useQueryClient()
  const [showExif, setShowExif] = useState(false)
  const [tagInput, setTagInput] = useState('')

  const addTagsMutation = useMutation(
    ({ id, tags }: { id: number; tags: string[] }) => imageApi.addTags(id, tags),
    {
      onSuccess: () => {
        setTagInput('')
        // Refresh caches so new tags show up immediately
        queryClient.invalidateQueries(['image', image.id])
        queryClient.invalidateQueries(['images'])
        queryClient.invalidateQueries('tags')
      },
    }
  )

  const handleAddTags = () => {
    const raw = tagInput.trim()
    if (!raw) return
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    if (tags.length === 0) return
    addTagsMutation.mutate({ id: image.id, tags })
  }

  // Tag suggestions (existing tags)
  const { data: allTags } = useQuery('tags', () => tagApi.getTags('', 'name'))
  type TagOption = { label: string; value: string }
  const tagOptions: TagOption[] = (allTags || []).map((t: any) => ({ label: t.name, value: t.name }))
  const [selectedTagOptions, setSelectedTagOptions] = useState<TagOption[]>([])

  const handleApplySelected = () => {
    if (!selectedTagOptions.length) return
    const tags = selectedTagOptions.map((o) => o.value)
    addTagsMutation.mutate({ id: image.id, tags })
    setSelectedTagOptions([])
  }

  // Categories: fetch and prepare options
  type CatOption = { label: string; value: string; id?: number }
  const { data: allCategories } = useQuery(['categories', 'name'], () => categoryApi.getCategories('', 'name'))
  const categoryOptions: CatOption[] = (allCategories || []).map((c: Category) => ({ label: c.name, value: c.name, id: c.id }))
  const [selectedCategoryOptions, setSelectedCategoryOptions] = useState<CatOption[]>([])
  const [categoryInput, setCategoryInput] = useState('')

  const addToCategoriesMutation = useMutation(
    async ({ id, categoryNames }: { id: number; categoryNames: string[] }) => {
      const existingMap = new Map<string, number>()
      for (const c of (allCategories || [])) existingMap.set(c.name, c.id)

      const ensureIds: number[] = []
      for (const name of categoryNames) {
        const hit = existingMap.get(name)
        if (hit) {
          ensureIds.push(hit)
        } else {
          try {
            const created = await categoryApi.createCategory(name)
            ensureIds.push(created.id)
            existingMap.set(created.name, created.id)
          } catch (e) {
            const fallbackId = existingMap.get(name)
            if (fallbackId) ensureIds.push(fallbackId)
          }
        }
      }
      await Promise.all(ensureIds.map((cid) => categoryApi.addImagesToCategory(cid, [id])))
    },
    {
      onSuccess: async () => {
        setSelectedCategoryOptions([])
        setCategoryInput('')
        await queryClient.invalidateQueries(['image', image.id])
        await queryClient.invalidateQueries(['images'])
        await queryClient.invalidateQueries('categories')
      },
    }
  )

  const handleApplyCategories = () => {
    const fromSelect = selectedCategoryOptions.map((o) => o.value)
    const typed = categoryInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const names = Array.from(new Set([...fromSelect, ...typed]))
    if (names.length === 0) return
    addToCategoriesMutation.mutate({ id: image.id, categoryNames: names })
  }
  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = `/api/image-file/${image.id}?download=true`
    link.download = image.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const deleteMutation = useMutation(
    () => {
      let blacklist = true
      try {
        const v = localStorage.getItem('blacklistOnDelete')
        blacklist = v == null ? true : v === 'true'
      } catch {}
      return imageApi.deleteImage(image.id, false, blacklist)
    },
    {
      onSuccess: async () => {
        await queryClient.invalidateQueries(['images'])
        await queryClient.invalidateQueries('library-stats')
        // Close modal by simulating onClose via a custom event
        const evt = new CustomEvent('ai-image-deleted', { detail: { id: image.id } })
        window.dispatchEvent(evt)
        if (onDeleted) onDeleted(image.id)
      }
    }
  )

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <section>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Basic Information</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Filename</span>
            <span className="text-gray-900 dark:text-white font-mono text-xs break-all text-right ml-2">
              {image.filename}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Dimensions</span>
            <span className="text-gray-900 dark:text-white">
              {image.width || '?'} × {image.height || '?'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">File Size</span>
            <span className="text-gray-900 dark:text-white">
              {formatFileSize(image.file_size)}
            </span>
          </div>
          {image.format && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Format</span>
              <span className="text-gray-900 dark:text-white">{image.format}</span>
            </div>
          )}
          {(image.aspect_ratio && image.aspect_ratio > 0) && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Aspect Ratio</span>
              <span className="text-gray-900 dark:text-white">{image.aspect_ratio.toFixed(2)}:1</span>
            </div>
          )}
          {image.created_at && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Created</span>
              <span className="text-gray-900 dark:text-white">
                {formatDate(image.created_at)}
              </span>
            </div>
          )}
          {image.date_taken && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Date Taken</span>
              <span className="text-gray-900 dark:text-white">
                {new Date(image.date_taken).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* EXIF (always render; show message if none) */}
      <section>
        <button
          onClick={() => setShowExif((v) => !v)}
          className="w-full flex items-center justify-between text-left mb-2 px-0 py-0"
          aria-expanded={showExif}
        >
          <span className="text-sm font-semibold text-gray-900 dark:text-white">EXIF</span>
          <svg className={`w-4 h-4 text-gray-600 dark:text-gray-300 transition-transform ${showExif ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z" clipRule="evenodd"/></svg>
        </button>
        {showExif && ((
          image.camera_make || image.camera_model || image.lens_model ||
          image.focal_length || image.aperture || image.shutter_speed ||
          image.iso || (image.flash_used !== undefined && image.flash_used !== null)
        ) ? (
          <div className="space-y-2 text-sm">
            {(image.camera_make || image.camera_model) && (
              <div>
                <span className="text-gray-600 dark:text-gray-400 block mb-1">Camera:</span>
                <span className="text-gray-900 dark:text-white text-xs">
                  {image.camera_make} {image.camera_model}
                </span>
              </div>
            )}
            {image.lens_model && (
              <div>
                <span className="text-gray-600 dark:text-gray-400 block mb-1">Lens:</span>
                <span className="text-gray-900 dark:text-white text-xs">
                  {image.lens_model}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {image.focal_length && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block">Focal Length:</span>
                  <span className="text-gray-900 dark:text-white">{image.focal_length}mm</span>
                </div>
              )}
              {image.aperture && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block">Aperture:</span>
                  <span className="text-gray-900 dark:text-white">f/{image.aperture}</span>
                </div>
              )}
              {image.shutter_speed && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block">Shutter Speed:</span>
                  <span className="text-gray-900 dark:text-white font-mono">{image.shutter_speed}s</span>
                </div>
              )}
              {image.iso && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block">ISO:</span>
                  <span className="text-gray-900 dark:text-white">{image.iso}</span>
                </div>
              )}
              {image.flash_used !== undefined && image.flash_used !== null && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block">Flash:</span>
                  <span className="text-gray-900 dark:text-white">{image.flash_used ? 'Yes' : 'No'}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400">No EXIF metadata available.</div>
        ))}
      </section>

      {/* Tags & Categories */}
      {(image.tags?.length > 0 || image.categories?.length > 0) && (
        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Tags & Categories</h4>
          <div className="space-y-3">
            {image.tags && image.tags.length > 0 && (
              <div>
                <span className="text-gray-600 dark:text-gray-400 block mb-2 text-xs">Tags:</span>
                <div className="flex flex-wrap gap-1">
                  {image.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {image.categories && image.categories.length > 0 && (
              <div>
                <span className="text-gray-600 dark:text-gray-400 block mb-2 text-xs">Categories:</span>
                <div className="flex flex-wrap gap-1">
                  {image.categories.map((category, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Actions */}
      <section>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Actions</h4>
        <div className="space-y-3">
          <button
            onClick={handleDownload}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
          >
            Download Original
          </button>

          {/* Delete (originals are never deleted) */}
          <div className="p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <button
              type="button"
              onClick={() => {
                // Immediate soft-delete: notify list, close modal, allow undo
                const evt = new CustomEvent('ai-image-soft-delete', { detail: { id: image.id, image } })
                window.dispatchEvent(evt)
                if (onDeleted) onDeleted(image.id)
                // Close immediately without waiting for animation
                onClose?.()
              }}
              disabled={deleteMutation.isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {deleteMutation.isLoading ? 'Deleting…' : 'Delete from Library'}
            </button>
          </div>
          
          {/* Quick Tagging */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Add Tags
            </label>
            <div className="space-y-2">
              {/* Autocomplete (existing tags; creatable) */}
              <CreatableSelect
                isMulti
                value={selectedTagOptions}
                onChange={(val: any) => setSelectedTagOptions(val || [])}
                options={tagOptions}
                placeholder="Type to search or create…"
                classNamePrefix="select"
                menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                styles={{ menuPortal: (base: any) => ({ ...base, zIndex: 9999 }) }}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter') {
                    // Let react-select create/select first, then apply
                    setTimeout(() => handleApplySelected(), 30)
                  }
                }}
              />
              

              {/* Free text input (comma‑separated) */}
              <div className="flex items-center space-x-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTags() } }}
                  placeholder="e.g. portrait, watercolor"
                  className="flex-1 px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
                />
                <button
                  onClick={handleAddTags}
                  disabled={addTagsMutation.isLoading}
                  className="px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
                >
                  {addTagsMutation.isLoading ? 'Adding…' : 'Add'}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select or create tags and press Enter to apply, or type comma‑separated below.</p>
            </div>
          </div>

          {/* Add to Categories */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Add to Categories
            </label>
            <div className="space-y-2">
              <CreatableSelect
                isMulti
                value={selectedCategoryOptions}
                onChange={(val: any) => setSelectedCategoryOptions(val || [])}
                options={categoryOptions}
                placeholder="Type to search or create…"
                classNamePrefix="select"
                menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                styles={{ menuPortal: (base: any) => ({ ...base, zIndex: 9999 }) }}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter') {
                    // Allow option creation before applying
                    setTimeout(() => handleApplyCategories(), 30)
                  }
                }}
              />
              <div className="flex items-center space-x-2">
                <input
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCategories() } }}
                  placeholder="or type: Landscapes, Portraits"
                  className="flex-1 px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
                />
                <button
                  onClick={handleApplyCategories}
                  disabled={addToCategoriesMutation.isLoading}
                  className="px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
                >
                  {addToCategoriesMutation.isLoading ? 'Adding…' : 'Add'}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select existing or create new categories; press Enter or click Add.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
