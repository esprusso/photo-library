import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageApi } from '../services/api'
import ImageModal from '../components/ImageModal'

export default function RandomPage() {
  const [imageId, setImageId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const fetchRandom = async () => {
    setLoading(true)
    setError(null)
    try {
      const img = await imageApi.getRandom()
      setImageId(img.id)
    } catch (e: any) {
      setError('Could not load a random image. Try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRandom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard shortcut: R to shuffle
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
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault()
        fetchRandom()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="p-4 sm:p-6">
      {/* Reuse the ImageModal for full actions UI */}
      <ImageModal
        imageId={imageId}
        onClose={() => navigate('/browse')}
        onNavigate={(_dir) => fetchRandom()}
      />

      {/* Floating shuffle button */}
      <button
        onClick={fetchRandom}
        disabled={loading}
        className="fixed right-4 md:right-6 bottom-6 z-40 rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 transition"
        title="Shuffle random image"
        aria-label="Shuffle random image"
      >
        {loading ? 'Shuffling…' : '🎲 Shuffle'}
      </button>

      {/* Fallback content when no image loaded */}
      {!imageId && (
        <div className="mt-24 text-center text-sm text-gray-600 dark:text-gray-300">
          {error || 'Press Shuffle to load a random image.'}
        </div>
      )}
    </div>
  )
}
