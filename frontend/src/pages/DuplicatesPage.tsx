import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { duplicateApi } from '../services/api'

type Group = { key: string, count: number, items: { id: number, filename: string, file_size?: number, thumbnail_path: string, width?: number, height?: number, created_at?: string }[] }

export default function DuplicatesPage() {
  const qc = useQueryClient()
  const [media, setMedia] = useState<'gif' | 'video' | 'image'>('gif')
  const [selected, setSelected] = useState<Record<string, { keepId: number, removeIds: Set<number> }>>({})
  const [bulkMerging, setBulkMerging] = useState(false)
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)
  const { data, isLoading, refetch, isFetching } = useQuery(['duplicates', media], () => duplicateApi.getDuplicates(media), { keepPreviousData: true })

  useEffect(() => { setSelected({}) }, [media])

  const mergeMutation = useMutation(
    async (payload: { key: string, keepId: number, removeIds: number[] }) => duplicateApi.merge(payload.keepId, payload.removeIds, false),
    { onSuccess: () => { qc.invalidateQueries(['duplicates', media]); refetch() } }
  )

  const groups = data || []

  const setKeep = (key: string, id: number) => {
    setSelected(prev => ({ ...prev, [key]: { keepId: id, removeIds: new Set((prev[key]?.removeIds) || []) } }))
  }
  const toggleRemove = (key: string, id: number) => {
    setSelected(prev => {
      const current = prev[key] || { keepId: 0, removeIds: new Set<number>() }
      const set = new Set(current.removeIds)
      if (set.has(id)) set.delete(id); else set.add(id)
      return { ...prev, [key]: { keepId: current.keepId, removeIds: set } }
    })
  }

  const canMergeAll = (g: Group) => {
    if (!g.items || g.items.length < 2) return false
    // All items must have valid width/height and be equal
    if (g.items.some(it => !it.width || !it.height)) return false
    const first = g.items[0]
    const w = first.width as number
    const h = first.height as number
    return g.items.every(it => (it.width as number) === w && (it.height as number) === h)
  }

  const mergeAll = async (g: Group) => {
    if (!canMergeAll(g)) return
    // Choose the most recently created item as the keeper
    const items = [...g.items]
    items.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0
      const tb = b.created_at ? Date.parse(b.created_at) : 0
      if (tb !== ta) return tb - ta
      return b.id - a.id // fallback by id if times equal/missing
    })
    const keepId = items[0].id
    const removeIds = items.slice(1).map(i => i.id)
    setProgress({ total: 1, done: 0 })
    try {
      await duplicateApi.merge(keepId, removeIds, false)
      setProgress({ total: 1, done: 1 })
      await qc.invalidateQueries(['duplicates', media])
      refetch()
    } finally {
      setTimeout(() => setProgress(null), 600)
    }
  }

  const mergeAllEligibleGroups = async () => {
    if (!groups?.length) return
    const eligible = groups.filter(canMergeAll)
    if (!eligible.length) return
    if (!confirm(`Merge ${eligible.length} duplicate group(s) by keeping the most recent in each?`)) return
    setBulkMerging(true)
    setProgress({ total: eligible.length, done: 0 })
    try {
      for (const g of eligible) {
        const items = [...g.items]
        items.sort((a, b) => {
          const ta = a.created_at ? Date.parse(a.created_at) : 0
          const tb = b.created_at ? Date.parse(b.created_at) : 0
          if (tb !== ta) return tb - ta
          return b.id - a.id
        })
        const keepId = items[0].id
        const removeIds = items.slice(1).map(i => i.id)
        try {
          await duplicateApi.merge(keepId, removeIds, false)
          setProgress((p) => p ? { total: p.total, done: p.done + 1 } : null)
          // Refresh after each merge to ensure groups update and results stick
          await qc.invalidateQueries(['duplicates', media])
          // Small delay to allow backend commit visibility across DB/containers
          await new Promise(r => setTimeout(r, 100))
        } catch (e) {
          // Continue merging the rest; errors will be visible in logs
          console.error('Bulk merge failed for group', g.key, e)
        }
      }
      await qc.invalidateQueries(['duplicates', media])
      refetch()
    } finally {
      setBulkMerging(false)
      setTimeout(() => setProgress(null), 600)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Duplicates</h2>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600 dark:text-gray-300">Media:</label>
          <select value={media} onChange={(e) => setMedia(e.target.value as any)} className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm">
            <option value="gif">GIFs</option>
            <option value="video">Videos</option>
            <option value="image">Images</option>
          </select>
          {/* Global Merge All for current media (esp. GIFs) */}
          {groups.length > 0 && groups.some(canMergeAll) && (
            <button
              onClick={mergeAllEligibleGroups}
              disabled={bulkMerging}
              className="ml-2 px-3 py-1 text-xs rounded bg-emerald-600 text-white disabled:opacity-50"
              title="Keep the most recent in each group where all resolutions match"
            >
              {bulkMerging ? 'Merging…' : 'Merge All'}
            </button>
          )}
        </div>
      </div>

      {/* Merge progress banner */}
      {progress && (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-2 text-xs text-emerald-800 dark:text-emerald-200">
          Merging duplicates… {progress.done}/{progress.total}
          <div className="h-1 mt-1 bg-emerald-200 dark:bg-emerald-800 rounded overflow-hidden">
            <div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }} />
          </div>
        </div>
      )}

      {isLoading || isFetching ? (
        <div className="text-gray-500">Searching for duplicates…</div>
      ) : groups.length === 0 ? (
        <div className="text-gray-500">No duplicates found.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{g.key} • {g.count} items</div>
                <div className="flex items-center gap-2">
                  {canMergeAll(g) && (
                    <button
                      onClick={() => mergeAll(g)}
                      disabled={mergeMutation.isLoading || !!progress}
                      className="px-3 py-1 text-xs rounded bg-emerald-600 text-white disabled:opacity-50"
                      title="All items in this group have the same resolution. Keep the most recent, remove the rest."
                    >
                      Merge All
                    </button>
                  )}
                  <button
                  onClick={() => {
                    const state = selected[g.key]
                    if (!state || !state.keepId || state.removeIds.size === 0) return
                    mergeMutation.mutate({ key: g.key, keepId: state.keepId, removeIds: Array.from(state.removeIds) })
                  }}
                  disabled={!selected[g.key]?.keepId || (selected[g.key]?.removeIds.size || 0) === 0 || mergeMutation.isLoading}
                  className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
                >
                  {mergeMutation.isLoading ? 'Merging…' : 'Merge Selected'}
                </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {g.items.map((it) => {
                  const state = selected[g.key] || { keepId: 0, removeIds: new Set<number>() }
                  const isKeep = state.keepId === it.id
                  const isRemove = state.removeIds.has(it.id)
                  return (
                    <div key={it.id} className={`rounded border ${isKeep ? 'border-green-500' : isRemove ? 'border-red-500' : 'border-transparent'} p-2 bg-gray-50 dark:bg-gray-700`}>
                      <img src={it.thumbnail_path} alt={it.filename} className="w-full h-32 object-contain bg-gray-100 dark:bg-gray-600 rounded" />
                      <div className="mt-1 text-xs text-gray-700 dark:text-gray-300 break-all">
                        {it.width && it.height ? `${it.width}×${it.height}` : it.filename}
                      </div>
                      <div className="mt-1 flex items-center space-x-2">
                        <label className="text-xs inline-flex items-center space-x-1">
                          <input type="radio" name={`keep-${g.key}`} checked={isKeep} onChange={() => setKeep(g.key, it.id)} />
                          <span>Keep</span>
                        </label>
                        <label className="text-xs inline-flex items-center space-x-1">
                          <input type="checkbox" checked={isRemove} onChange={() => toggleRemove(g.key, it.id)} />
                          <span>Remove</span>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
