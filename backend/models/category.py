from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
from .image import image_categories

class Category(Base):
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text)
    color = Column(String, default="#10B981")  # Tailwind emerald-500
    # featured = Column(Boolean, default=False, nullable=True)  # Temporarily disabled
    # Featured image support
    featured_image_id = Column(Integer, ForeignKey('images.id'), nullable=True)
    # Free-form position JSON (reserved for future controls, e.g. {"x":50,"y":40,"scale":1.1})
    featured_image_position = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    images = relationship("Image", secondary=image_categories, back_populates="categories")
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "color": self.color,
            "featured": getattr(self, 'featured', False),  # Default to False if not in DB yet
            "featured_image_id": getattr(self, 'featured_image_id', None),
            "featured_image_position": getattr(self, 'featured_image_position', None),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "image_count": len(self.images)
        }
