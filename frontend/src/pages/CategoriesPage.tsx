
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { categoryApi } from '../services/api'
import type { Category } from '../types'

export default function CategoriesPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'image_count'>('name')
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  
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

  const updateMutation = useMutation(
    ({ id, updates }: { id: number; updates: { name?: string; description?: string; color?: string } }) =>
      categoryApi.updateCategory(id, updates),
    {
      onSuccess: () => {
        setEditingCategory(null)
        qc.invalidateQueries('categories')
      },
    }
  )

  const autoCategorizeMutation = useMutation(categoryApi.autoCategorizeByFolders, {
    onSuccess: () => {
      qc.invalidateQueries('categories')
    },
  })

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
  }

  const handleSaveEdit = () => {
    if (!editingCategory) return
    
    updateMutation.mutate({
      id: editingCategory.id,
      updates: {
        name: editingCategory.name,
        description: editingCategory.description,
        color: editingCategory.color
      }
    })
  }

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete the category "${name}"?`)) {
      deleteMutation.mutate(id)
    }
  }

  const toggleCategorySelection = (categoryId: number) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId)
      } else {
        newSet.add(categoryId)
      }
      return newSet
    })
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
          <button
            onClick={() => autoCategorizeMutation.mutate()}
            disabled={autoCategorizeMutation.isLoading}
            className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
            title="Auto-create categories from folder structure"
          >
            {autoCategorizeMutation.isLoading ? 'Processing...' : '📁 Auto-Categorize Folders'}
          </button>
        </div>
      </div>

      {/* Create New Category */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-3">Create New Category</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <button
            onClick={() => createMutation.mutate()}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
            disabled={!name || createMutation.isLoading}
          >
            {createMutation.isLoading ? 'Creating...' : 'Create Category'}
          </button>
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
            <button
              onClick={handleBulkDelete}
              disabled={selectedCategories.size === 0 || bulkDeleteMutation.isLoading}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkDeleteMutation.isLoading ? 'Deleting...' : `Delete Selected (${selectedCategories.size})`}
            </button>
          </div>
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
            <div
              key={category.id}
              className={`bg-white dark:bg-gray-800 rounded-lg border p-4 transition-all ${
                bulkMode ? 'cursor-pointer hover:shadow-lg' : 'hover:shadow-md'
              } ${
                bulkMode && selectedCategories.has(category.id)
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
              onClick={bulkMode ? () => toggleCategorySelection(category.id) : undefined}
            >
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
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={updateMutation.isLoading}
                      className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
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
                            toggleCategorySelection(category.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                      )}
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: category.color }}
                      ></div>
                    </div>
                    {!bulkMode && (
                      <div className="flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEdit(category)
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          title="Edit category"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(category.id, category.name)
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
          ))}
        </div>
      )}
    </div>
  )
}
