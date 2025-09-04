import { useState } from 'react'

interface StarRatingProps {
  rating: number
  onRatingChange?: (rating: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function StarRating({ rating, onRatingChange, readonly = false, size = 'md' }: StarRatingProps) {
  const [hoveredRating, setHoveredRating] = useState(0)

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  }

  const handleClick = (newRating: number) => {
    if (!readonly && onRatingChange) {
      // If clicking the same rating, set to 0 (unrated)
      onRatingChange(rating === newRating ? 0 : newRating)
    }
  }

  const getStarColor = (starIndex: number) => {
    const activeRating = hoveredRating || rating
    if (activeRating >= starIndex) {
      return readonly ? 'text-yellow-400' : 'text-yellow-500 hover:text-yellow-400'
    }
    return 'text-gray-300 hover:text-yellow-300'
  }

  return (
    <div className="flex items-center space-x-1">
      {[1, 2, 3, 4, 5].map((starIndex) => (
        <button
          key={starIndex}
          type="button"
          disabled={readonly}
          className={`${sizeClasses[size]} ${getStarColor(starIndex)} transition-colors ${
            readonly ? 'cursor-default' : 'cursor-pointer'
          }`}
          onClick={() => handleClick(starIndex)}
          onMouseEnter={() => !readonly && setHoveredRating(starIndex)}
          onMouseLeave={() => !readonly && setHoveredRating(0)}
          aria-label={`Rate ${starIndex} star${starIndex !== 1 ? 's' : ''}`}
        >
          <svg
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
      {!readonly && (
        <span className="text-xs text-gray-500 ml-2">
          {rating === 0 ? 'Unrated' : `${rating} star${rating !== 1 ? 's' : ''}`}
        </span>
      )}
    </div>
  )
}