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
    if (filters.file_format) params.append('file_format', filters.file_format)
    if (filters.media) params.append('media', filters.media)
    if (filters.exclude_jpg) params.append('exclude_jpg', 'true')
    if (filters.exclude_static) params.append('exclude_static', 'true')

    const { data } = await api.get(`/images/?${params}`)
    return data
  },
  // Upload an image (used for category covers)
  uploadImage: async (file: File): Promise<Image> => {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post('/images/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return data
  },
  // Get exact duplicate groups (filename + size)
  getDuplicatesExact: async (
    media: 'gif' | 'video' | 'image' = 'image',
    groupBy: string = 'filename_size'
  ): Promise<Array<{ key: string; count: number; items: { id: number; filename: string; file_size?: number; thumbnail_path: string; width?: number; height?: number; created_at?: string }[] }>> => {
    const { data } = await api.get(`/images/duplicates-exact?media=${media}&group_by=${groupBy}`)
    return data
  },
  // Merge and delete exact duplicates for a group
  mergeExactDuplicates: async (
    keepId: number,
    removeIds: number[]
  ): Promise<{ message: string; deleted: number; failed: number[] }> => {
    const { data } = await api.post('/images/duplicates-exact/merge', { keep_id: keepId, remove_ids: removeIds })
    return data
  },
  // Delete image (optionally original + blacklist to prevent re-import)
  deleteImage: async (
    id: number,
    deleteOriginal: boolean = false,
    blacklist: boolean = true
  ): Promise<{ message: string }> => {
    const params = new URLSearchParams()
    if (deleteOriginal) params.append('delete_original', 'true')
    if (blacklist) params.append('blacklist', 'true')
    const qs = params.toString()
    const { data } = await api.delete(`/images/${id}${qs ? `?${qs}` : ''}`)
    return data
  },
  // Get a random image
  getRandom: async (): Promise<Image> => {
    const { data } = await api.get('/images/random')
    return data
  },

  // Memories: images taken on this month/day across years
  getMemories: async (month?: number, day?: number): Promise<Image[]> => {
    const params = new URLSearchParams()
    if (month) params.append('month', String(month))
    if (day) params.append('day', String(day))
    const qs = params.toString()
    const { data } = await api.get(`/images/memories${qs ? `?${qs}` : ''}`)
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
  ,
  // Compute missing perceptual hashes (background)
  computePhash: async (): Promise<{ message: string; job_id: number | null }> => {
    const { data } = await api.post('/images/compute-phash')
    return data
  },
  // Get duplicate clusters
  getDuplicates: async (threshold: number = 6, prefixBits: number = 12): Promise<Array<{ phash: string; images: Image[]; distances: number[] }>> => {
    const { data } = await api.get(`/images/duplicates?threshold=${threshold}&prefix_bits=${prefixBits}`)
    return data
  },
  // Ignore duplicate pairs
  ignoreDuplicatePairs: async (pairs: Array<[number, number]>): Promise<{ message: string }> => {
    const { data } = await api.post('/images/duplicates/ignore', { pairs })
    return data
  },
  // Merge duplicates metadata into keeper
  mergeDuplicates: async (keeperId: number, duplicateIds: number[]): Promise<{ message: string }> => {
    const { data } = await api.post('/images/merge-duplicates', { keeper_id: keeperId, duplicate_ids: duplicateIds })
    return data
  },
  // Merge and delete duplicates in one action
  mergeDeleteDuplicates: async (
    keeperId: number,
    duplicateIds: number[]
  ): Promise<{ message: string; deleted: number; failed: number[] }> => {
    const { data } = await api.post('/images/duplicates/merge-delete', { keeper_id: keeperId, duplicate_ids: duplicateIds })
    return data
  },
  // Merge and delete exactly one duplicate against a keeper
  mergeDeleteDuplicatePair: async (
    keeperId: number,
    duplicateId: number
  ): Promise<{ message: string; deleted: number; failed: number[] }> => {
    const { data } = await api.post('/images/duplicates/merge-delete-pair', { keeper_id: keeperId, duplicate_id: duplicateId })
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
  createCategory: async (name: string, description?: string, color?: string, featuredImageId?: number | null, featuredImagePosition?: string | null): Promise<Category> => {
    const { data } = await api.post('/categories/', { name, description, color, featured_image_id: featuredImageId, featured_image_position: featuredImagePosition })
    return data
  },

  // Update category
  updateCategory: async (
    id: number,
    updates: { name?: string; description?: string; color?: string; featured_image_id?: number | null; featured_image_position?: string | null }
  ): Promise<Category> => {
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
  },

  // Auto-populate featured images for categories missing one
  autoPopulateFeatured: async (): Promise<{ message: string; updated: number }> => {
    const { data } = await api.post('/categories/auto-populate-featured')
    return data
  },

  // Cleanup RAW files from database
  cleanupRawFiles: async (): Promise<{ message: string; removed_files: string; removed_count: number }> => {
    const { data } = await api.post('/categories/cleanup-raw-files')
    return data
  },

  // Cleanup categories with few images
  cleanupEmptyCategories: async (minImages: number = 1): Promise<{ message: string; deleted_categories: string; deleted_count: number }> => {
    const { data } = await api.post(`/categories/cleanup-empty?min_images=${minImages}`)
    return data
  }
  ,
  // Merge categories
  mergeCategories: async (payload: { source_ids: number[]; target_id: number; rename_target?: string; overwrite_featured?: boolean }): Promise<{ message: string }> => {
    const { data } = await api.post('/categories/merge', payload)
    return data
  },
  // Download all images in a category as ZIP
  downloadCategory: async (categoryId: number): Promise<{ download_url: string }> => {
    // Packaging large categories can take a while; extend timeout to 5 minutes
    const { data } = await api.post(`/categories/${categoryId}/download`, undefined, { timeout: 300000 })
    return data
  },
  // Start async packaging job for category download
  downloadCategoryAsync: async (categoryId: number): Promise<{ job_id: number }> => {
    const { data } = await api.post(`/categories/${categoryId}/download-async`)
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
  startThumbnails: async (forceRegenerate: boolean = false, size?: number): Promise<{ message: string; job_id: number }> => {
    const payload: any = { force_regenerate: forceRegenerate }
    if (size) payload.size = size
    const { data } = await api.post('/jobs/thumbnails', payload)
    return data
  },

  // Start tagging job
  startTagging: async (imageIds?: number[]): Promise<{ message: string; job_id: number }> => {
    const { data } = await api.post('/jobs/tagging', { image_ids: imageIds })
    return data
  },
  // Start refresh EXIF/metadata job
  startRefreshExif: async (onlyMissing: boolean = false): Promise<{ message: string; job_id: number }> => {
    const { data } = await api.post('/jobs/refresh-exif', { only_missing: onlyMissing })
    return data
  },

  // Cancel job
  cancelJob: async (id: number): Promise<{ message: string }> => {
    const { data } = await api.delete(`/jobs/${id}`)
    return data
  },
  
  // Force-kill a running job by ID
  forceKillJob: async (id: number): Promise<{ message: string; job_id: number }> => {
    const { data } = await api.post(`/jobs/${id}/force-kill`)
    return data
  },

  // Force-kill stalled jobs
  forceKillStalled: async (): Promise<{ message: string; killed_jobs: any[] }> => {
    const { data } = await api.post('/jobs/force-kill-stalled')
    return data
  }
  ,
  // Purge generated thumbnails
  purgeThumbnails: async (): Promise<{ message: string; deleted: number }> => {
    const { data } = await api.post('/jobs/purge-thumbnails')
    return data
  }
  ,
  // Thumbnails status
  getThumbnailStatus: async (): Promise<{ total_images: number; thumbnails: number; missing: number }> => {
    const { data } = await api.get('/jobs/thumbnails/status')
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
  },

  // Clean up orphaned images
  cleanupOrphaned: async (): Promise<{ message: string; job_id: number }> => {
    const { data } = await api.post('/cleanup-orphaned')
    return data
  },
  
  // Purge all 1-star images and blacklist them
  purgeOneStarImages: async (): Promise<{ message: string; purged_count: number; blacklisted_count: number }> => {
    const { data } = await api.post('/purge-one-star-images')
    return data
  }
}

export default api
