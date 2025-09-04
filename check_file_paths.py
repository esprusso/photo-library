import sys
import os
sys.path.append('/app')
sys.path.append('.')

from backend.models import SessionLocal, Image

session = SessionLocal()

print("=== CHECKING IMAGE FILE PATHS ===")

# Get some sample images
images = session.query(Image).limit(10).all()

print(f"Found {len(images)} images in database")
print()

for i, img in enumerate(images[:5]):
    print(f"Image {i+1}:")
    print(f"  ID: {img.id}")
    print(f"  Database path: {img.path}")
    print(f"  Filename: {img.filename}")
    print(f"  File exists: {os.path.exists(img.path) if img.path else 'No path'}")
    
    if img.path and os.path.exists(img.path):
        size = os.path.getsize(img.path)
        print(f"  File size: {size} bytes ({size/1024/1024:.1f} MB)")
    else:
        print(f"  File missing or no path!")
        
        # Check if file exists in expected mount location
        if img.path:
            # Try common mount points
            possible_paths = [
                img.path.replace('/volume1/', '/'),  # Check if mounted at root
                img.path,  # Original path
            ]
            
            for test_path in possible_paths:
                if os.path.exists(test_path):
                    print(f"  Found at alternate path: {test_path}")
                    break
            else:
                print(f"  File not found at any tested path")
    print()

# Check mount points
print("=== CHECKING MOUNT POINTS ===")
print("Contents of /:")
try:
    root_contents = os.listdir('/')
    for item in sorted(root_contents):
        if os.path.isdir(f'/{item}'):
            print(f"  /{item}/ (directory)")
        else:
            print(f"  /{item}")
except Exception as e:
    print(f"Error listing root: {e}")

print()
print("Checking /library:")
if os.path.exists('/library'):
    print("  /library exists")
    try:
        lib_contents = os.listdir('/library')
        print(f"  Contains {len(lib_contents)} items:")
        for item in sorted(lib_contents)[:10]:  # Show first 10
            print(f"    {item}")
    except Exception as e:
        print(f"  Error listing /library: {e}")
else:
    print("  /library does not exist")

session.close()