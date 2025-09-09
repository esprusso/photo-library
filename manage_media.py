#!/usr/bin/env python3
"""
Media Management Script for AI Image Library

This script helps manage local media copies outside the container.
"""

import os
import requests
import time
import sys


def check_api_status():
    """Check if the API is running"""
    try:
        response = requests.get(f"{API_BASE}/health")
        return response.status_code == 200
    except requests.ConnectionError:
        return False


def get_media_stats():
    """Get media management statistics"""
    try:
        response = requests.get(f"{API_BASE}/media-stats")
        if response.status_code == 200:
            return response.json()
    except requests.RequestException as e:
        print(f"Error getting media stats: {e}")
    return None


def create_media_copies():
    """Trigger creation of local media copies"""
    try:
        response = requests.post(f"{API_BASE}/create-media-copies")
        if response.status_code == 200:
            return response.json()
    except requests.RequestException as e:
        print(f"Error creating media copies: {e}")
    return None


def main():
    if len(sys.argv) > 1:
        command = sys.argv[1]
    else:
        command = "status"
    
    if not check_api_status():
        print("❌ API is not reachable.")
        print("   - If using Docker, start services: docker compose up -d")
        print("   - If running locally, set API_BASE_URL (e.g. http://localhost:8000) and retry")
        return
    
    if command == "status":
        print("📊 Getting media management status...")
        stats = get_media_stats()
        if stats:
            print(f"Total Images: {stats['total_images']}")
            print(f"With Local Copies: {stats['images_with_local_copies']}")
            print(f"Without Local Copies: {stats['images_without_local_copies']}")
            
            media_dir = stats['media_directory']
            if media_dir.get('exists'):
                print(f"\nMedia Directory: {media_dir['path']}")
                print(f"Files: {media_dir['file_count']}")
                print(f"Size: {media_dir['total_size_mb']} MB")
            else:
                print("\nMedia directory not found")
        else:
            print("Failed to get media statistics")
    
    elif command == "copy":
        print("📁 Creating local media copies...")
        result = create_media_copies()
        if result:
            print(f"✅ {result['message']}")
            print("Monitor progress in Docker logs: docker-compose logs -f backend")
        else:
            print("❌ Failed to start media copy creation")
    
    else:
        print("Usage:")
        print("  python manage_media.py status  - Show media management status")
        print("  python manage_media.py copy    - Create local copies of all images")


API_BASE = os.getenv("API_BASE_URL", "http://localhost:8087/api")
if __name__ == "__main__":
    main()
