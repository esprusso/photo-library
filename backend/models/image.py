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
            "tags": [tag.name for tag in self.tags],
            "categories": [cat.name for cat in self.categories]
        }