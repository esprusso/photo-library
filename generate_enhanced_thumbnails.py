#!/usr/bin/env python3
"""
Enhanced Thumbnail Generation Script

This script generates high-resolution thumbnails (2x/3x DPR) and animated previews
for the GIF Library. It uses the EnhancedThumbnailGenerator to create:

1. Standard thumbnails at base resolution
2. High-DPI thumbnails at 2x and optionally 3x resolution
3. Animated previews (MP4/WebM/GIF) for animated images

Usage:
    python generate_enhanced_thumbnails.py [--force] [--format auto|mp4|webm|gif]
    
Options:
    --force     Regenerate all thumbnails even if they exist
    --format    Set animated preview format (auto, mp4, webm, gif)
    --scale     Set thumbnail scale factor (2 or 3, default: 2)
    --help      Show this help message
"""

import os
import sys
import argparse
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent / 'backend'
sys.path.insert(0, str(backend_dir))

from backend.models.database import SessionLocal
from backend.services.enhanced_thumbnail_generator import EnhancedThumbnailGenerator
from backend.models.job import Job


def main():
    parser = argparse.ArgumentParser(description='Generate enhanced thumbnails and animated previews')
    parser.add_argument('--force', action='store_true', 
                       help='Regenerate all thumbnails even if they exist')
    parser.add_argument('--format', choices=['auto', 'mp4', 'webm', 'gif'], 
                       default='auto', help='Animated preview format')
    parser.add_argument('--scale', type=int, choices=[2, 3], default=2,
                       help='Thumbnail scale factor')
    parser.add_argument('--enable-3x', action='store_true',
                       help='Enable 3x DPR thumbnails')
    
    args = parser.parse_args()
    
    # Set environment variables from command line args
    os.environ['THUMBNAIL_SCALE'] = str(args.scale)
    os.environ['ANIMATED_PREVIEW_FORMAT'] = args.format
    if args.enable_3x:
        os.environ['ENABLE_3X_DPR'] = 'true'
    
    print("🖼️  Enhanced Thumbnail Generator")
    print("=" * 50)
    print(f"Thumbnail scale: {args.scale}x")
    print(f"3x DPR enabled: {args.enable_3x}")
    print(f"Preview format: {args.format}")
    print(f"Force regenerate: {args.force}")
    print()
    
    # Initialize generator and database
    generator = EnhancedThumbnailGenerator()
    db = SessionLocal()
    
    try:
        # Create a job for tracking progress
        job = Job(
            type='enhanced_thumbnailing',
            status='pending',
            parameters={
                'scale': args.scale,
                'format': args.format,
                'force_regenerate': args.force,
                'enable_3x': args.enable_3x
            }
        )
        db.add(job)
        db.commit()
        
        print(f"📊 Starting enhanced thumbnail generation (Job ID: {job.id})")
        print()
        
        # Generate thumbnails
        generator.generate_thumbnails(db, job.id, args.force)
        
        # Get final job status
        db.refresh(job)
        
        print()
        print("✅ Enhanced thumbnail generation completed!")
        print(f"📈 Results: {job.result}")
        
        # Show configuration summary
        print()
        print("📁 Generated file types:")
        print(f"   • Standard thumbnails (1x): {generator.sizes['1x']}px")
        print(f"   • High-DPI thumbnails (2x): {generator.sizes['2x']}px")
        if generator.enable_3x_dpr:
            print(f"   • Ultra-high-DPI thumbnails (3x): {generator.sizes['3x']}px")
        print(f"   • Animated previews: {args.format}")
        
        # Show directory structure
        print()
        print("📂 Directory structure:")
        print(f"   {generator.thumbnail_dir}/")
        print(f"   ├── [id].jpg          # Standard thumbnails")
        print(f"   ├── [id]@2x.jpg       # 2x DPI thumbnails")
        if generator.enable_3x_dpr:
            print(f"   ├── [id]@3x.jpg       # 3x DPI thumbnails")
        print(f"   └── previews/")
        print(f"       ├── [id].mp4      # MP4 previews")
        print(f"       ├── [id].webm     # WebM previews")
        print(f"       └── [id].gif      # GIF previews")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        if 'job' in locals():
            job.status = 'failed'
            job.error_message = str(e)
            db.commit()
        sys.exit(1)
    
    finally:
        db.close()


if __name__ == '__main__':
    main()