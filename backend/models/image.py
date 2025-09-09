import os
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, Table, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

# Association table for many-to-many relationship between images and tags
image_tags = Table(
    'image_tags',
    Base.metadata,
    Column('image_id', Integer, ForeignKey('images.id'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id'), primary_key=True)
)

# Association table for many-to-many relationship between images and categories
image_categories = Table(
    'image_categories', 
    Base.metadata,
    Column('image_id', Integer, ForeignKey('images.id'), primary_key=True),
    Column('category_id', Integer, ForeignKey('categories.id'), primary_key=True)
)

class Image(Base):
    __tablename__ = "images"
    
    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, unique=True, index=True, nullable=False)
    local_path = Column(String, index=True)  # Path to local media copy
    filename = Column(String, index=True, nullable=False)
    file_size = Column(Integer)
    width = Column(Integer, index=True)
    height = Column(Integer, index=True)
    aspect_ratio = Column(Float)
    format = Column(String)
    
    # AI metadata
    prompt = Column(Text)
    negative_prompt = Column(Text)
    model_name = Column(String, index=True)
    model_hash = Column(String, index=True)
    seed = Column(String)
    steps = Column(Integer)
    cfg_scale = Column(Float)
    sampler = Column(String)
    
    # Organization
    favorite = Column(Boolean, default=False, index=True)
    rating = Column(Integer, default=0, index=True)  # 0 = unrated, 1-5 stars
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now(), index=True)
    modified_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), index=True)
    indexed_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    tags = relationship("Tag", secondary=image_tags, back_populates="images")
    categories = relationship("Category", secondary=image_categories, back_populates="images")
    
    @property
    def thumbnail_path(self):
        # Check if we should serve originals directly
        serve_originals = os.getenv('SERVE_ORIGINALS_AS_THUMBNAILS', 'false').lower() == 'true'
        if serve_originals:
            # Serve the original via the correct images file endpoint
            return f"/api/images/file/{self.id}"
        return f"/thumbnails/{self.id}.jpg"
    
    @property
    def thumbnail_paths(self):
        """Get all available thumbnail paths"""
        # Check if we should serve originals directly
        serve_originals = os.getenv('SERVE_ORIGINALS_AS_THUMBNAILS', 'false').lower() == 'true'
        if serve_originals:
            # For GIF files, serve the original. For others, serve via image-file endpoint
            return {'1x': f"/api/images/file/{self.id}"}
        
        try:
            from backend.services.enhanced_thumbnail_generator import EnhancedThumbnailGenerator
            generator = EnhancedThumbnailGenerator()
            paths = generator.get_thumbnail_paths(self.id)
            if paths:
                return paths
        except Exception as e:
            print(f"DEBUG: EnhancedThumbnailGenerator error for image {self.id}: {e}")
        
        # Fallback to standard thumbnail - check if it exists
        thumbnails_dir = os.getenv("THUMBNAILS_DIR", "/thumbnails")
        standard_path = os.path.join(thumbnails_dir, f"{self.id}.jpg")
        
        if os.path.exists(standard_path):
            return {'1x': f"/thumbnails/{self.id}.jpg"}
        else:
            print(f"DEBUG: Standard thumbnail missing for image {self.id}: {standard_path}")
            return {}
    
    @property
    def animated_preview_paths(self):
        """Get animated preview paths if available"""
        try:
            from backend.services.enhanced_thumbnail_generator import EnhancedThumbnailGenerator
            generator = EnhancedThumbnailGenerator()
            paths = generator.get_animated_preview_paths(self.id)
            if paths:
                return paths
        except Exception as e:
            print(f"DEBUG: EnhancedThumbnailGenerator animated preview error for image {self.id}: {e}")
        
        return {}
    
    @property
    def is_animated(self):
        """Check if this image is animated based on file extension"""
        if not self.filename:
            return False
        ext = os.path.splitext(self.filename)[1].lower()
        return ext == '.gif'
    
    def to_dict(self):
        # Get thumbnail paths with fallback
        try:
            thumbnail_paths = self.thumbnail_paths
        except Exception as e:
            print(f"Error getting thumbnail_paths for image {self.id}: {e}")
            thumbnail_paths = {"1x": self.thumbnail_path}
        
        # Get animated preview paths with fallback  
        try:
            animated_preview_paths = self.animated_preview_paths
        except Exception as e:
            print(f"Error getting animated_preview_paths for image {self.id}: {e}")
            animated_preview_paths = {}
        
        return {
            "id": self.id,
            "path": self.path,
            "filename": self.filename,
            "file_size": self.file_size,
            "width": self.width,
            "height": self.height,
            "aspect_ratio": self.aspect_ratio,
            "format": self.format,
            "prompt": self.prompt,
            "negative_prompt": self.negative_prompt,
            "model_name": self.model_name,
            "model_hash": self.model_hash,
            "seed": self.seed,
            "steps": self.steps,
            "cfg_scale": self.cfg_scale,
            "sampler": self.sampler,
            "favorite": self.favorite,
            "rating": self.rating,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "modified_at": self.modified_at.isoformat() if self.modified_at else None,
            "indexed_at": self.indexed_at.isoformat() if self.indexed_at else None,
            "thumbnail_path": self.thumbnail_path,
            "thumbnail_paths": thumbnail_paths,
            "animated_preview_paths": animated_preview_paths,
            "is_animated": self.is_animated,
            "tags": [tag.name for tag in self.tags],
            "categories": [cat.name for cat in self.categories]
        }
