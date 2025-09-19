import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { imageApi, jobApi } from '../services/api'
import ImageModal from '../components/ImageModal'
import DuplicateReviewModal from '../components/DuplicateReviewModal'
import type { Image } from '../types'

export default function DuplicatesPage() {
  const qc = useQueryClient()
  // Exact duplicates (filename+size) state
  const [exactMedia, setExactMedia] = useState<'gif' | 'video' | 'image'>('image')
  const [exactGroups, setExactGroups] = useState<Array<{ key: string; count: number; items: any[] }>>([])
  const [mergingExact, setMergingExact] = useState(false)
  const [exactProgress, setExactProgress] = useState<{ total: number; done: number } | null>(null)
  const [selectedExact, setSelectedExact] = useState<Record<string, { keepId: number; removeIds: Set<number> }>>({})
  // Sensitivity presets control underlying threshold/prefixBits
  const [threshold, setThreshold] = useState(6)
  const [prefixBits, setPrefixBits] = useState(12)
  const [sensitivity, setSensitivity] = useState<'strict' | 'balanced' | 'loose'>('balanced')
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Comparison review modal state
  const [reviewClusterIdx, setReviewClusterIdx] = useState<number | null>(null)
  const [reviewCluster, setReviewCluster] = useState<any | null>(null)
  const [previewImageId, setPreviewImageId] = useState<number | null>(null)
  const [ephemeralRemoved, setEphemeralRemoved] = useState<Record<number, { merged: Set<number>; ignored: Set<number> }>>({})

  const { data: clusters, isLoading, isFetching, refetch } = useQuery(
    ['duplicates', threshold, prefixBits],
    () => imageApi.getDuplicates(threshold, prefixBits),
    { keepPreviousData: true, refetchOnWindowFocus: false }
  )

  const computeMutation = useMutation(imageApi.computePhash, {
    onSuccess: async (res) => {
      setTimeout(() => qc.invalidateQueries('duplicates'), 1000)
      await qc.invalidateQueries(['phash-jobs'])
    }
  })

  // Poll for running pHash job
  const phashJobs = useQuery(['phash-jobs'], () => jobApi.getJobs('phash'), { refetchInterval: 2000 })
  const running = (phashJobs.data || []).find((j: any) => j.status === 'running' || j.status === 'pending')

  useEffect(() => { refetch() }, [threshold, prefixBits])

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Exact duplicates (filename+size) quick action */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Exact Duplicates</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Groups by filename + size for safe, lossless merges.</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={exactMedia}
              onChange={(e) => setExactMedia(e.target.value as any)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              title="Filter media type"
            >
              <option value="image">Images</option>
              <option value="gif">GIF/WebP</option>
              <option value="video">Videos</option>
            </select>
            <button
              className="px-3 py-1.5 rounded bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900 text-sm"
              onClick={async () => {
                const groups = await imageApi.getDuplicatesExact(exactMedia)
                setExactGroups(groups)
                setSelectedExact({})
              }}
            >
              Scan
            </button>
            {exactGroups.length > 0 && (
              <button
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
                disabled={mergingExact}
                onClick={async () => {
                  setMergingExact(true)
                  const eligible = exactGroups.filter((g) => (g.items || []).length > 1)
                  setExactProgress({ total: eligible.length, done: 0 })
                  for (const g of eligible) {
                    // pick keeper: highest resolution, then most recent, then highest id
                    const sorted = [...g.items].sort((a, b) => {
                      const resA = (a.width || 0) * (a.height || 0)
                      const resB = (b.width || 0) * (b.height || 0)
                      if (resB !== resA) return resB - resA
                      const tA = a.created_at ? Date.parse(a.created_at) : 0
                      const tB = b.created_at ? Date.parse(b.created_at) : 0
                      if (tB !== tA) return tB - tA
                      return (b.id || 0) - (a.id || 0)
                    })
                    const keepId = sorted[0]?.id
                    const removeIds = (g.items || []).filter((x: any) => x.id !== keepId).map((x: any) => x.id)
                    if (keepId && removeIds.length) {
                      try { await imageApi.mergeExactDuplicates(keepId, removeIds) } catch {}
                    }
                    setExactProgress((p) => p ? { total: p.total, done: Math.min(p.done + 1, p.total) } : null)
                  }
                  // Refresh clusters data after merges
                  setMergingExact(false)
                  setTimeout(() => setExactProgress(null), 800)
                  qc.invalidateQueries('duplicates')
                }}
              >
                Merge All
              </button>
            )}
          </div>
        </div>
        {exactProgress && (
          <div className="text-xs text-emerald-800 dark:text-emerald-200">
            Merging… {exactProgress.done}/{exactProgress.total}
            <div className="h-1 mt-1 bg-emerald-200 dark:bg-emerald-800 rounded overflow-hidden">
              <div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, (exactProgress.done / Math.max(1, exactProgress.total)) * 100)}%` }} />
            </div>
          </div>
        )}
        {exactGroups.length > 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Found {exactGroups.length} duplicate group(s).</div>
        )}
      </div>

      {exactGroups.length > 0 && (
        <div className="space-y-4">
          {exactGroups.map((g) => {
            const state = selectedExact[g.key] || { keepId: 0, removeIds: new Set<number>() }
            const canMerge = state.keepId && state.removeIds.size > 0
            // Auto-keeper suggestion
            const suggested = (() => {
              const items = g.items || []
              if (!items.length) return null
              const sorted = [...items].sort((a, b) => {
                const resA = (a.width || 0) * (a.height || 0)
                const resB = (b.width || 0) * (b.height || 0)
                if (resB !== resA) return resB - resA
                const tA = a.created_at ? Date.parse(a.created_at) : 0
                const tB = b.created_at ? Date.parse(b.created_at) : 0
                if (tB !== tA) return tB - tA
                return (b.id || 0) - (a.id || 0)
              })
              return sorted[0]
            })()
            return (
              <div key={g.key} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{g.key} • {g.count} items</div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
                      disabled={!canMerge || mergingExact}
                      onClick={async () => {
                        const keepId = state.keepId
                        const removeIds = Array.from(state.removeIds)
                        if (!keepId || !removeIds.length) return
                        try {
                          await imageApi.mergeExactDuplicates(keepId, removeIds)
                          // Refresh exact list after merge
                          const groups = await imageApi.getDuplicatesExact(exactMedia)
                          setExactGroups(groups)
                          setSelectedExact((prev) => { const copy = { ...prev }; delete copy[g.key]; return copy })
                        } catch (e) {
                          alert('Merge failed')
                        }
                      }}
                    >
                      Merge Selected
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {g.items.map((it: any) => {
                    const isKeep = state.keepId === it.id
                    const isRemove = state.removeIds.has(it.id)
                    const wouldKeep = suggested && suggested.id === it.id
                    return (
                      <div key={it.id} className={`rounded border ${isKeep ? 'border-green-500' : isRemove ? 'border-red-500' : wouldKeep ? 'border-blue-300' : 'border-transparent'} p-2 bg-gray-50 dark:bg-gray-700 relative`}>
                        {wouldKeep && !isKeep && !isRemove && (
                          <div className="absolute top-1 right-1 bg-blue-500 text-white text-[10px] px-1 py-0.5 rounded">AUTO</div>
                        )}
                        <img src={it.thumbnail_path} alt={it.filename} className="w-full h-28 object-contain bg-white dark:bg-gray-800 rounded" />
                        <div className="mt-1 text-xs text-gray-700 dark:text-gray-300 break-all">
                          <div>{it.width && it.height ? `${it.width}×${it.height}` : 'Unknown'}</div>
                          <div className="truncate" title={it.filename}>{it.filename}</div>
                          {it.file_size && <div>{Math.round(it.file_size / 1024)} KB</div>}
                        </div>
                        <div className="mt-1 flex items-center space-x-2">
                          <label className="text-xs inline-flex items-center space-x-1">
                            <input
                              type="radio"
                              name={`keep-${g.key}`}
                              checked={isKeep}
                              onChange={() => setSelectedExact((prev) => ({ ...prev, [g.key]: { keepId: it.id, removeIds: new Set(prev[g.key]?.removeIds || []) } }))}
                            />
                            <span>Keep</span>
                          </label>
                          <label className="text-xs inline-flex items-center space-x-1">
                            <input
                              type="checkbox"
                              checked={isRemove}
                              onChange={() => setSelectedExact((prev) => {
                                const current = prev[g.key] || { keepId: 0, removeIds: new Set<number>() }
                                const set = new Set(current.removeIds)
                                if (set.has(it.id)) set.delete(it.id); else set.add(it.id)
                                return { ...prev, [g.key]: { keepId: current.keepId, removeIds: set } }
                              })}
                            />
                            <span>Remove</span>
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Duplicates</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Clusters of visually similar images using perceptual hash.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => computeMutation.mutate()}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={computeMutation.isLoading || !!running}
            title="Compute pHash for images missing it"
          >
            {computeMutation.isLoading || running ? 'Computing…' : 'Compute pHash'}
          </button>
        </div>
      </div>

      {running && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
          <div className="flex items-center justify-between text-sm">
            <div className="text-blue-900 dark:text-blue-100 font-medium">Computing perceptual hashes…</div>
            <div className="text-blue-800 dark:text-blue-200">{running.processed_items}/{running.total_items} • {running.progress}%</div>
          </div>
          <div className="mt-2 h-2 w-full bg-blue-100 dark:bg-blue-800 rounded">
            <div className="h-2 bg-blue-500 dark:bg-blue-400 rounded" style={{ width: `${Math.min(100, Math.max(0, running.progress || 0))}%` }} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center space-x-3 text-sm">
          <label className="flex items-center space-x-2">
            <span className="text-gray-600 dark:text-gray-400">Sensitivity</span>
            <select
              value={sensitivity}
              onChange={(e) => {
                const val = e.target.value as 'strict' | 'balanced' | 'loose'
                setSensitivity(val)
                // Map preset to threshold/prefixBits
                if (val === 'strict') { setThreshold(4); setPrefixBits(16) }
                else if (val === 'balanced') { setThreshold(6); setPrefixBits(12) }
                else { setThreshold(8); setPrefixBits(10) }
              }}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="strict">Strict</option>
              <option value="balanced">Balanced</option>
              <option value="loose">Loose</option>
            </select>
          </label>
          <button
            className="text-xs text-blue-600 dark:text-blue-400 underline"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >{showAdvanced ? 'Hide advanced' : 'Advanced'}</button>
          {isFetching && <span className="text-gray-500">Refreshing…</span>}
        </div>
        {showAdvanced && (
          <div className="flex items-center space-x-3 text-xs">
            <label className="flex items-center space-x-2">
              <span className="text-gray-600 dark:text-gray-400">Threshold</span>
              <input type="number" value={threshold} min={0} max={128} onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)} className="w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            </label>
            <label className="flex items-center space-x-2">
              <span className="text-gray-600 dark:text-gray-400">Prefix bits</span>
              <input type="number" value={prefixBits} min={4} max={64} onChange={(e) => setPrefixBits(parseInt(e.target.value, 10) || 12)} className="w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            </label>
            <span className="text-gray-500">Tuning for advanced use.</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : !clusters || clusters.length === 0 ? (
        <div className="text-center py-20 text-gray-500">No duplicate clusters found.</div>
      ) : (
        <div className="space-y-6">
          {clusters.map((c: any, idx: number) => {
            const removed = ephemeralRemoved[idx]
            const removedCount = removed ? (removed.merged.size + removed.ignored.size) : 0
            const visibleCount = Math.max(0, (c.images?.length || 0) - removedCount)
            if (visibleCount <= 1) return null
            return (
            <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-700 dark:text-gray-300">Cluster {idx + 1} • {visibleCount} images</div>
                <div className="text-xs text-gray-500">phash: {c.phash.slice(0, 12)}…</div>
              </div>
              

              {/* Cluster action */}
              <div className="flex items-center justify-between mb-2 text-xs">
                <div className="space-x-2">
                  <button
                    onClick={() => { setReviewClusterIdx(idx); setReviewCluster(c) }}
                    className="px-2 py-1 rounded bg-blue-600 text-white"
                  >Review</button>
                </div>
                <div className="text-gray-500">Keeper: highest resolution</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {c.images.filter((img: Image) => {
                  const r = ephemeralRemoved[idx]
                  if (!r) return true
                  return !(r.merged.has(img.id) || r.ignored.has(img.id))
                }).map((img: Image, i: number) => (
                  <div key={img.id} className={`relative rounded overflow-hidden border border-gray-200 dark:border-gray-700`}>
                    <img
                      src={`${img.thumbnail_path}?v=${encodeURIComponent(img.indexed_at || img.modified_at || img.created_at || '')}`}
                      alt={img.filename}
                      className="w-full h-32 object-cover"
                    />
                    <button
                      className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded p-1"
                      title="View larger"
                      onClick={(e) => { e.stopPropagation(); setPreviewImageId(img.id) }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M12 5c-7.633 0-11 7-11 7s3.367 7 11 7 11-7 11-7-3.367-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" />
                      </svg>
                    </button>
                    
                    {(() => {
                      const best = (c.images as Image[]).reduce((acc: any, im: any) => {
                        const area = (im.width || 0) * (im.height || 0)
                        if (!acc || area > acc.area) return { id: im.id, area }
                        return acc
                      }, null)
                      return best?.id === (img as any).id ? (
                        <div className="absolute bottom-1 right-1 text-[10px] px-1 py-0.5 rounded bg-blue-600 text-white">Keeper</div>
                      ) : null
                    })()}
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      )}
      {previewImageId && (
        <ImageModal imageId={previewImageId} onClose={() => setPreviewImageId(null)} />
      )}
      {reviewClusterIdx !== null && (reviewCluster || (clusters && clusters[reviewClusterIdx])) && (
        <DuplicateReviewModal
          cluster={reviewCluster || clusters[reviewClusterIdx]}
          onClose={() => {
            // Keep ephemeral removed state until refetch completes; just close modal
            setReviewClusterIdx(null)
            setReviewCluster(null)
          }}
          onDone={() => { qc.invalidateQueries('duplicates') }}
          onProcessed={({ action, duplicateId }) => {
            setEphemeralRemoved((prev) => {
              const current = prev[reviewClusterIdx!] || { merged: new Set<number>(), ignored: new Set<number>() }
              if (action === 'merged') current.merged.add(duplicateId)
              else current.ignored.add(duplicateId)
              return { ...prev, [reviewClusterIdx!]: current }
            })
          }}
        />
      )}
    </div>
  )
}
