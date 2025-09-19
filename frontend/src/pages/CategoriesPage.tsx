
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { categoryApi, imageApi } from '../services/api'
import type { Category } from '../types'
import ImagePickerModal from '../components/ImagePickerModal'

export default function CategoriesPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'image_count'>('name')
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null)
  const [mergeRename, setMergeRename] = useState('')
  const [mergeOverwriteFeatured, setMergeOverwriteFeatured] = useState(false)
  
  const { data: categories, isLoading } = useQuery(
    ['categories', sortBy], 
    () => {
      // Map frontend sort values to backend expected values
      const backendSortBy = sortBy === 'image_count' ? 'count' : sortBy
      return categoryApi.getCategories('', backendSortBy)
    }
  )
  
  const createMutation = useMutation(
    () => categoryApi.createCategory(name, description), 
    {
      onSuccess: () => {
        setName('')
        setDescription('')
        qc.invalidateQueries('categories')
      },
    }
  )

  const deleteMutation = useMutation(
    (id: number) => categoryApi.deleteCategory(id),
    {
      onSuccess: () => {
        qc.invalidateQueries('categories')
      },
    }
  )

  const bulkDeleteMutation = useMutation(
    (categoryIds: number[]) => categoryApi.bulkDeleteCategories(categoryIds),
    {
      onSuccess: () => {
        setSelectedCategories(new Set())
        setBulkMode(false)
        qc.invalidateQueries('categories')
      },
      onError: (error: any) => {
        console.error('Bulk delete failed:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        
        let errorMessage = 'Unknown error'
        
        if (error?.response?.data?.detail) {
          errorMessage = error.response.data.detail
        } else if (error?.response?.data?.message) {
          errorMessage = error.response.data.message
        } else if (error?.message) {
          errorMessage = error.message
        } else if (typeof error === 'string') {
          errorMessage = error
        } else {
          errorMessage = `Network or server error: ${error?.response?.status || 'Unknown'}`
        }
        
        alert(`Failed to delete categories: ${errorMessage}`)
      }
    }
  )

  const mergeMutation = useMutation(
    async () => {
      const sourceIds = Array.from(selectedCategories)
      if (!mergeTargetId) throw new Error('No target selected')
      const payload: any = { source_ids: sourceIds.filter((id) => id !== mergeTargetId), target_id: mergeTargetId }
      if (mergeRename.trim()) payload.rename_target = mergeRename.trim()
      if (mergeOverwriteFeatured) payload.overwrite_featured = true
      return categoryApi.mergeCategories(payload)
    },
    {
      onSuccess: async () => {
        setShowMergeModal(false)
        setMergeTargetId(null)
        setMergeRename('')
        setMergeOverwriteFeatured(false)
        setSelectedCategories(new Set())
        await qc.invalidateQueries('categories')
      },
      onError: (err: any) => {
        alert(`Merge failed: ${err?.response?.data?.detail || err.message || 'Unknown error'}`)
      }
    }
  )

  const updateMutation = useMutation(
    ({ id, updates }: { id: number; updates: { name?: string; description?: string; color?: string; featured_image_id?: number | null; featured_image_position?: string | null } }) =>
      categoryApi.updateCategory(id, updates),
    {
      onSuccess: () => {
        setEditingCategory(null)
        qc.invalidateQueries('categories')
      },
      onError: (error: any) => {
        console.error('Category update failed:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        
        let errorMessage = 'Unknown error'
        
        if (error?.response?.data?.detail) {
          errorMessage = error.response.data.detail
        } else if (error?.response?.data?.message) {
          errorMessage = error.response.data.message
        } else if (error?.message) {
          errorMessage = error.message
        } else if (typeof error === 'string') {
          errorMessage = error
        } else {
          errorMessage = `Network or server error: ${error?.response?.status || 'Unknown'}`
        }
        
        alert(`Failed to update category: ${errorMessage}`)
      }
    }
  )

  const autoCategorizeMutation = useMutation(categoryApi.autoCategorizeByFolders, {
    onSuccess: () => {
      qc.invalidateQueries('categories')
    },
  })
  // UI prefs: listen to settings
  const [showAutoCategorize, setShowAutoCategorize] = useState<boolean>(() => {
    const v = localStorage.getItem('ui.showAutoCategorize')
    return v == null ? true : v === 'true'
  })
  const [showAutoAssignFeatured, setShowAutoAssignFeatured] = useState<boolean>(() => {
    const v = localStorage.getItem('ui.showAutoAssignFeatured')
    return v == null ? true : v === 'true'
  })
  
  // Update when settings change
  useEffect(() => {
    const handler = () => {
      const a = localStorage.getItem('ui.showAutoCategorize')
      const b = localStorage.getItem('ui.showAutoAssignFeatured')
      setShowAutoCategorize(a == null ? true : a === 'true')
      setShowAutoAssignFeatured(b == null ? true : b === 'true')
    }
    window.addEventListener('ui-settings-changed', handler as any)
    return () => window.removeEventListener('ui-settings-changed', handler as any)
  }, [])

  const autoPopulateFeaturedMutation = useMutation(categoryApi.autoPopulateFeatured, {
    onSuccess: () => {
      qc.invalidateQueries('categories')
    },
  })

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
  }

  const handleSaveEdit = () => {
    if (!editingCategory) return
    
    console.log('Saving category edit:', {
      id: editingCategory.id,
      updates: {
        name: editingCategory.name,
        description: editingCategory.description,
        color: editingCategory.color,
        featured_image_id: (editingCategory as Category).featured_image_id ?? null,
        featured_image_position: (editingCategory as Category).featured_image_position ?? null,
      }
    })
    
    updateMutation.mutate({
      id: editingCategory.id,
      updates: {
        name: editingCategory.name,
        description: editingCategory.description,
        color: editingCategory.color,
        featured_image_id: (editingCategory as Category).featured_image_id ?? null,
        featured_image_position: (editingCategory as Category).featured_image_position ?? null,
      }
    })
  }

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete the category "${name}"?`)) {
      deleteMutation.mutate(id)
    }
  }

  const toggleCategorySelection = (categoryId: number, event?: React.MouseEvent) => {
    if (!categories) return

    const categoryIndex = categories.findIndex(c => c.id === categoryId)
    
    if (event?.shiftKey && lastSelectedIndex !== null) {
      // Range selection: select all items between last clicked and current
      const startIndex = Math.min(lastSelectedIndex, categoryIndex)
      const endIndex = Math.max(lastSelectedIndex, categoryIndex)
      
      setSelectedCategories(prev => {
        const newSet = new Set(prev)
        for (let i = startIndex; i <= endIndex; i++) {
          newSet.add(categories[i].id)
        }
        return newSet
      })
    } else {
      // Single selection: toggle the clicked item
      setSelectedCategories(prev => {
        const newSet = new Set(prev)
        if (newSet.has(categoryId)) {
          newSet.delete(categoryId)
        } else {
          newSet.add(categoryId)
        }
        return newSet
      })
      setLastSelectedIndex(categoryIndex)
    }
  }

  const selectAllCategories = () => {
    if (categories) {
      setSelectedCategories(new Set(categories.map(c => c.id)))
    }
  }

  const clearSelection = () => {
    setSelectedCategories(new Set())
  }

  const handleBulkDelete = () => {
    const selectedIds = Array.from(selectedCategories)
    if (selectedIds.length === 0) return
    
    const categoryNames = categories
      ?.filter(c => selectedIds.includes(c.id))
      .map(c => c.name)
      .slice(0, 3)
      .join(', ')
    
    const displayNames = categoryNames + (selectedIds.length > 3 ? ` and ${selectedIds.length - 3} more` : '')
    
    if (confirm(`Are you sure you want to delete ${selectedIds.length} categories: ${displayNames}?`)) {
      bulkDeleteMutation.mutate(selectedIds)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Categories</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Organize your images into categories for easy browsing
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setBulkMode(!bulkMode)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              bulkMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {bulkMode ? 'Exit Bulk Mode' : 'Bulk Select'}
          </button>
          {showAutoCategorize && (
            <button
              onClick={() => autoCategorizeMutation.mutate()}
              disabled={autoCategorizeMutation.isLoading}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
              title="Auto-create categories from folder structure"
            >
              {autoCategorizeMutation.isLoading ? 'Processing...' : '📁 Auto-Categorize Folders'}
            </button>
          )}
          {showAutoAssignFeatured && (
            <button
              onClick={() => autoPopulateFeaturedMutation.mutate()}
              disabled={autoPopulateFeaturedMutation.isLoading}
              className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-60"
              title="Set first image as featured for categories that don't have one"
            >
              {autoPopulateFeaturedMutation.isLoading ? 'Assigning…' : '✨ Auto‑Assign Featured'}
            </button>
          )}
        </div>
      </div>

      {/* Create New Category */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-3">Create New Category</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
              className="px-3 py-2 rounded-md bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="px-3 py-2 rounded-md bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-center justify-between">
            <div></div>
            <button
              onClick={() => createMutation.mutate()}
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
              disabled={!name || createMutation.isLoading}
            >
              {createMutation.isLoading ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Controls */}
      {bulkMode && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                {selectedCategories.size} categories selected
              </span>
              <div className="flex space-x-2">
                <button
                  onClick={selectAllCategories}
                  className="px-3 py-1 text-sm text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1 text-sm text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  Clear Selection
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const ids = Array.from(selectedCategories)
                  if (ids.length < 2) return
                  setMergeTargetId(ids[0])
                  setMergeRename('')
                  setMergeOverwriteFeatured(false)
                  setShowMergeModal(true)
                }}
                disabled={selectedCategories.size < 2}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Merge Selected ({selectedCategories.size})
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedCategories.size === 0 || bulkDeleteMutation.isLoading}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkDeleteMutation.isLoading ? 'Deleting...' : `Delete Selected (${selectedCategories.size})`}
              </button>
            </div>
          </div>
          <MergeModal
            isOpen={showMergeModal}
            onClose={() => setShowMergeModal(false)}
            selectedIds={Array.from(selectedCategories)}
            categories={categories || []}
            targetId={mergeTargetId}
            setTargetId={setMergeTargetId}
            rename={mergeRename}
            setRename={setMergeRename}
            overwriteFeatured={mergeOverwriteFeatured}
            setOverwriteFeatured={setMergeOverwriteFeatured}
            onConfirm={() => mergeMutation.mutate()}
            isLoading={mergeMutation.isLoading}
          />
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex items-center space-x-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">Sort by:</span>
        <button
          onClick={() => setSortBy('name')}
          className={`px-3 py-1 rounded text-sm ${
            sortBy === 'name' 
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Name
        </button>
        <button
          onClick={() => setSortBy('image_count')}
          className={`px-3 py-1 rounded text-sm ${
            sortBy === 'image_count'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Image Count
        </button>
      </div>

      {/* Categories List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading categories...</div>
      ) : !categories || categories.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-500 dark:text-gray-400 mb-2">No categories found</div>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Create a category above or use "Auto-Categorize Folders" to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
                  <CategoryCard 
                    key={category.id} 
                    category={category} 
                    bulkMode={bulkMode}
                    selectedCategories={selectedCategories}
                    editingCategory={editingCategory}
                    onToggleSelection={toggleCategorySelection}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setEditingCategory(null)}
                    setEditingCategory={setEditingCategory}
                    updateMutation={updateMutation}
                    isFeatured={false}
                  />
          ))}
        </div>
      )}
      {/* Floating Select FAB */}
      <button
        onClick={() => setBulkMode(!bulkMode)}
        className={`fixed right-4 md:right-6 bottom-6 z-40 rounded-full shadow-lg focus:outline-none transition transform hover:scale-105 
          ${bulkMode ? 'bg-blue-600 text-white' : 'bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900'}`}
        style={{ padding: '12px 16px' }}
        title={bulkMode ? 'Exit selection' : 'Select categories'}
        aria-label={bulkMode ? 'Exit selection' : 'Select categories'}
      >
        {bulkMode ? (
          <span className="flex items-center space-x-2">
            <span>Exit</span>
            <span className="ml-2 inline-flex items-center justify-center text-xs font-semibold bg-white/20 rounded px-2 py-0.5">
              {selectedCategories.size}
            </span>
          </span>
        ) : (
          <span className="flex items-center space-x-2">
            <span>Select</span>
          </span>
        )}
      </button>

      {/* Floating Merge FAB (shows only in bulk mode with 2+ selected) */}
      {bulkMode && (
        <button
          onClick={() => {
            if (selectedCategories.size < 2) return
            const ids = Array.from(selectedCategories)
            setMergeTargetId(ids[0] || null)
            setMergeRename('')
            setMergeOverwriteFeatured(false)
            setShowMergeModal(true)
          }}
          className={`fixed right-4 md:right-6 bottom-20 z-40 rounded-full shadow-lg focus:outline-none transition transform hover:scale-105 text-white ${
            selectedCategories.size >= 2 ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-400 cursor-not-allowed'
          }`}
          style={{ padding: '12px 16px' }}
          title={selectedCategories.size >= 2 ? 'Merge selected categories' : 'Select 2+ categories to merge'}
          aria-label="Merge selected categories"
          disabled={selectedCategories.size < 2}
        >
          <span className="flex items-center space-x-2">
            <span>Merge</span>
            <span className="ml-2 inline-flex items-center justify-center text-xs font-semibold bg-white/20 rounded px-2 py-0.5">
              {selectedCategories.size}
            </span>
          </span>
        </button>
      )}
    </div>
  )
}

// Simple merge modal
function MergeModal({
  isOpen,
  onClose,
  selectedIds,
  categories,
  targetId,
  setTargetId,
  rename,
  setRename,
  overwriteFeatured,
  setOverwriteFeatured,
  onConfirm,
  isLoading
}: any) {
  if (!isOpen) return null
  const options = categories.filter((c: Category) => selectedIds.includes(c.id))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-lg shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Merge Categories</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Target category</label>
            <select
              value={targetId ?? ''}
              onChange={(e) => setTargetId(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
            >
              {options.map((c: Category) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Rename target (optional)</label>
            <input
              value={rename}
              onChange={(e) => setRename(e.target.value)}
              placeholder="New category name"
              className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={overwriteFeatured} onChange={(e) => setOverwriteFeatured(e.target.checked)} />
            <span>Overwrite target featured image (choose first image)</span>
          </label>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Merges {selectedIds.length} categories into the target. Images are unified without duplicates; source categories are deleted.
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isLoading || !targetId}
            className="px-3 py-2 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isLoading ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}

// CategoryCard Component
function CategoryCard({
  category,
  bulkMode,
  selectedCategories,
  editingCategory,
  onToggleSelection,
  onEdit,
  onDelete,
  onSaveEdit,
  onCancelEdit,
  setEditingCategory,
  updateMutation,
  isFeatured
}: {
  category: Category
  bulkMode: boolean
  selectedCategories: Set<number>
  editingCategory: Category | null
  onToggleSelection: (categoryId: number, event?: React.MouseEvent) => void
  onEdit: (category: Category) => void
  onDelete: (id: number, name: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  setEditingCategory: (category: Category) => void
  updateMutation: any
  isFeatured: boolean
}) {
  // Compute object position from future-friendly JSON string (center default)
  const computeObjectPosition = (pos?: string | null) => {
    try {
      if (!pos) return 'center';
      const parsed = JSON.parse(pos);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        return `${parsed.x}% ${parsed.y}%`;
      }
    } catch (_) {}
    return 'center';
  };

  const parsePosition = (pos?: string | null): { x: number; y: number } => {
    try {
      if (!pos) return { x: 50, y: 50 }
      const parsed = JSON.parse(pos)
      const x = typeof parsed?.x === 'number' ? parsed.x : 50
      const y = typeof parsed?.y === 'number' ? parsed.y : 50
      return { x, y }
    } catch {
      return { x: 50, y: 50 }
    }
  }

  const posValues = useMemo(() => parsePosition((editingCategory && editingCategory.id === category.id) ? (editingCategory as Category).featured_image_position : category.featured_image_position), [editingCategory, category])

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border p-0 transition-all overflow-hidden ${
        bulkMode ? 'cursor-pointer hover:shadow-lg' : 'hover:shadow-md'
      } ${
        bulkMode && selectedCategories.has(category.id)
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
          : 'border-gray-200 dark:border-gray-700'
      }`}
      onClick={bulkMode ? (e) => onToggleSelection(category.id, e) : undefined}
    >
      {/* Featured Image banner */}
      {category.featured_image_thumbnail_path ? (
        (() => {
          const banner = (
            <div className="relative group h-32 sm:h-40 w-full">
              <img
                src={category.featured_image_thumbnail_path}
                alt={category.name}
                className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity duration-200"
                style={{ objectPosition: computeObjectPosition((category as Category).featured_image_position) }}
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
            </div>
          )
          const canOpen = !bulkMode && (!editingCategory || editingCategory.id !== category.id)
          return canOpen ? (
            <Link
              to={`/browse?categories=${encodeURIComponent(category.name)}`}
              onClick={(e) => e.stopPropagation()}
              className="block"
            >
              {banner}
            </Link>
          ) : banner
        })()
      ) : (
        <div className="h-2 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-gray-700 dark:via-gray-800 dark:to-gray-700" />
      )}

      <div className="p-4">
        {editingCategory?.id === category.id ? (
          // Edit Mode
          <div className="space-y-3">
            <input
              value={editingCategory.name}
              onChange={(e) => setEditingCategory({...editingCategory, name: e.target.value})}
              className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
            <textarea
              value={editingCategory.description || ''}
              onChange={(e) => setEditingCategory({...editingCategory, description: e.target.value})}
              placeholder="Description"
              rows={2}
              className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
            />
            {/* Featured image picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700 dark:text-gray-300">Featured Image</div>
                <div className="space-x-2">
                  <ImagePickerLauncher
                    onPick={(img) => {
                      setEditingCategory({ ...(editingCategory as Category), featured_image_id: img.id, featured_image_thumbnail_path: img.thumbnail_path } as Category)
                    }}
                    categoryName={category.name}
                  />
                  <CoverUploadButton
                    onUploaded={(img) => {
                      setEditingCategory({ ...(editingCategory as Category), featured_image_id: img.id, featured_image_thumbnail_path: img.thumbnail_path } as Category)
                    }}
                  />
                  {(editingCategory as Category).featured_image_id ? (
                    <button
                      onClick={() => setEditingCategory({ ...(editingCategory as Category), featured_image_id: null, featured_image_thumbnail_path: null } as Category)}
                      className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              {(editingCategory as Category).featured_image_thumbnail_path ? (
                <div className="relative h-32 w-full rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img
                    src={(editingCategory as Category).featured_image_thumbnail_path as string}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ objectPosition: computeObjectPosition((editingCategory as Category).featured_image_position) }}
                  />
                </div>
              ) : null}
            </div>

            {/* Position controls */}
            {(editingCategory as Category).featured_image_id ? (
              <div className="space-y-2">
                <div className="text-sm text-gray-700 dark:text-gray-300">Image Position</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Horizontal ({posValues.x}%)</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={posValues.x}
                      onChange={(e) => {
                        const x = parseInt(e.target.value, 10)
                        const y = posValues.y
                        const json = JSON.stringify({ x, y })
                        setEditingCategory({ ...(editingCategory as Category), featured_image_position: json } as Category)
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Vertical ({posValues.y}%)</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={posValues.y}
                      onChange={(e) => {
                        const y = parseInt(e.target.value, 10)
                        const x = posValues.x
                        const json = JSON.stringify({ x, y })
                        setEditingCategory({ ...(editingCategory as Category), featured_image_position: json } as Category)
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {/* Color removed */}
            <div className="flex space-x-2">
              <button
                onClick={onSaveEdit}
                disabled={updateMutation.isLoading}
                className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          // View Mode
          <>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-3">
                {bulkMode && (
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(category.id)}
                    onChange={(e) => {
                      e.stopPropagation()
                      onToggleSelection(category.id, e as any)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                )}
                {/* Color dot removed */}
              </div>
              {!bulkMode && (
                <div className="flex space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(category)
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Edit category"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(category.id, category.name)
                    }}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="Delete category"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
            
            {bulkMode ? (
              <div className="block p-1 -m-1">
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                  {category.name}
                </h3>
                {category.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {category.description}
                  </p>
                )}
                <div className="text-sm text-gray-500">
                  {category.image_count} {category.image_count === 1 ? 'image' : 'images'}
                </div>
              </div>
            ) : (
              <Link
                to={`/browse?categories=${encodeURIComponent(category.name)}`}
                className="block hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-1 -m-1 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                  {category.name}
                </h3>
                {category.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {category.description}
                  </p>
                )}
                <div className="text-sm text-gray-500">
                  {category.image_count} {category.image_count === 1 ? 'image' : 'images'}
                </div>
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ImagePickerLauncher({ onPick, categoryName }: { onPick: (img: any) => void, categoryName?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        Select Image
      </button>
      <ImagePickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={(img) => { onPick(img); setOpen(false) }}
        categoryName={categoryName}
      />
    </>
  )
}

function CoverUploadButton({ onUploaded }: { onUploaded: (img: any) => void }) {
  const [busy, setBusy] = useState(false)
  const fileInputId = 'cover-upload-input'

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try {
      const img = await imageApi.uploadImage(f)
      onUploaded(img)
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || 'Upload failed')
    } finally {
      setBusy(false)
      // reset input
      try { (e.target as any).value = '' } catch {}
    }
  }

  return (
    <>
      <input id={fileInputId} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={onSelect} />
      <button
        onClick={() => document.getElementById(fileInputId)?.click()}
        className="px-2 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
        disabled={busy}
        title="Upload a custom cover image"
      >
        {busy ? 'Uploading…' : 'Upload Cover'}
      </button>
    </>
  )
}
