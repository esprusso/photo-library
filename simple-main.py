from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime
import os
import time

DATABASE_URL = os.getenv('DB_URL', 'sqlite:///./app.db')
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Image(Base):
    __tablename__ = 'images'
    
    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, unique=True, index=True, nullable=False)
    filename = Column(String, index=True, nullable=False)
    file_size = Column(Integer)
    width = Column(Integer)
    height = Column(Integer)
    prompt = Column(Text)
    model_name = Column(String)
    created_at = Column(DateTime, server_default=func.now())
    
    def to_dict(self):
        return {
            'id': self.id,
            'path': self.path,
            'filename': self.filename,
            'file_size': self.file_size,
            'width': self.width,
            'height': self.height,
            'prompt': self.prompt,
            'model_name': self.model_name,
            'thumbnail_path': f'/thumbnails/{self.id}.jpg' if self.id else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

print('Waiting for database...')
max_retries = 30
for i in range(max_retries):
    try:
        Base.metadata.create_all(bind=engine)
        print('Database tables created!')
        break
    except Exception as e:
        print(f'Database attempt {i+1}/{max_retries}: {e}')
        if i == max_retries - 1:
            raise
        time.sleep(2)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app = FastAPI(title='AI Image Library API', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

@app.get('/')
def root():
    return {
        'message': 'AI Image Library API',
        'version': '1.0.0',
        'status': 'online'
    }

@app.get('/health')
def health():
    return {'status': 'healthy'}

@app.get('/stats')
def get_stats(db: Session = Depends(get_db)):
    try:
        total_images = db.query(Image).count()
        return {
            'total_images': total_images,
            'total_tags': 0,
            'total_categories': 0,
            'favorites': 0
        }
    except Exception as e:
        print(f'Stats error: {e}')
        return {
            'error': str(e),
            'total_images': 0,
            'total_tags': 0,
            'total_categories': 0,
            'favorites': 0
        }

@app.get('/images')
def get_images(page_size: int = 12, db: Session = Depends(get_db)):
    try:
        images = db.query(Image).limit(page_size).all()
        return [img.to_dict() for img in images]
    except Exception as e:
        print(f'Images error: {e}')
        return []

@app.post('/scan')
def scan_library(db: Session = Depends(get_db)):
    try:
        library_path = os.getenv('LIBRARY_PATHS', '/library')
        if not os.path.exists(library_path):
            return {'error': f'Library path {library_path} does not exist'}
        
        file_count = 0
        processed = 0
        added = 0
        errors = 0
        
        print('Starting library scan...')
        
        for root, dirs, files in os.walk(library_path):
            for file in files:
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    file_count += 1
                    file_path = os.path.join(root, file)
                    
                    try:
                        # Check if already exists
                        existing = db.query(Image).filter(Image.path == file_path).first()
                        if existing:
                            continue
                            
                        # Get basic file info
                        stat_info = os.stat(file_path)
                        file_size = stat_info.st_size
                        
                        # Try to get image dimensions and metadata
                        width, height = None, None
                        prompt = None
                        model_name = None
                        
                        try:
                            from PIL import Image as PILImage
                            with PILImage.open(file_path) as img:
                                width, height = img.size
                                
                                # Extract PNG text chunks for AI metadata
                                if img.format == 'PNG' and hasattr(img, 'text'):
                                    for key, value in img.text.items():
                                        if key.lower() in ['parameters', 'prompt']:
                                            # Try to extract prompt from Stable Diffusion parameters
                                            if 'Negative prompt:' in value:
                                                prompt_part = value.split('Negative prompt:')[0].strip()
                                                if prompt_part:
                                                    prompt = prompt_part[:500]  # Limit length
                                            elif len(value) > 10:
                                                prompt = value[:500]  # Limit length
                                            
                                            # Try to extract model name
                                            if 'Model:' in value:
                                                import re
                                                model_match = re.search(r'Model:\s*([^,\n]+)', value)
                                                if model_match:
                                                    model_name = model_match.group(1).strip()
                                            break
                        except:
                            pass  # Skip if can't open image or extract metadata
                        
                        # Create image record
                        image = Image(
                            path=file_path,
                            filename=file,
                            file_size=file_size,
                            width=width,
                            height=height,
                            prompt=prompt,
                            model_name=model_name
                        )
                        
                        db.add(image)
                        db.commit()
                        added += 1
                        processed += 1
                        
                        if processed % 100 == 0:
                            print(f'Processed {processed} images...')
                        
                    except Exception as e:
                        print(f'Error processing {file}: {e}')
                        errors += 1
                        continue
        
        print(f'Scan completed: {processed} processed, {added} added, {errors} errors')
        
        return {
            'message': f'Scan completed: {processed} processed, {added} added to database',
            'files_found': file_count,
            'processed': processed,
            'added': added,
            'errors': errors
        }
    except Exception as e:
        print(f'Scan error: {e}')
        return {'error': str(e)}

@app.post('/clear-database')
def clear_database(db: Session = Depends(get_db)):
    try:
        # Delete all images
        deleted = db.query(Image).count()
        db.query(Image).delete()
        db.commit()
        
        return {
            'message': f'Database cleared: {deleted} images removed',
            'deleted': deleted
        }
    except Exception as e:
        print(f'Clear database error: {e}')
        return {'error': str(e)}

if __name__ == '__main__':
    import uvicorn
    print('Starting FastAPI server...')
    uvicorn.run(app, host='0.0.0.0', port=8000, log_level='info')