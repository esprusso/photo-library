
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { jobApi } from '../services/api'

export default function JobsPage() {
  const qc = useQueryClient()
  const jobs = useQuery(['jobs'], () => jobApi.getJobs(), { refetchInterval: 5000 })
  const startIndexing = useMutation(jobApi.startIndexing, { onSuccess: () => qc.invalidateQueries('jobs') })
  const startThumbs = useMutation(() => jobApi.startThumbnails(false), { onSuccess: () => qc.invalidateQueries('jobs') })

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => startIndexing.mutate()}
          className="px-3 py-2 rounded-md bg-primary-600 text-white text-sm disabled:opacity-60"
          disabled={startIndexing.isLoading}
        >Start Indexing</button>
        <button
          onClick={() => startThumbs.mutate()}
          className="px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-60"
          disabled={startThumbs.isLoading}
        >Generate Thumbnails</button>
      </div>

      {jobs.isLoading ? (
        <div className="text-gray-500">Loading jobs…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
          {jobs.data?.map((j) => (
            <div key={j.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-900 dark:text-white">{j.type} — {j.status}</div>
                <div className="text-xs text-gray-500">{j.processed_items}/{j.total_items} • {j.progress}%</div>
              </div>
              <div className="text-xs text-gray-500">#{j.id}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
