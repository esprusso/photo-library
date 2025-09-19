import { useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { imageApi } from '../services/api'
import type { Image } from '../types'

interface ImagePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (image: Image) => void
  categoryName?: string
}

export default function ImagePickerModal({ isOpen, onClose, onSelect, categoryName }: ImagePickerModalProps) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [localQuery, setLocalQuery] = useState('')
  const [onlyThisCategory, setOnlyThisCategory] = useState(!!categoryName)

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setPage((p) => p + 1)
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1))
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  const { data: images, isLoading } = useQuery(
    ['picker-images', page, query, categoryName, onlyThisCategory],
    () => {
      const filters: any = {}
      if (query) filters.query = query
      if (categoryName && onlyThisCategory) filters.categories = [categoryName]
      return imageApi.getImages(page, 40, filters)
    },
    { enabled: isOpen }
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white dark:bg-gray-900 w-full max-w-6xl max-h-[90vh] rounded-lg overflow-hidden shadow-xl">
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Select Featured Image</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">✕</button>
        </div>
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-2">
          <input
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setQuery(localQuery); }}
            placeholder="Search images by filename, tags, etc."
            className="flex-1 px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white"
          />
          <button onClick={() => { setPage(1); setQuery(localQuery); }} className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Search</button>
          {categoryName ? (
            <label className="flex items-center space-x-1 text-xs text-gray-700 dark:text-gray-300 select-none">
              <input
                type="checkbox"
                checked={onlyThisCategory}
                onChange={(e) => { setOnlyThisCategory(e.target.checked); setPage(1); }}
                className="w-4 h-4"
              />
              <span>Only “{categoryName}”</span>
            </label>
          ) : null}
        </div>
        <div className="p-3 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 150px)' }}>
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading…</div>
          ) : !images || images.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No images found</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {images.map((img: Image) => (
                <button
                  key={img.id}
                  onClick={() => onSelect(img)}
                  className="group relative block rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow"
                  title={img.filename}
                >
                  <img src={`${img.thumbnail_path}?v=${encodeURIComponent(img.indexed_at || img.modified_at || img.created_at || '')}`} alt={img.filename} className="w-full h-28 object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 text-[10px] bg-black/50 text-white px-1 py-0.5 opacity-0 group-hover:opacity-100">
                    #{img.id}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-2 text-sm rounded bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            disabled={page === 1}
          >
            ← Prev
          </button>
          <div className="text-xs text-gray-600 dark:text-gray-400">Page {page}</div>
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-2 text-sm rounded bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
