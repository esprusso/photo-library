import sys
sys.path.append('/app')
sys.path.append('.')

import requests
from backend.models import SessionLocal, Image

session = SessionLocal()

# Get a sample image
image = session.query(Image).first()
if image:
    print(f"Testing with Image ID: {image.id}")
    print(f"Filename: {image.filename}")
    print(f"Path: {image.path}")
    print()
    
    # Test different URL patterns
    test_urls = [
        f"http://localhost:8000/api/image/{image.id}",
        f"http://localhost:8000/image/{image.id}",
        f"http://localhost:8000/{image.id}.jpg",
        f"http://localhost:8000/thumbnails/{image.id}.jpg"
    ]
    
    for url in test_urls:
        try:
            response = requests.head(url, timeout=5)
            print(f"URL: {url}")
            print(f"Status: {response.status_code}")
            print(f"Content-Type: {response.headers.get('content-type', 'N/A')}")
            print(f"Content-Length: {response.headers.get('content-length', 'N/A')}")
            print("---")
        except Exception as e:
            print(f"URL: {url}")
            print(f"Error: {e}")
            print("---")
else:
    print("No images found in database")

session.close()