import sys
sys.path.append('/app')
sys.path.append('.')

from backend.models import SessionLocal, Image

session = SessionLocal()

# Get first few images to test
images = session.query(Image).limit(5).all()

print("Sample images in database:")
for img in images:
    print(f"ID: {img.id}")
    print(f"Filename: {img.filename}")
    print(f"Prompt: {img.prompt[:100] if img.prompt else 'None'}...")
    print(f"Model: {img.model_name or 'None'}")
    print(f"Dimensions: {img.width}x{img.height}")
    print("---")

session.close()