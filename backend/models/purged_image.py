from sqlalchemy import Column, Integer, String, DateTime, func
from backend.models.database import Base


class PurgedImage(Base):
    """Blacklist of purged images to prevent re-importing"""
    __tablename__ = 'purged_images'
    
    id = Column(Integer, primary_key=True, index=True)
    
    # File metadata fingerprint
    filename = Column(String, index=True)
    file_size = Column(Integer, index=True)
    file_hash = Column(String(128), index=True)
    width = Column(Integer)
    height = Column(Integer)
    
    # Original path for reference
    original_path = Column(String)
    
    # When it was purged and why
    purged_at = Column(DateTime, server_default=func.now())
    purge_reason = Column(String, default="1-star rating")
    
    def matches_file(
        self,
        filename: str,
        file_size: int,
        width: int = None,
        height: int = None,
        file_hash: str = None,
    ) -> bool:
        """Check if this blacklist entry matches the given file metadata"""
        if self.file_hash and file_hash:
            return self.file_hash == file_hash
        # Must match filename and file size
        if self.filename != filename or self.file_size != file_size:
            return False
        
        # If we have dimensions, they must match too (more precise fingerprint)
        if width is not None and height is not None:
            return self.width == width and self.height == height
        
        # If no dimensions provided, filename + size match is sufficient
        return True
    
    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_size": self.file_size,
            "file_hash": self.file_hash,
            "width": self.width,
            "height": self.height,
            "original_path": self.original_path,
            "purged_at": self.purged_at.isoformat() if self.purged_at else None,
            "purge_reason": self.purge_reason,
        }
