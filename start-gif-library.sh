#!/bin/bash

echo "🎬 Starting GIF Library"
echo "======================"
echo

# Stop and remove any existing photo-library containers
echo "🛑 Stopping existing photo-library containers..."
docker stop photo-library-db photo-library-backend photo-library-frontend 2>/dev/null || true
docker rm photo-library-db photo-library-backend photo-library-frontend 2>/dev/null || true

# Stop any existing gif-library containers
echo "🛑 Stopping existing gif-library containers..."
docker-compose down 2>/dev/null || true

echo

# Build and start the gif-library
echo "🚀 Building and starting GIF Library..."
docker-compose up --build -d

echo

# Wait a moment for containers to start
sleep 5

# Check status
echo "📊 Container Status:"
docker-compose ps

echo
echo "✅ GIF Library started!"
echo
echo "🌐 Access URLs:"
echo "   Frontend: http://localhost:8087"
echo "   API:      http://localhost:8087/api"
echo "   API Docs: http://localhost:8087/api/docs"
echo
echo "📁 Next steps:"
echo "   1. Scan your library: Visit http://localhost:8087 and click 'Scan Library'"
echo "   2. Generate enhanced thumbnails: docker-compose exec backend python /app/generate_enhanced_thumbnails.py"
echo "   3. Enjoy your animated GIF viewer!"
