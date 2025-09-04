import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import Sidebar from './Sidebar'
import SearchBar from './SearchBar'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (stored === 'light' || stored === 'dark') return stored
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
  })
  const location = useLocation()

  // Keyboard shortcuts
  useHotkeys('/', (e) => {
    e.preventDefault()
    setSearchOpen(true)
  })

  useHotkeys('escape', () => {
    setSearchOpen(false)
    setSidebarOpen(false)
  })

  // Apply theme to <html> so Tailwind dark: classes work
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Top navigation */}
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sa-pt">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Mobile menu button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Page title */}
              <div className="flex items-center">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {getPageTitle(location.pathname)}
                </h1>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-4">
                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-md dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700"
                  title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? (
                    // Sun icon
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="4"/>
                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                    </svg>
                  ) : (
                    // Moon icon
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                    </svg>
                  )}
                </button>
                {/* Search trigger */}
                <button
                  onClick={() => setSearchOpen(true)}
                  className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-md dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700"
                  title="Search (Press /)"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {/* Settings */}
                <Link
                  to="/settings"
                  className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-md dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700"
                  title="Settings"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 sa-pb">
          {children}
        </main>
      </div>

      {/* Search modal */}
      {searchOpen && (
        <SearchBar
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  )
}

function getPageTitle(pathname: string): string {
  switch (pathname) {
    case '/browse':
      return 'Browse Photos'
    case '/random':
      return 'Random'
    case '/tags':
      return 'Tags'
    case '/categories':
      return 'Categories'
    case '/jobs':
      return 'Jobs'
    case '/settings':
      return 'Settings'
    default:
      if (pathname.startsWith('/image/')) {
        return 'Photo Details'
      }
      return 'Photo Library'
  }
}
