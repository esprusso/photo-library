export interface Image {
  id: number
  path: string
  filename: string
  file_size?: number
  width?: number
  height?: number
  aspect_ratio?: number
  format?: string
  // Enriched fields for responsive rendering
  thumbnail_paths?: Record<string, string>
  animated_preview_paths?: Record<string, any>
  is_animated?: boolean
  camera_make?: string
  camera_model?: string
  lens_model?: string
  focal_length?: number
  aperture?: number
  shutter_speed?: string
  iso?: number
  flash_used?: boolean
  date_taken?: string
  favorite: boolean
  rating: number
  created_at?: string
  modified_at?: string
  indexed_at?: string
  thumbnail_path: string
  tags: string[]
  categories: string[]
}

export interface Tag {
  id: number
  name: string
  color: string
  created_at?: string
  image_count: number
}

export interface Category {
  id: number
  name: string
  description?: string
  color: string
  featured: boolean  // Always false until database migration
  featured_image_id?: number | null
  featured_image_thumbnail_path?: string | null
  featured_image_position?: string | null
  created_at?: string
  image_count: number
}

export interface Job {
  id: number
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  total_items: number
  processed_items: number
  parameters?: Record<string, any>
  result?: Record<string, any>
  error_message?: string
  created_at?: string
  started_at?: string
  completed_at?: string
}

export interface ImageFilters {
  query?: string
  tags?: string[]
  categories?: string[]
  favorite?: boolean
  rating?: number
  camera_make?: string
  camera_model?: string
  min_width?: number
  max_width?: number
  min_height?: number
  max_height?: number
  date_from?: string
  date_to?: string
  // New optional filters
  file_format?: string
  media?: 'gif' | 'video' | 'image'
  exclude_jpg?: boolean
  exclude_static?: boolean
}

export interface SortOptions {
  sort_by: 'created_at' | 'filename' | 'width' | 'height' | 'random'
  sort_order: 'asc' | 'desc'
}

export interface LibraryStats {
  total_images: number
  total_tags: number
  total_categories: number
  favorites: number
}
