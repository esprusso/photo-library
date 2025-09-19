import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { imageApi } from '../services/api'
import type { Image } from '../types'
import ImageModal from '../components/ImageModal'

export default function MemoriesPage() {
  const now = useMemo(() => new Date(), [])
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [day, setDay] = useState(now.getDate())
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)

  const { data: images, isLoading, refetch, isFetching } = useQuery(
    ['memories', month, day],
    () => imageApi.getMemories(month, day)
  )

  useEffect(() => { refetch() }, [month, day, refetch])

  const displayDate = useMemo(() => {
    const d = new Date()
    d.setMonth(month - 1)
    d.setDate(day)
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
  }, [month, day])

  // Parse year robustly; handle non-ISO timezone-less strings
  const getYear = (s?: string | null): number | null => {
    if (!s) return null
    // Prefer first 4 digits if present (YYYY-...)
    const m = /^\s*(\d{4})/.exec(s)
    if (m) {
      const y = parseInt(m[1], 10)
      if (!Number.isNaN(y)) return y
    }
    const d = new Date(s)
    const y = d.getFullYear()
    return Number.isNaN(y) ? null : y
  }

  // Group by year (desc), collect unknowns
  const groups = useMemo(() => {
    const byYear = new Map<number, Image[]>()
    const unknown: Image[] = []
    for (const img of images || []) {
      const y = getYear(img.date_taken)
      if (y === null) {
        unknown.push(img)
      } else {
        if (!byYear.has(y)) byYear.set(y, [])
        byYear.get(y)!.push(img)
      }
    }
    const years = Array.from(byYear.keys()).sort((a, b) => b - a)
    return { years, byYear, unknown }
  }, [images])

  const yearsLine = useMemo(() => {
    if (!groups.years || groups.years.length === 0) return ''
    return groups.years.join(', ')
  }, [groups])

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Memories</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Photos taken on this day from previous years</p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm"
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' })}</option>
            ))}
          </select>
          <select
            value={day}
            onChange={(e) => setDay(parseInt(e.target.value, 10))}
            className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm"
          >
            {Array.from({ length: 31 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {displayDate} {isFetching ? '• Loading…' : ''}
        {groups.years && groups.years.length > 0 && (
          <span className="ml-2">• Years: {yearsLine}</span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading memories…</div>
      ) : !images || images.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No memories found for {displayDate}.</div>
      ) : (
        <div className="space-y-8">
          {groups.years.map((yr) => (
            <section key={yr}>
              <div className="sticky top-16 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{yr}</h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{groups.byYear.get(yr)?.length || 0} photos</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {(groups.byYear.get(yr) || []).map((img: Image) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    className="relative group block rounded overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow"
                    title={img.filename}
                  >
                    <img src={`${img.thumbnail_path}?v=${encodeURIComponent(img.indexed_at || img.modified_at || img.created_at || '')}`} alt={img.filename} className="w-full h-40 object-cover" />
                  </button>
                ))}
              </div>
            </section>
          ))}
          {groups.unknown && groups.unknown.length > 0 && (
            <section>
              <div className="sticky top-16 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Unknown Year</h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{groups.unknown.length} photos</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {groups.unknown.map((img: Image) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    className="relative group block rounded overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow"
                    title={img.filename}
                  >
                    <img src={`${img.thumbnail_path}?v=${encodeURIComponent(img.indexed_at || img.modified_at || img.created_at || '')}`} alt={img.filename} className="w-full h-40 object-cover" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ImageModal imageId={selectedImageId} onClose={() => setSelectedImageId(null)} />
    </div>
  )
}
