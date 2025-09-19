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
    width = Column(Integer)
    height = Column(Integer)
    aspect_ratio = Column(Float)
    format = Column(String)
    
    # Photo metadata
    camera_make = Column(String, index=True)
    camera_model = Column(String, index=True)
    lens_model = Column(String)
    focal_length = Column(Float)
    aperture = Column(Float)
    shutter_speed = Column(String)
    iso = Column(Integer)
    flash_used = Column(Boolean)
    date_taken = Column(DateTime)
    
    # Organization
    favorite = Column(Boolean, default=False, index=True)
    rating = Column(Integer, default=0, index=True)  # 0 = unrated, 1-5 stars
    # Perceptual hash (hex); optional, for duplicate detection
    phash = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    modified_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    indexed_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    tags = relationship("Tag", secondary=image_tags, back_populates="images")
    categories = relationship("Category", secondary=image_categories, back_populates="images")
    
    @property
    def thumbnail_path(self):
        return f"/thumbnails/{self.id}.jpg"
    
    def to_dict(self):
        return {
            "id": self.id,
            "path": self.path,
            "filename": self.filename,
            "file_size": self.file_size,
            "width": self.width,
            "height": self.height,
            "aspect_ratio": self.aspect_ratio,
            "format": self.format,
            "camera_make": self.camera_make,
            "camera_model": self.camera_model,
            "lens_model": self.lens_model,
            "focal_length": self.focal_length,
            "aperture": self.aperture,
            "shutter_speed": self.shutter_speed,
            "iso": self.iso,
            "flash_used": self.flash_used,
            "date_taken": self.date_taken.isoformat() if self.date_taken else None,
            "favorite": self.favorite,
            "rating": self.rating,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "modified_at": self.modified_at.isoformat() if self.modified_at else None,
            "indexed_at": self.indexed_at.isoformat() if self.indexed_at else None,
            "thumbnail_path": self.thumbnail_path,
            "tags": [tag.name for tag in self.tags],
            "categories": [cat.name for cat in self.categories],
            # AI-specific fields (for backwards compatibility with original AI image app)
            "prompt": getattr(self, 'prompt', None),
            "negative_prompt": getattr(self, 'negative_prompt', None),
            "model_name": getattr(self, 'model_name', None),
            "model_hash": getattr(self, 'model_hash', None),
            "seed": getattr(self, 'seed', None),
            "steps": getattr(self, 'steps', None),
            "cfg_scale": getattr(self, 'cfg_scale', None),
            "sampler": getattr(self, 'sampler', None)
        }
