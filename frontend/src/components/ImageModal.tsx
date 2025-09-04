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
}

export default function ImageModal({ imageId, onClose, onNavigate }: ImageModalProps) {
  const [isClosing, setIsClosing] = useState(false)
  const queryClient = useQueryClient()

  const { data: image, isLoading } = useQuery(
    ['image', imageId],
    () => imageApi.getImage(imageId!),
    {
      enabled: !!imageId,
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


  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'ArrowLeft' && onNavigate) {
        onNavigate('prev')
      } else if (e.key === 'ArrowRight' && onNavigate) {
        onNavigate('next')
      }
    }

    if (imageId) {
      document.addEventListener('keydown', handleKeyboard)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyboard)
      document.body.style.overflow = 'unset'
    }
  }, [imageId, onNavigate])

  const handleClose = () => {
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
    <div className={`fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 ${
      isClosing ? 'opacity-0' : 'opacity-100'
    } transition-opacity duration-200`}>
      <div className={`bg-white dark:bg-gray-900 rounded-lg max-w-7xl w-full max-h-[90vh] h-[90vh] overflow-hidden flex transform ${
        isClosing ? 'scale-95' : 'scale-100'
      } transition-transform duration-200`}>
        
        {/* Image Side */}
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800 p-4 min-w-0 min-h-0">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {isLoading ? (
            <div className="text-white text-lg">Loading...</div>
          ) : image ? (
            <div className="w-full h-full flex items-center justify-center overflow-hidden">
              <img
                src={`/api/image-file/${image.id}`}
                alt={image.filename}
                className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto'
                }}
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  img.src = image.thumbnail_path
                }}
              />
            </div>
          ) : (
            <div className="text-white text-lg">Image not found</div>
          )}
        </div>

        {/* Info Side */}
        <div className="w-96 bg-white dark:bg-gray-900 p-6 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
          ) : !image ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Image not found</div>
          ) : (
            <ImageDetails image={image} favoriteMutation={favoriteMutation} ratingMutation={ratingMutation} />
          )}
        </div>
      </div>
    </div>
  )
}

function ImageDetails({ image, favoriteMutation, ratingMutation }: { 
  image: Image
  favoriteMutation: any
  ratingMutation: any
}) {
  const queryClient = useQueryClient()
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
  const [deleteOriginal, setDeleteOriginal] = useState(false)

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
    () => imageApi.deleteImage(image.id, deleteOriginal),
    {
      onSuccess: async () => {
        await queryClient.invalidateQueries(['images'])
        await queryClient.invalidateQueries('library-stats')
        // Close modal by simulating onClose via a custom event
        const evt = new CustomEvent('ai-image-deleted')
        window.dispatchEvent(evt)
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
          {image.created_at && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Created</span>
              <span className="text-gray-900 dark:text-white">
                {formatDate(image.created_at)}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Camera & Photo Info */}
      {(image.camera_make || image.camera_model || image.focal_length || image.aperture || image.iso || image.shutter_speed) && (
        <section>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Camera Settings</h4>
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
              {image.flash_used !== undefined && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block">Flash:</span>
                  <span className="text-gray-900 dark:text-white">{image.flash_used ? 'Yes' : 'No'}</span>
                </div>
              )}
              {image.date_taken && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block">Date Taken:</span>
                  <span className="text-gray-900 dark:text-white text-xs">
                    {new Date(image.date_taken).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

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
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Rating:</span>
            <StarRating
              rating={image.rating || 0}
              onRatingChange={(rating) => ratingMutation.mutate({ id: image.id, rating })}
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Favorite:</span>
            <FavoriteButton
              isFavorite={image.favorite || false}
              onToggle={() => favoriteMutation.mutate(image.id)}
            />
          </div>
          <button
            onClick={handleDownload}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
          >
            Download Original
          </button>

          {/* Delete */}
          <div className="p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <label className="flex items-center space-x-2 text-xs text-red-700 dark:text-red-300 mb-2">
              <input
                type="checkbox"
                checked={deleteOriginal}
                onChange={(e) => setDeleteOriginal(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Also delete original file</span>
            </label>
            <button
              onClick={() => {
                if (confirm(deleteOriginal ? 'Delete from library AND remove original file?' : 'Delete from library?')) {
                  deleteMutation.mutate()
                }
              }}
              disabled={deleteMutation.isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {deleteMutation.isLoading ? 'Deleting…' : (deleteOriginal ? 'Delete (incl. original)' : 'Delete from Library')}
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
