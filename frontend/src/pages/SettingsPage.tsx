
import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { categoryApi } from '../services/api'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [results, setResults] = useState<string>('')

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
        </div>
      </div>

      {/* Results Display */}
      {results && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Results</h3>
          <p className="text-sm text-blue-800 dark:text-blue-300">{results}</p>
        </div>
      )}

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
