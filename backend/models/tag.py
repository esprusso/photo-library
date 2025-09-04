from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
from .image import image_tags

class Tag(Base):
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    color = Column(String, default="#3B82F6")  # Tailwind blue-500
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    images = relationship("Image", secondary=image_tags, back_populates="tags")
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "image_count": len(self.images)
        }