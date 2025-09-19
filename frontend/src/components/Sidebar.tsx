 
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from 'react-query'
import { libraryApi } from '../services/api'
import classNames from 'classnames'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navigation = [
  { name: 'Browse', href: '/browse', icon: GridIcon, current: false },
  { name: 'Memories', href: '/memories', icon: CalendarHeartIcon, current: false },
  { name: 'Tags', href: '/tags', icon: TagIcon, current: false },
  { name: 'Categories', href: '/categories', icon: FolderIcon, current: false },
  { name: 'Random', href: '/random', icon: DiceIcon, current: false },
  { name: 'Duplicates', href: '/duplicates', icon: GridIcon, current: false },
  { name: 'Jobs', href: '/jobs', icon: ClockIcon, current: false },
  { name: 'Settings', href: '/settings', icon: CogIcon, current: false },
]

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation()
  
  const { data: stats } = useQuery('library-stats', libraryApi.getStats, {
    refetchInterval: 30000, // Refresh every 30 seconds
  })
  
  // Category list removed (kept Random link only)

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
            {/* Logo */}
            <div className="flex flex-shrink-0 items-center px-4">
              <img
                src="/photo-logo.png"
                alt="Photo Library logo"
                className="h-8 w-8 mr-2 rounded"
                loading="eager"
              />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Photo Library</h1>
            </div>

            {/* Navigation */}
            <nav className="mt-5 flex-1 space-y-1 px-2">
              {navigation.map((item) => {
                const isCurrent = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={classNames(
                      isCurrent
                        ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-200'
                        : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white',
                      'group flex items-center px-3 py-2 text-sm font-medium border-l-4 rounded-r-md transition-colors'
                    )}
                  >
                    <item.icon
                      className={classNames(
                        isCurrent
                          ? 'text-primary-500 dark:text-primary-400'
                          : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300',
                        'mr-3 h-5 w-5 transition-colors'
                      )}
                    />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Library stats */}
            {stats && (
              <div className="mt-6 px-3">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Library Stats
                  </h3>
                  <dl className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                    <div className="flex justify-between">
                      <dt>Photos:</dt>
                      <dd className="font-medium">{stats.total_images.toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Tags:</dt>
                      <dd className="font-medium">{stats.total_tags.toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Categories:</dt>
                      <dd className="font-medium">{stats.total_categories.toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Favorites:</dt>
                      <dd className="font-medium">{stats.favorites.toLocaleString()}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {/* Rating Filters */}
            <RatingFilterLinks className="mt-6 px-3" />

            {/* Categories quick list removed; Random is part of main nav above */}

            {/* Quick actions */}
            <div className="mt-6 px-3">
              <button
                onClick={() => libraryApi.scanLibrary()}
                className="w-full bg-primary-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Scan Library
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sidebar */}
      <div
        className={classNames(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 transform transition-transform lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-16 items-center justify-between px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <img
                src="/photo-logo.png"
                alt="Photo Library logo"
                className="h-7 w-7 mr-2 rounded"
                loading="eager"
              />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Photo Library</h1>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pt-5 pb-4">
            <nav className="space-y-1 px-2">
              {navigation.map((item) => {
                const isCurrent = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={onClose}
                    className={classNames(
                      isCurrent
                        ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-200'
                        : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white',
                      'group flex items-center px-3 py-2 text-sm font-medium border-l-4 rounded-r-md'
                    )}
                  >
                    <item.icon
                      className={classNames(
                        isCurrent
                          ? 'text-primary-500 dark:text-primary-400'
                          : 'text-gray-400 group-hover:text-gray-500',
                        'mr-3 h-5 w-5'
                      )}
                    />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            <RatingFilterLinks className="mt-6 px-2" onNavigate={onClose} />
          </div>
        </div>
      </div>
    </>
  )
}

function RatingFilterLinks({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const handleClick = () => {
    if (onNavigate) onNavigate()
  }

  return (
    <div className={className}>
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Filter by Rating</h3>
        <div className="space-y-1">
          {[5, 4, 3, 2, 1].map((stars) => (
            <Link
              key={stars}
              to={`/browse?rating=${stars}`}
              onClick={handleClick}
              className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors py-1"
            >
              <div className="flex">
                {Array.from({ length: 5 }, (_, i) => (
                  <svg
                    key={i}
                    className={`w-3 h-3 ${i < stars ? 'text-yellow-400' : 'text-gray-300'}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <span>{stars} Star{stars !== 1 ? 's' : ''}</span>
            </Link>
          ))}
          <Link
            to="/browse?favorite=true"
            onClick={handleClick}
            className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors py-1"
          >
            <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span>Favorites</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

// Icon components
function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  )
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.983 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 9.354l-1.06-1.06a1 1 0 00-1.414 0l-.742.742a7.963 7.963 0 00-1.8-1.044l-.143-1.047a1 1 0 00-.988-.845h-1.5a1 1 0 00-.988.845l-.143 1.047a7.963 7.963 0 00-1.8 1.044l-.742-.742a1 1 0 00-1.414 0l-1.06 1.06a1 1 0 000 1.414l.742.742a7.963 7.963 0 00-1.044 1.8l-1.047.143a1 1 0 00-.845.988v1.5a1 1 0 00.845.988l1.047.143c.24.64.58 1.235 1.044 1.8l-.742.742a1 1 0 000 1.414l1.06 1.06a1 1 0 001.414 0l.742-.742c.565.464 1.16.804 1.8 1.044l.143 1.047a1 1 0 00.988.845h1.5a1 1 0 00.988-.845l.143-1.047c.64-.24 1.235-.58 1.8-1.044l.742.742a1 1 0 001.414 0l1.06-1.06a1 1 0 000-1.414l-.742-.742c.464-.565.804-1.16 1.044-1.8l1.047-.143a1 1 0 00.845-.988v-1.5a1 1 0 00-.845-.988l-1.047-.143a7.963 7.963 0 00-1.044-1.8l.742-.742a1 1 0 000-1.414z" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function DiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" rx="3"/>
      <circle cx="9" cy="9" r="1.5"/>
      <circle cx="15" cy="15" r="1.5"/>
      <circle cx="15" cy="9" r="1.5"/>
      <circle cx="9" cy="15" r="1.5"/>
    </svg>
  )
}

function CalendarHeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18"/>
      <path d="M12 18l-1.45-1.32a3 3 0 10-4.1-4.36L12 18z" />
      <path d="M12 18l5.55-5.68a3 3 0 10-4.1-4.36L12 9.5" />
    </svg>
  )
}
