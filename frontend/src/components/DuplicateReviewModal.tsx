import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { imageApi } from '../services/api'
import type { Image } from '../types'

type Cluster = { images: Image[]; phash?: string; distances?: number[] }

interface Props {
  cluster: Cluster
  onClose: () => void
  onDone?: () => void
  onProcessed?: (payload: { action: 'merged' | 'ignored'; keeperId: number; duplicateId: number }) => void
}

export default function DuplicateReviewModal({ cluster, onClose, onDone, onProcessed }: Props) {
  const qc = useQueryClient()
  const defaultKeeper = useMemo(() => selectDefaultKeeper(cluster.images), [cluster.images])
  const [keeperId, setKeeperId] = useState<number>(defaultKeeper)
  const [queue, setQueue] = useState<number[]>(() => cluster.images.map(i => i.id).filter(id => id !== defaultKeeper))
  const [index, setIndex] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [total] = useState<number>(() => Math.max(0, cluster.images.length - 1))
  const [isClosing, setIsClosing] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [animType, setAnimType] = useState<null | 'merge' | 'skip' | 'ignore'>(null)
  const [keeperPulse, setKeeperPulse] = useState(false)
  const rightId = queue[index]

  // Freeze a snapshot of images for the entire review session
  const imagesById = useMemo(() => {
    const m: Record<number, Image> = {}
    for (const im of cluster.images) m[im.id] = im
    return m
  }, [])
  const keeper = imagesById[keeperId]
  const right = rightId ? imagesById[rightId] : undefined

  const mergeMutation = useMutation(async (dupId: number) => imageApi.mergeDeleteDuplicatePair(keeperId, dupId))
  const ignoreMutation = useMutation(async (dupId: number) => imageApi.ignoreDuplicatePairs([[keeperId, dupId]]))

  // Prefetch next right image
  useEffect(() => {
    const nextId = queue[index + 1]
    if (!nextId) return
    const img = new Image()
    img.src = `/api/image-file/${nextId}`
  }, [index, queue])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (!rightId) return
      if (e.key.toLowerCase() === 'm') doMerge()
      if (e.key.toLowerCase() === 'i') doIgnore()
      if (e.key.toLowerCase() === 'k') swapKeeper()
      if (e.key === 'ArrowRight') skip()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = 'unset'
    }
  }, [rightId, keeperId, queue, index])

  function close() {
    setIsClosing(true)
    setTimeout(() => { setIsClosing(false); onClose(); if (onDone) onDone() }, 180)
  }

  function advanceToNext() {
    if (index + 1 < queue.length) {
      setIndex((i) => i + 1)
      setAnimKey((k) => k + 1)
    } else {
      close()
    }
  }

  function skip() {
    if (!rightId) return close()
    if (animType) return
    setAnimType('skip')
    const duration = 260
    setTimeout(() => {
      if (queue.length <= 1) { setAnimType(null); close(); return }
      const rest = queue.filter((_, idx) => idx !== index)
      rest.push(rightId)
      setQueue(rest)
      setAnimType(null)
      setAnimKey((k) => k + 1)
    }, duration)
  }

  function swapKeeper() {
    if (!rightId) return
    const prevKeeper = keeperId
    setKeeperId(rightId)
    setQueue((q) => {
      const rest = q.filter((id, idx) => id !== rightId)
      // Insert previous keeper at current index to let user compare new keeper vs old keeper next
      rest.splice(index, 0, prevKeeper)
      return rest
    })
    setAnimKey((k) => k + 1)
  }

  async function doMerge() {
    if (!rightId) return close()
    if (mergeMutation.isLoading || ignoreMutation.isLoading || animType) return
    try {
      await mergeMutation.mutateAsync(rightId)
      onProcessed && onProcessed({ action: 'merged', keeperId, duplicateId: rightId })
    } catch {}
    // Animate merge-together then remove
    setAnimType('merge')
    setKeeperPulse(true)
    const duration = 260
    setTimeout(() => setKeeperPulse(false), duration)
    setTimeout(() => {
      const rest = queue.filter((_, idx) => idx !== index)
      setQueue(rest)
      setProcessed((p) => p + 1)
      setAnimType(null)
      if (rest.length === 0) { close(); return }
      setIndex(Math.min(index, rest.length - 1))
      setAnimKey((k) => k + 1)
    }, duration)
  }

  async function doIgnore() {
    if (!rightId) return close()
    if (mergeMutation.isLoading || ignoreMutation.isLoading || animType) return
    try {
      await ignoreMutation.mutateAsync(rightId)
      onProcessed && onProcessed({ action: 'ignored', keeperId, duplicateId: rightId })
    } catch {}
    // Animate swipe-right then remove
    setAnimType('ignore')
    const duration = 260
    setTimeout(() => {
      const rest = queue.filter((_, idx) => idx !== index)
      setQueue(rest)
      setProcessed((p) => p + 1)
      setAnimType(null)
      if (rest.length === 0) { close(); return }
      setIndex(Math.min(index, rest.length - 1))
      setAnimKey((k) => k + 1)
    }, duration)
  }

  const progressCurrent = rightId ? (processed + 1) : Math.max(processed, total)
  const progressTotal = total

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 ${isClosing ? 'opacity-0' : 'opacity-100'} transition-opacity`}>
      <style>{`
        @keyframes mergeRight { to { transform: translateX(-40%) scale(0.6); opacity: 0; } }
        @keyframes flipAway { to { transform: perspective(800px) rotateY(90deg); opacity: 0; } }
        @keyframes swipeRight { to { transform: translateX(40%); opacity: 0; } }
        @keyframes keeperPulse { 0% { transform: scale(1); } 50% { transform: scale(1.03); } 100% { transform: scale(1); } }
        .merge-anim-right { animation: mergeRight 0.26s ease-out forwards; }
        .flip-away { animation: flipAway 0.26s ease-in forwards; transform-origin: center right; }
        .swipe-right { animation: swipeRight 0.26s ease-out forwards; }
      `}</style>
      <div className={`bg-white dark:bg-gray-900 rounded-lg w-full max-w-6xl h-[85vh] overflow-hidden flex flex-col transform ${isClosing ? 'scale-95' : 'scale-100'} transition-transform`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="text-sm text-gray-700 dark:text-gray-200">Review Duplicates • {rightId ? `${progressCurrent} / ${progressTotal}` : 'Done'}</div>
          <button onClick={close} className="text-gray-600 dark:text-gray-300 hover:text-gray-900">Close</button>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-2 p-3 min-h-0">
          {/* Left: Keeper */}
          <div className={`relative rounded-md bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden ${keeperPulse ? 'merge-keeper-pulse' : ''}`}>
            {keeper ? (
              <img
                src={`/api/image-file/${keeper.id}`}
                alt={keeper.filename}
                className={`max-w-full max-h-full object-contain ${keeperPulse ? 'animate-[keeperPulse_0.26s_ease-out]' : ''}`}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = keeper.thumbnail_path }}
              />
            ) : (
              <div className="text-gray-400">No keeper</div>
            )}
            {keeper && (
              <div className="absolute top-2 left-2 text-xs px-2 py-1 rounded bg-blue-600 text-white">Keeper</div>
            )}
            {keeper && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[11px] px-2 py-1 flex items-center gap-2">
                <span className="opacity-90">{keeper.width || '?'}×{keeper.height || '?'}</span>
                <span className="opacity-60">•</span>
                <span className="truncate" title={keeper.filename}>{keeper.filename}</span>
              </div>
            )}
          </div>

          {/* Right: Current dup */}
          <div className="relative rounded-md bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
            {right ? (
              <img
                key={animKey}
                src={`/api/image-file/${right.id}`}
                alt={right.filename}
                className={`max-w-full max-h-full object-contain transition-transform duration-200 ease-out ${animType === 'merge' ? 'merge-anim-right' : ''} ${animType === 'skip' ? 'flip-away' : ''} ${animType === 'ignore' ? 'swipe-right' : ''}`}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = right.thumbnail_path }}
                style={{ transform: `translateX(0)` }}
              />
            ) : (
              <div className="text-gray-400">No more duplicates</div>
            )}
            {right && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[11px] px-2 py-1 flex items-center gap-2">
                <span className="opacity-90">{right.width || '?'}×{right.height || '?'}</span>
                <span className="opacity-60">•</span>
                <span className="truncate" title={right.filename}>{right.filename}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={doMerge}
                disabled={!rightId || mergeMutation.isLoading || ignoreMutation.isLoading || !!animType}
                className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50"
                title="M"
              >Merge into Keeper</button>
              <button
                onClick={doIgnore}
                disabled={!rightId || mergeMutation.isLoading || ignoreMutation.isLoading || !!animType}
                className="px-3 py-2 rounded bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
                title="I"
              >Ignore</button>
              <button
                onClick={skip}
                disabled={!rightId || !!animType}
                className="px-3 py-2 rounded bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 disabled:opacity-50"
                title="→"
              >Decide Later</button>
              <button
                onClick={async () => {
                  if (!keeperId || queue.length === 0) return
                  if (!confirm(`Ignore remaining ${queue.length} image(s) in this cluster?`)) return
                  try {
                    const pairs = queue.map((id) => [keeperId, id]) as Array<[number, number]>
                    await imageApi.ignoreDuplicatePairs(pairs)
                    onProcessed && queue.forEach((id) => onProcessed!({ action: 'ignored', keeperId, duplicateId: id }))
                  } catch {}
                  setProcessed((p) => p + queue.length)
                  setQueue([])
                  close()
                }}
                disabled={!rightId || mergeMutation.isLoading || ignoreMutation.isLoading || !!animType}
                className="px-3 py-2 rounded bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 disabled:opacity-50"
              >Ignore Remaining</button>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {rightId && (
                <button onClick={swapKeeper} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700">Set Right as Keeper</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function selectDefaultKeeper(images: Image[]): number {
  const best = images.reduce<{ id: number; area: number } | null>((acc, im: any) => {
    const area = (im.width || 0) * (im.height || 0)
    if (!acc || area > acc.area) return { id: im.id, area }
    return acc
  }, null)
  return best?.id || images[0]?.id
}
