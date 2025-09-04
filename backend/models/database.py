from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DB_URL", "sqlite:///./app.db")

if DATABASE_URL.startswith("sqlite"):
    # Ensure SQLite directory exists (e.g., /cache)
    try:
        # Extract filesystem path after the scheme
        path_part = DATABASE_URL.split(":///")[-1]
        dir_path = os.path.dirname(path_part)
        if dir_path and not os.path.isabs(dir_path):
            # Handle relative paths by making sure directory exists relative to CWD
            os.makedirs(dir_path, exist_ok=True)
        elif dir_path:
            os.makedirs("/" + dir_path if not dir_path.startswith("/") else dir_path, exist_ok=True)
    except Exception:
        pass

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
