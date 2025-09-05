from sqlalchemy import Column, Integer, String, DateTime, Text
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
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    images = relationship("Image", secondary=image_categories, back_populates="categories")
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "color": self.color,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "image_count": len(self.images)
        }