import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageApi } from '../services/api'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type Suggestion = { type: string; value: string; label: string }

export default function SearchBar({ isOpen, onClose }: Props) {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const debounceRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const close = useCallback(() => {
    setInput('')
    setSuggestions([])
    setActiveIndex(-1)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  useEffect(() => {
    if (!isOpen) return
    // Debounced suggestions
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (!input || input.trim().length < 2) {
      setSuggestions([])
      setActiveIndex(-1)
      return
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const data = await imageApi.getSearchSuggestions(input.trim(), 10)
        setSuggestions(data)
        setActiveIndex(data.length ? 0 : -1)
      } catch {
        setSuggestions([])
        setActiveIndex(-1)
      }
    }, 200) as unknown as number
  }, [input, isOpen])

  const applySuggestion = (s?: Suggestion) => {
    if (!s) {
      // default to full-text query
      if (input.trim()) navigate(`/browse?query=${encodeURIComponent(input.trim())}`)
      close()
      return
    }
    if (s.type === 'tag') {
      navigate(`/browse?tags=${encodeURIComponent(s.value)}`)
    } else if (s.type === 'model') {
      navigate(`/browse?model_name=${encodeURIComponent(s.value)}`)
    } else {
      navigate(`/browse?query=${encodeURIComponent(s.value || input.trim())}`)
    }
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) {
      if (e.key === 'Enter') {
        e.preventDefault()
        applySuggestion()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      applySuggestion(suggestions[activeIndex])
    }
  }

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-800 rounded-lg shadow p-4 animate-scale-in">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          placeholder="Search images, tags, models..."
          className="w-full px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
        />
        {suggestions.length > 0 && (
          <div className="mt-2 max-h-80 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {suggestions.map((s, idx) => (
              <button
                key={`${s.type}-${s.value}-${idx}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => applySuggestion(s)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${idx === activeIndex ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
              >
                <span className="text-gray-800 dark:text-gray-100">{s.label}</span>
                <span className="text-xs text-gray-500">{s.type}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
          <span>Press Esc to close</span>
          <span className="hidden sm:inline text-gray-400">↑/↓ to navigate • Enter to select</span>
        </div>
      </div>
    </div>
  )
}
