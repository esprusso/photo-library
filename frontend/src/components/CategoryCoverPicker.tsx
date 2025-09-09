import { useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { imageApi } from '../services/api'
import type { Image } from '../types'

interface CategoryCoverPickerProps {
  categoryName?: string
  isOpen: boolean
  onClose: () => void
  onSelect: (image: Image) => void
}

export default function CategoryCoverPicker({ categoryName, isOpen, onClose, onSelect }: CategoryCoverPickerProps) {
  const [page, setPage] = useState(1)
  const [images, setImages] = useState<Image[]>([])
  const [scope, setScope] = useState<'category' | 'all'>(categoryName ? 'category' : 'all')

  useEffect(() => {
    if (!isOpen) return
    setPage(1)
    setImages([])
    if (categoryName) setScope('category')
    else setScope('all')
  }, [isOpen, categoryName])

  const { isLoading, isFetching, refetch } = useQuery(
    ['cover-picker', scope, categoryName || 'ALL', page],
    () => {
      if (scope === 'category' && categoryName) {
        return imageApi.getImages(page, 50, { categories: [categoryName] })
      }
      return imageApi.getImages(page, 50)
    },
    {
      enabled: isOpen,
      keepPreviousData: true,
      onSuccess: (res) => {
        if (page === 1) setImages(res)
        else setImages((prev) => [...prev, ...res])
      }
    }
  )

  useEffect(() => {
    if (!isOpen) return
    const onScroll = () => {
      if (isFetching) return
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 300
      if (nearBottom) setPage((p) => p + 1)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isOpen, isFetching])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Select a cover image</h3>
            {categoryName && (
              <div className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 rounded-full p-0.5">
                <button
                  onClick={() => { setScope('category'); setPage(1); setImages([]); refetch() }}
                  className={`px-2 py-1 rounded-full ${scope === 'category' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
                  title={`Show images in ${categoryName}`}
                >
                  In “{categoryName}”
                </button>
                <button
                  onClick={() => { setScope('all'); setPage(1); setImages([]); refetch() }}
                  className={`px-2 py-1 rounded-full ml-1 ${scope === 'all' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
                  title="Show all images"
                >
                  All images
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">✖</button>
        </div>
        <div className="p-3 overflow-y-auto" style={{ maxHeight: '75vh' }}>
          {isLoading && images.length === 0 ? (
            <div className="text-center text-gray-500">Loading…</div>
          ) : images.length === 0 ? (
            <div className="text-center text-gray-500">
              {scope === 'category' && categoryName ? (
                <div className="space-y-2">
                  <div>No images found in “{categoryName}”.</div>
                  <button
                    onClick={() => { setScope('all'); setPage(1); setImages([]); refetch() }}
                    className="text-blue-600 dark:text-blue-400 underline"
                  >
                    Show all images instead
                  </button>
                </div>
              ) : (
                <div>No images found.</div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => onSelect(img)}
                  className="relative bg-gray-100 dark:bg-gray-800 rounded hover:shadow focus:outline-none"
                  title={`${img.filename} (#${img.id})`}
                >
                  <img
                    src={`/api/images/file/${img.id}`}
                    alt={img.filename}
                    className="w-full h-36 object-contain"
                    loading="lazy"
                  />
                  <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1 rounded">#{img.id}</span>
                </button>
              ))}
            </div>
          )}
          {isFetching && images.length > 0 && (
            <div className="text-center text-gray-400 py-2">Loading more…</div>
          )}
        </div>
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button onClick={() => refetch()} className="px-3 py-1 text-sm rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">Refresh</button>
        </div>
      </div>
    </div>
  )
}
