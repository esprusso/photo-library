
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { tagApi } from '../services/api'
import type { Tag } from '../types'

export default function TagsPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [editingTag, setEditingTag] = useState<{ id: number; name: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'count'>('name')

  const { data: tags, isLoading } = useQuery('tags', () => tagApi.getTags(searchTerm, sortBy))

  const create = useMutation((n: string) => tagApi.createTag(n), {
    onSuccess: () => {
      setName('')
      qc.invalidateQueries('tags')
    },
  })

  const deleteMutation = useMutation(
    (ids: number[]) => Promise.all(ids.map(id => tagApi.deleteTag(id))),
    {
      onSuccess: () => {
        setSelectedTags(new Set())
        qc.invalidateQueries('tags')
      },
    }
  )

  const updateMutation = useMutation(
    ({ id, name }: { id: number; name: string }) => tagApi.updateTag(id, { name }),
    {
      onSuccess: () => {
        setEditingTag(null)
        qc.invalidateQueries('tags')
      },
    }
  )

  const toggleTagSelection = (tagId: number) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tagId)) {
        newSet.delete(tagId)
      } else {
        newSet.add(tagId)
      }
      return newSet
    })
  }

  const toggleBulkMode = () => {
    setBulkMode(!bulkMode)
    if (bulkMode) {
      setSelectedTags(new Set())
    }
  }

  const selectAll = () => {
    if (tags) {
      setSelectedTags(new Set(tags.map(tag => tag.id)))
    }
  }

  const clearSelection = () => {
    setSelectedTags(new Set())
  }

  const handleBulkDelete = () => {
    const selectedIds = Array.from(selectedTags)
    if (selectedIds.length === 0) return

    const tagNames = tags?.filter(t => selectedIds.includes(t.id)).map(t => t.name).join(', ')
    
    if (confirm(`Delete ${selectedIds.length} tag(s): ${tagNames}?\n\nThis will remove these tags from all images.`)) {
      deleteMutation.mutate(selectedIds)
    }
  }

  const handleRename = (tag: Tag) => {
    setEditingTag({ id: tag.id, name: tag.name })
  }

  const handleSaveRename = () => {
    if (editingTag && editingTag.name.trim()) {
      updateMutation.mutate(editingTag)
    }
  }

  const handleCancelRename = () => {
    setEditingTag(null)
  }

  const filteredTags = tags || []

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tags</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleBulkMode}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              bulkMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {bulkMode ? 'Exit Selection' : 'Select Tags'}
          </button>
        </div>
      </div>

      {/* Search and Sort */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tags..."
            className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'count')}
          className="px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
        >
          <option value="name">Sort by Name</option>
          <option value="count">Sort by Usage</option>
        </select>
      </div>

      {/* Add New Tag */}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tag name"
          className="flex-1 px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm text-gray-900 dark:text-white"
          onKeyPress={(e) => e.key === 'Enter' && name && create.mutate(name)}
        />
        <button
          onClick={() => name && create.mutate(name)}
          className="px-3 py-2 rounded-md bg-primary-600 text-white text-sm disabled:opacity-60"
          disabled={!name || create.isLoading}
        >
          {create.isLoading ? 'Adding...' : 'Add Tag'}
        </button>
      </div>

      {/* Bulk Actions Bar */}
      {bulkMode && selectedTags.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {selectedTags.size} tag(s) selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
              >
                Select All ({filteredTags.length})
              </button>
              <button
                onClick={clearSelection}
                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Clear
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleteMutation.isLoading}
                className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800 disabled:opacity-50"
              >
                {deleteMutation.isLoading ? 'Deleting...' : '🗑️ Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tags List */}
      {isLoading ? (
        <div className="text-gray-500 dark:text-gray-400">Loading tags...</div>
      ) : filteredTags.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400">
          {searchTerm ? `No tags found for "${searchTerm}"` : 'No tags found.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          {filteredTags.map((tag) => (
            <div
              key={tag.id}
              className={`p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors ${
                bulkMode && selectedTags.has(tag.id) 
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={bulkMode ? () => toggleTagSelection(tag.id) : undefined}
              style={{ cursor: bulkMode ? 'pointer' : 'default' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Selection checkbox */}
                  {bulkMode && (
                    <input
                      type="checkbox"
                      checked={selectedTags.has(tag.id)}
                      onChange={() => toggleTagSelection(tag.id)}
                      className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  
                  {/* Tag color indicator */}
                  <div
                    className="w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 shadow-sm"
                    style={{ backgroundColor: tag.color }}
                  ></div>
                  
                  {/* Tag name (editable or display) */}
                  <div className="flex-1">
                    {editingTag?.id === tag.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editingTag.name}
                          onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleSaveRename()
                            if (e.key === 'Escape') handleCancelRename()
                          }}
                          autoFocus
                        />
                        <button
                          onClick={handleSaveRename}
                          disabled={updateMutation.isLoading}
                          className="text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800 rounded disabled:opacity-50"
                        >
                          ✓
                        </button>
                        <button
                          onClick={handleCancelRename}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        {bulkMode ? (
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {tag.name}
                          </div>
                        ) : (
                          <Link
                            to={`/browse?tags=${encodeURIComponent(tag.name)}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            title={`View images tagged: ${tag.name}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {tag.name}
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Usage count */}
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {tag.image_count} image{tag.image_count !== 1 ? 's' : ''}
                  </div>
                  
                  {/* Actions (only show when not in bulk mode or editing) */}
                  {!bulkMode && editingTag?.id !== tag.id && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRename(tag)}
                        className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900 rounded transition-colors"
                        title="Rename tag"
                      >
                        ✏️ Rename
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete tag "${tag.name}"?\n\nThis will remove it from ${tag.image_count} image(s).`)) {
                            deleteMutation.mutate([tag.id])
                          }
                        }}
                        disabled={deleteMutation.isLoading}
                        className="text-xs px-2 py-1 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900 rounded transition-colors disabled:opacity-50"
                        title="Delete tag"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
