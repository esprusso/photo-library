from sqlalchemy import Column, Integer, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from .database import Base


class DuplicateIgnore(Base):
    __tablename__ = "duplicate_ignores"

    id = Column(Integer, primary_key=True, index=True)
    image_id_a = Column(Integer, index=True, nullable=False)
    image_id_b = Column(Integer, index=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('image_id_a', 'image_id_b', name='uq_duplicate_ignore_pair'),
    )
