interface FavoriteButtonProps {
  isFavorite: boolean
  onToggle?: () => void
  size?: 'sm' | 'md' | 'lg'
  readonly?: boolean
}

export default function FavoriteButton({ 
  isFavorite, 
  onToggle, 
  size = 'md', 
  readonly = false 
}: FavoriteButtonProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  }

  return (
    <button
      type="button"
      disabled={readonly}
      onClick={onToggle}
      className={`${sizeClasses[size]} transition-transform ${
        readonly 
          ? 'cursor-default pointer-events-none' 
          : 'cursor-pointer hover:scale-110'
      } ${
        isFavorite 
          ? 'text-red-500' 
          : 'text-gray-400 hover:text-red-400'
      }`}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <svg
        fill={isFavorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={isFavorite ? 0 : 2}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  )
}
