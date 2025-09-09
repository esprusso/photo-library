from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
from .image import image_categories

class Category(Base):
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text)
    color = Column(String, default="#10B981")  # Deprecated; kept for backward compatibility
    created_at = Column(DateTime, server_default=func.now())
    # Optional cover image to visually represent the category
    cover_image_id = Column(Integer, ForeignKey('images.id'), nullable=True)
    cover_image = relationship("Image", uselist=False)
    # Distinguish between normal image categories vs clip (video) categories
    media_type = Column(String, default="image", index=True)  # 'image' or 'video'
    
    # Relationships
    images = relationship("Image", secondary=image_categories, back_populates="categories")
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "color": self.color,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "image_count": len(self.images),
            "cover_image_id": self.cover_image_id,
            "cover_image_url": f"/api/images/file/{self.cover_image_id}" if self.cover_image_id else None,
            "media_type": self.media_type,
        }
