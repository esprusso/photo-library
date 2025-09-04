from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON
from sqlalchemy.sql import func
from .database import Base

class Job(Base):
    __tablename__ = "jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, index=True, nullable=False)  # 'indexing', 'tagging', 'thumbnailing'
    status = Column(String, index=True, default='pending')  # 'pending', 'running', 'completed', 'failed'
    progress = Column(Integer, default=0)  # 0-100
    total_items = Column(Integer, default=0)
    processed_items = Column(Integer, default=0)
    
    # Job details
    parameters = Column(JSON)  # Job-specific parameters
    result = Column(JSON)  # Job results/output
    error_message = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    
    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "progress": self.progress,
            "total_items": self.total_items,
            "processed_items": self.processed_items,
            "parameters": self.parameters,
            "result": self.result,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None
        }