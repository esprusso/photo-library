
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { categoryApi, libraryApi, jobApi } from '../services/api'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [results, setResults] = useState<string>('')
  const [isRefreshingExif, setIsRefreshingExif] = useState(false)
  const [isPurgingThumbs, setIsPurgingThumbs] = useState(false)
  const [isGenThumbs, setIsGenThumbs] = useState(false)
  const [isCleaningOrphaned, setIsCleaningOrphaned] = useState(false)
  const [cleanupJobId, setCleanupJobId] = useState<number | null>(null)
  const [isPurgingOneStars, setIsPurgingOneStars] = useState(false)
  const [blacklistOnDelete, setBlacklistOnDelete] = useState<boolean>(() => {
    const v = localStorage.getItem('blacklistOnDelete')
    return v == null ? true : v === 'true'
  })
  const [hoverOutlineEnabled, setHoverOutlineEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem('ui.hoverOutline')
    return v == null ? true : v === 'true'
  })
  const thumbStatus = useQuery(['thumb-status'], () => jobApi.getThumbnailStatus(), { refetchInterval: 15000 })
  
  // Monitor cleanup job progress
  const cleanupJobStatus = useQuery(
    ['cleanup-job', cleanupJobId],
    () => cleanupJobId ? jobApi.getJob(cleanupJobId) : null,
    {
      enabled: cleanupJobId !== null && isCleaningOrphaned,
      refetchInterval: 1000, // Check every second during cleanup
      onSuccess: (job) => {
        if (job && job.status === 'completed') {
          setIsCleaningOrphaned(false)
          setCleanupJobId(null)
          const result = job.result || {}
          setResults(`Cleanup completed: ${result.orphaned_removed || 0} orphaned images removed from ${result.total_checked || 0} checked.`)
          queryClient.invalidateQueries(['images'])
          queryClient.invalidateQueries(['library-stats'])
        } else if (job && job.status === 'failed') {
          setIsCleaningOrphaned(false)
          setCleanupJobId(null)
          setResults(`Cleanup failed: ${job.error_message || 'Unknown error'}`)
        }
      }
    }
  )
  // UI Preferences
  const [showAutoCategorize, setShowAutoCategorize] = useState<boolean>(() => {
    const v = localStorage.getItem('ui.showAutoCategorize')
    return v == null ? true : v === 'true'
  })
  const [showAutoAssignFeatured, setShowAutoAssignFeatured] = useState<boolean>(() => {
    const v = localStorage.getItem('ui.showAutoAssignFeatured')
    return v == null ? true : v === 'true'
  })

  useEffect(() => {
    localStorage.setItem('ui.showAutoCategorize', String(showAutoCategorize))
    window.dispatchEvent(new CustomEvent('ui-settings-changed'))
  }, [showAutoCategorize])
  useEffect(() => {
    localStorage.setItem('ui.showAutoAssignFeatured', String(showAutoAssignFeatured))
    window.dispatchEvent(new CustomEvent('ui-settings-changed'))
  }, [showAutoAssignFeatured])
  useEffect(() => {
    try {
      localStorage.setItem('blacklistOnDelete', blacklistOnDelete ? 'true' : 'false')
    } catch {}
    const evt = new CustomEvent('ui-preferences', { detail: { blacklistOnDelete } })
    window.dispatchEvent(evt)
  }, [blacklistOnDelete])

  useEffect(() => {
    try {
      localStorage.setItem('ui.hoverOutline', hoverOutlineEnabled ? 'true' : 'false')
    } catch {}
    const evt = new CustomEvent('ui-preferences', { detail: { hoverOutlineEnabled } })
    window.dispatchEvent(evt)
  }, [hoverOutlineEnabled])

  const cleanupRawFilesMutation = useMutation(
    () => categoryApi.cleanupRawFiles(),
    {
      onSuccess: (data) => {
        setResults(data.message)
        queryClient.invalidateQueries(['images'])
        queryClient.invalidateQueries(['categories'])
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
        setResults(`Error: ${errorMessage}`)
      }
    }
  )

  const cleanupEmptyCategoriesMutation = useMutation(
    (minImages: number) => categoryApi.cleanupEmptyCategories(minImages),
    {
      onSuccess: (data) => {
        setResults(data.message)
        queryClient.invalidateQueries(['categories'])
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
        setResults(`Error: ${errorMessage}`)
      }
    }
  )

  const handleCleanupRawFiles = () => {
    if (confirm('Remove all RAW files (ARW, RAF, CR2, NEF, DNG, etc.) from the library database? This cannot be undone.')) {
      setResults('Removing RAW files...')
      cleanupRawFilesMutation.mutate()
    }
  }

  const handleCleanupEmptyCategories = (minImages: number) => {
    if (confirm(`Remove all categories with fewer than ${minImages} image(s)? This cannot be undone.`)) {
      setResults('Cleaning up categories...')
      cleanupEmptyCategoriesMutation.mutate(minImages)
    }
  }

  // Thumbnails maintenance
  const handlePurgeThumbnails = async () => {
    if (!confirm('Purge all generated thumbnails? They will be regenerated as needed.')) return
    try {
      setIsPurgingThumbs(true)
      const res = await jobApi.purgeThumbnails()
      setResults(res.message)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to purge thumbnails'
      setResults(`Error: ${msg}`)
    } finally {
      setIsPurgingThumbs(false)
    }
  }

  const handleGenerateThumbnails = async (force: boolean) => {
    try {
      setIsGenThumbs(true)
      const res = await jobApi.startThumbnails(force, 1024)
      setResults(`Thumbnail job started (job #${res.job_id})`)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to start thumbnail job'
      setResults(`Error: ${msg}`)
    } finally {
      setIsGenThumbs(false)
    }
  }

  const handleCleanupOrphanedImages = async () => {
    if (!confirm('Remove database entries for images whose files no longer exist? This will clean up orphaned records.')) {
      return
    }
    
    try {
      setIsCleaningOrphaned(true)
      setResults('Starting cleanup of orphaned images...')
      const res = await libraryApi.cleanupOrphaned()
      setCleanupJobId(res.job_id)
      setResults('Cleanup job started. Checking all images for missing files...')
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to start cleanup'
      setResults(`Error: ${msg}`)
      setIsCleaningOrphaned(false)
    }
  }

  const handlePurgeOneStarImages = async () => {
    if (!confirm('This will PERMANENTLY DELETE all 1-star rated images from the database and blacklist them from future scans. This cannot be undone. Are you sure?')) {
      return
    }
    
    try {
      setIsPurgingOneStars(true)
      setResults('Purging 1-star images...')
      const res = await libraryApi.purgeOneStarImages()
      setResults(`${res.message} (${res.purged_count} purged, ${res.blacklisted_count} blacklisted) `)
      queryClient.invalidateQueries(['images'])
      queryClient.invalidateQueries(['library-stats'])
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to purge 1-star images'
      setResults(`Error: ${msg}`)
    } finally {
      setIsPurgingOneStars(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Manage your photo library settings and perform maintenance tasks
        </p>
      </div>

      {/* Library Cleanup Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">Library Cleanup</h3>
        
        <div className="space-y-4">
          {/* RAW Files Cleanup */}
          <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-md">
            <div>
              <h4 className="font-medium text-orange-900 dark:text-orange-200">Remove RAW Files</h4>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                Remove all RAW files (ARW, RAF, CR2, NEF, DNG, etc.) from the database. 
                Useful when RAW exclusion is enabled.
              </p>
            </div>
            <button
              onClick={handleCleanupRawFiles}
              disabled={cleanupRawFilesMutation.isLoading}
              className="px-4 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cleanupRawFilesMutation.isLoading ? 'Removing...' : 'Remove RAW Files'}
            </button>
          </div>

          {/* Empty Categories Cleanup */}
          <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md">
            <div>
              <h4 className="font-medium text-red-900 dark:text-red-200">Cleanup Empty Categories</h4>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Remove categories that have very few or no images
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleCleanupEmptyCategories(1)}
                disabled={cleanupEmptyCategoriesMutation.isLoading}
                className="px-3 py-2 bg-red-600 text-white text-xs rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Remove Empty (0 images)
              </button>
              <button
                onClick={() => handleCleanupEmptyCategories(3)}
                disabled={cleanupEmptyCategoriesMutation.isLoading}
                className="px-3 py-2 bg-red-600 text-white text-xs rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Remove Small (&lt;3 images)
              </button>
            </div>
          </div>

          {/* Orphaned Images Cleanup */}
          <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-md">
            <div>
              <h4 className="font-medium text-purple-900 dark:text-purple-200">Remove Orphaned Images</h4>
              <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                Remove database entries for images whose files no longer exist on disk
              </p>
              {isCleaningOrphaned && cleanupJobStatus.data && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
                    <div className="animate-spin w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full"></div>
                    <span>
                      Progress: {cleanupJobStatus.data.processed_items || 0} / {cleanupJobStatus.data.total_items || 0}
                      ({cleanupJobStatus.data.progress || 0}%)
                    </span>
                  </div>
                  <div className="mt-1 w-full bg-purple-200 dark:bg-purple-800 rounded-full h-2">
                    <div 
                      className="bg-purple-600 dark:bg-purple-400 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${cleanupJobStatus.data.progress || 0}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleCleanupOrphanedImages}
              disabled={isCleaningOrphaned}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCleaningOrphaned ? 'Cleaning...' : 'Remove Orphaned'}
            </button>
          </div>

          {/* Purge 1-Star Images */}
          <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md">
            <div>
              <h4 className="font-medium text-red-900 dark:text-red-200">Purge 1-Star Images</h4>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Permanently delete all 1-star rated images and blacklist them from future scans
              </p>
            </div>
            <button
              onClick={handlePurgeOneStarImages}
              disabled={isPurgingOneStars}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPurgingOneStars ? 'Purging...' : 'Purge 1-Star Images'}
            </button>
          </div>
        </div>
      </div>

      {/* Results Display */}
      {results && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Results</h3>
          <p className="text-sm text-blue-800 dark:text-blue-300">{results}</p>
        </div>
      )}

      {/* Deletion Preferences */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">Deletion</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-gray-900 dark:text-white">Blacklist on delete</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">When deleting from the library, add the file to a blacklist so future scans skip re-importing it.</div>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={blacklistOnDelete}
              onChange={(e) => setBlacklistOnDelete(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:bg-green-600 relative transition-colors">
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform ${blacklistOnDelete ? 'translate-x-5' : ''}`}></div>
            </div>
          </label>
        </div>
      </div>

      {/* UI Preferences */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">UI Preferences</h3>
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={showAutoCategorize} onChange={(e) => setShowAutoCategorize(e.target.checked)} />
            <span className="text-gray-800 dark:text-gray-200">Show “Auto-Categorize” buttons</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={showAutoAssignFeatured} onChange={(e) => setShowAutoAssignFeatured(e.target.checked)} />
            <span className="text-gray-800 dark:text-gray-200">Show “Auto‑Assign Featured” button</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={hoverOutlineEnabled} onChange={(e) => setHoverOutlineEnabled(e.target.checked)} />
            <span className="text-gray-800 dark:text-gray-200">Highlight images on hover (browse grid)</span>
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">Toggles apply immediately and persist for this browser.</p>
        </div>
      </div>

      {/* Thumbnails */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">Thumbnails</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/40 rounded-md border border-gray-200 dark:border-gray-700">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Purge Thumbnails</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Delete all generated thumbnails. They will be recreated on demand.</p>
            </div>
            <button
              onClick={handlePurgeThumbnails}
              disabled={isPurgingThumbs}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {isPurgingThumbs ? 'Purging…' : 'Purge Thumbnails'}
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/40 rounded-md border border-gray-200 dark:border-gray-700">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Generate High‑Res Thumbnails</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">1024px longest side. Use Generate Missing first after a purge.</p>
              {thumbStatus.data && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Thumbnails: {thumbStatus.data.thumbnails} / {thumbStatus.data.total_images} (missing {thumbStatus.data.missing})</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleGenerateThumbnails(false)}
                disabled={isGenThumbs}
                className="px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                title="Create thumbnails that don't exist yet (1024px)"
              >
                {isGenThumbs ? 'Starting…' : 'Generate Missing'}
              </button>
              <button
                onClick={() => handleGenerateThumbnails(true)}
                disabled={isGenThumbs || (!!thumbStatus.data && thumbStatus.data.thumbnails === 0)}
                className="px-3 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-50"
                title="Recreate all thumbnails at 1024px (overwrites existing)"
              >
                {isGenThumbs ? 'Starting…' : 'Rebuild All'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">Metadata</h3>
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/40 rounded-md border border-gray-200 dark:border-gray-700">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">Refresh All Metadata (EXIF)</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Re-extract EXIF and file info for all images in the library.</p>
          </div>
          <button
            onClick={async () => {
              if (!confirm('Start a background job to refresh EXIF/metadata for all images?')) return
              try {
                setIsRefreshingExif(true)
                const res = await jobApi.startRefreshExif(false)
                setResults(`Refresh EXIF job started (job #${res.job_id})`)
              } catch (e: any) {
                const msg = e?.response?.data?.detail || e?.message || 'Failed to start EXIF refresh'
                setResults(`Error: ${msg}`)
              } finally {
                setIsRefreshingExif(false)
              }
            }}
            disabled={isRefreshingExif}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isRefreshingExif ? 'Starting…' : 'Refresh All Metadata'}
          </button>
        </div>
      </div>

      {/* Library Information */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-2">Library Information</h3>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <p><strong>RAW File Exclusion:</strong> {process.env.REACT_APP_EXCLUDE_RAW_FILES === 'true' ? 'Enabled' : 'Check docker-compose.yml'}</p>
          <p><strong>Supported Formats:</strong> JPG, PNG, WebP, TIFF, BMP{process.env.REACT_APP_EXCLUDE_RAW_FILES !== 'true' ? ', CR2, NEF, ARW, DNG, ORF, RAF, RW2' : ''}</p>
        </div>
      </div>
    </div>
  )
}
