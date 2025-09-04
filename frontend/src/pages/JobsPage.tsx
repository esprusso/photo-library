
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { jobApi } from '../services/api'

export default function JobsPage() {
  const qc = useQueryClient()
  const [actionResult, setActionResult] = useState<string>('')
  const jobs = useQuery(['jobs'], () => jobApi.getJobs(), { refetchInterval: 5000 })
  const startIndexing = useMutation(jobApi.startIndexing, { onSuccess: () => qc.invalidateQueries('jobs') })
  const startThumbs = useMutation(() => jobApi.startThumbnails(false), { onSuccess: () => qc.invalidateQueries('jobs') })
  
  const forceKillMutation = useMutation(
    jobApi.forceKillStalled,
    {
      onSuccess: (data) => {
        setActionResult(data.message)
        qc.invalidateQueries('jobs')
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
        setActionResult(`Error: ${errorMessage}`)
      }
    }
  )
  
  const cancelJobMutation = useMutation(
    (jobId: number) => jobApi.cancelJob(jobId),
    {
      onSuccess: (data) => {
        setActionResult(data.message)
        qc.invalidateQueries('jobs')
      },
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error'
        setActionResult(`Error: ${errorMessage}`)
      }
    }
  )

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Jobs</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Manage background tasks and processing jobs
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => startIndexing.mutate()}
          className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-60 hover:bg-blue-700"
          disabled={startIndexing.isLoading}
        >
          {startIndexing.isLoading ? 'Starting...' : 'Start Indexing'}
        </button>
        <button
          onClick={() => startThumbs.mutate()}
          className="px-3 py-2 rounded-md bg-green-600 text-white text-sm disabled:opacity-60 hover:bg-green-700"
          disabled={startThumbs.isLoading}
        >
          {startThumbs.isLoading ? 'Starting...' : 'Generate Thumbnails'}
        </button>
        <button
          onClick={() => {
            if (confirm('Force-kill all stalled jobs (running for >5 minutes with no progress)? This cannot be undone.')) {
              setActionResult('Force-killing stalled jobs...')
              forceKillMutation.mutate()
            }
          }}
          className="px-3 py-2 rounded-md bg-red-600 text-white text-sm disabled:opacity-60 hover:bg-red-700"
          disabled={forceKillMutation.isLoading}
        >
          {forceKillMutation.isLoading ? 'Killing...' : '💀 Force Kill Stalled'}
        </button>
      </div>

      {/* Results Display */}
      {actionResult && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
          <p className="text-sm text-blue-800 dark:text-blue-300">{actionResult}</p>
        </div>
      )}

      {jobs.isLoading ? (
        <div className="text-gray-500">Loading jobs…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
          {jobs.data?.map((j) => (
            <div key={j.id} className="p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                    {j.type}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    j.status === 'running' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                    j.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    j.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                  }`}>
                    {j.status}
                  </span>
                  <div className="text-xs text-gray-500">#{j.id}</div>
                </div>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>{j.processed_items || 0}/{j.total_items || 0} items</span>
                  <span>{j.progress || 0}% complete</span>
                  {j.status === 'running' && (
                    <div className="flex items-center space-x-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                      <span className="text-blue-600">Processing...</span>
                    </div>
                  )}
                </div>
                {j.error_message && (
                  <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                    Error: {j.error_message}
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {j.status === 'pending' && (
                  <button
                    onClick={() => {
                      if (confirm(`Cancel ${j.type} job #${j.id}?`)) {
                        cancelJobMutation.mutate(j.id)
                      }
                    }}
                    disabled={cancelJobMutation.isLoading}
                    className="px-2 py-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {(j.status === 'running' || j.status === 'failed') && (
                  <div className="text-xs text-gray-400">
                    {j.started_at ? new Date(j.started_at).toLocaleTimeString() : 'Starting...'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
