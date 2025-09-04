import axios from 'axios'
import { Image, Tag, Category, Job, ImageFilters, SortOptions, LibraryStats } from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export const imageApi = {
  // Get images with filtering and pagination
  getImages: async (
    page: number = 1,
    pageSize: number = 50,
    filters: ImageFilters = {},
    sort: SortOptions = { sort_by: 'created_at', sort_order: 'desc' }
  ): Promise<Image[]> => {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
      sort_by: sort.sort_by,
      sort_order: sort.sort_order,
    })

    // Add filters
    if (filters.query) params.append('query', filters.query)
    if (filters.tags?.length) params.append('tags', filters.tags.join(','))
    if (filters.categories?.length) params.append('categories', filters.categories.join(','))
    if (filters.favorite !== undefined) params.append('favorite', filters.favorite.toString())
    if (filters.rating !== undefined) params.append('rating', filters.rating.toString())
    if (filters.model_name) params.append('model_name', filters.model_name)

    const { data } = await api.get(`/images/?${params}`)
    return data
  },
  // Delete image (optionally original)
  deleteImage: async (id: number, deleteOriginal: boolean = false): Promise<{ message: string }> => {
    const { data } = await api.delete(`/images/${id}?delete_original=${deleteOriginal}`)
    return data
  },
  // Get a random image
  getRandom: async (): Promise<Image> => {
    const { data } = await api.get('/images/random')
    return data
  },

  // Get single image
  getImage: async (id: number): Promise<Image> => {
    const { data } = await api.get(`/images/${id}`)
    return data
  },

  // Toggle favorite
  toggleFavorite: async (id: number): Promise<{ id: number; favorite: boolean }> => {
    const { data } = await api.post(`/images/${id}/favorite`)
    return data
  },

  // Set rating
  setRating: async (id: number, rating: number): Promise<{ id: number; rating: number }> => {
    const { data } = await api.post(`/images/${id}/rating?rating=${rating}`)
    return data
  },

  // Add tags to image
  addTags: async (id: number, tagNames: string[]): Promise<{ message: string }> => {
    const { data } = await api.post(`/images/${id}/tags`, tagNames)
    return data
  },

  // Remove tags from image
  removeTags: async (id: number, tagNames: string[]): Promise<{ message: string }> => {
    const { data } = await api.delete(`/images/${id}/tags`, { data: tagNames })
    return data
  },

  // Download images
  downloadImages: async (imageIds: number[]): Promise<{ download_url: string }> => {
    const { data } = await api.post('/images/download', imageIds)
    return data
  },

  // Get search suggestions
  getSearchSuggestions: async (query: string, limit: number = 10): Promise<Array<{
    type: string
    value: string
    label: string
  }>> => {
    const { data } = await api.get(`/images/search/suggestions?query=${encodeURIComponent(query)}&limit=${limit}`)
    return data
  }
}

export const tagApi = {
  // Get all tags
  getTags: async (search?: string, sortBy: string = 'name'): Promise<Tag[]> => {
    const params = new URLSearchParams({ sort_by: sortBy })
    if (search) params.append('search', search)
    
    const { data } = await api.get(`/tags/?${params}`)
    return data
  },

  // Create tag
  createTag: async (name: string, color?: string): Promise<Tag> => {
    const { data } = await api.post('/tags/', { name, color })
    return data
  },

  // Update tag
  updateTag: async (id: number, updates: { name?: string; color?: string }): Promise<Tag> => {
    const { data } = await api.put(`/tags/${id}`, updates)
    return data
  },

  // Delete tag
  deleteTag: async (id: number): Promise<{ message: string }> => {
    const { data } = await api.delete(`/tags/${id}`)
    return data
  },
  
  // AI Auto-tagging methods
  autoTagSingle: async (imageId: number): Promise<{ message: string; tags: string[]; all_suggested_tags: string[] }> => {
    const { data } = await api.post('/tags/auto-tag-single', { image_id: imageId })
    return data
  },
  
  autoTagBatch: async (imageIds: number[]): Promise<{ message: string; image_count: number; status: string }> => {
    const { data } = await api.post('/tags/auto-tag-batch', { image_ids: imageIds })
    return data
  },
  
  autoTagAllUntagged: async (): Promise<{ message: string; image_count: number; status: string }> => {
    const { data } = await api.post('/tags/auto-tag-all-untagged')
    return data
  },

  // Bulk create tags
  bulkCreateTags: async (tagNames: string[]): Promise<{ message: string; created: number }> => {
    const { data } = await api.post('/tags/bulk-create', tagNames)
    return data
  }
}

export const categoryApi = {
  // Get all categories
  getCategories: async (search?: string, sortBy: string = 'name'): Promise<Category[]> => {
    const params = new URLSearchParams({ sort_by: sortBy })
    if (search) params.append('search', search)
    
    const { data } = await api.get(`/categories/?${params}`)
    return data
  },

  // Create category
  createCategory: async (name: string, description?: string, color?: string): Promise<Category> => {
    const { data } = await api.post('/categories/', { name, description, color })
    return data
  },

  // Update category
  updateCategory: async (id: number, updates: { name?: string; description?: string; color?: string }): Promise<Category> => {
    const { data } = await api.put(`/categories/${id}`, updates)
    return data
  },

  // Delete category
  deleteCategory: async (id: number): Promise<{ message: string }> => {
    const { data } = await api.delete(`/categories/${id}`)
    return data
  },
  // Bulk delete categories
  bulkDeleteCategories: async (categoryIds: number[]): Promise<{ message: string }> => {
    const { data } = await api.post('/categories/bulk-delete', { 
      category_ids: categoryIds 
    })
    return data
  },

  // Add images to category
  addImagesToCategory: async (categoryId: number, imageIds: number[]): Promise<{ message: string }> => {
    const { data } = await api.post(`/categories/${categoryId}/images`, imageIds)
    return data
  },

  // Remove images from category
  removeImagesFromCategory: async (categoryId: number, imageIds: number[]): Promise<{ message: string }> => {
    const { data } = await api.delete(`/categories/${categoryId}/images`, { data: imageIds })
    return data
  },

  // Auto-categorize based on folder structure
  autoCategorizeByFolders: async (): Promise<{ message: string }> => {
    const { data } = await api.post('/categories/auto-categorize-folders')
    return data
  }
}

export const jobApi = {
  // Get jobs
  getJobs: async (type?: string, status?: string, limit: number = 50): Promise<Job[]> => {
    const params = new URLSearchParams({ limit: limit.toString() })
    if (type) params.append('job_type', type)
    if (status) params.append('status', status)
    
    const { data } = await api.get(`/jobs/?${params}`)
    return data
  },

  // Get single job
  getJob: async (id: number): Promise<Job> => {
    const { data } = await api.get(`/jobs/${id}`)
    return data
  },

  // Start indexing job
  startIndexing: async (): Promise<{ message: string; job_id: number }> => {
    const { data } = await api.post('/jobs/indexing')
    return data
  },

  // Start thumbnail job
  startThumbnails: async (forceRegenerate: boolean = false): Promise<{ message: string; job_id: number }> => {
    const { data } = await api.post('/jobs/thumbnails', { force_regenerate: forceRegenerate })
    return data
  },

  // Start tagging job
  startTagging: async (imageIds?: number[]): Promise<{ message: string; job_id: number }> => {
    const { data } = await api.post('/jobs/tagging', { image_ids: imageIds })
    return data
  },

  // Cancel job
  cancelJob: async (id: number): Promise<{ message: string }> => {
    const { data } = await api.delete(`/jobs/${id}`)
    return data
  }
}

export const libraryApi = {
  // Get library stats
  getStats: async (): Promise<LibraryStats> => {
    const { data } = await api.get('/stats')
    return data
  },

  // Trigger library scan
  scanLibrary: async (): Promise<{ message: string }> => {
    const { data } = await api.post('/scan')
    return data
  },

  // Get health status
  getHealth: async (): Promise<{ status: string }> => {
    const { data } = await api.get('/health')
    return data
  }
}

export default api
