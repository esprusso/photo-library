 

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function SearchBar({ isOpen, onClose }: Props) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-800 rounded-lg shadow p-4 animate-scale-in">
        <input
          autoFocus
          placeholder="Search images, tags, models..."
          className="w-full px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
        />
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Press Esc to close</div>
      </div>
    </div>
  )
}
