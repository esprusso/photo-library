#!/bin/bash
echo "Creating fallback build..."

# Create dist directory
mkdir -p dist

# Copy public files
cp -r public/* dist/ 2>/dev/null || true

# Create a basic index.html that loads the app
cat > dist/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Photo Library</title>
    <script type="module" crossorigin src="/assets/index.js"></script>
    <link rel="stylesheet" href="/assets/index.css">
  </head>
  <body>
    <div id="root"></div>
    <noscript>You need to enable JavaScript to run this app.</noscript>
  </body>
</html>
EOF

# Create basic CSS
mkdir -p dist/assets
cat > dist/assets/index.css << 'EOF'
/* Basic Tailwind-like styles */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; }
.container { max-width: 1200px; margin: 0 auto; padding: 1rem; }
.text-center { text-align: center; }
.text-white { color: white; }
.bg-gray-900 { background-color: #111827; }
.p-4 { padding: 1rem; }
.rounded { border-radius: 0.375rem; }
EOF

# Create a basic JavaScript loader
cat > dist/assets/index.js << 'EOF'
// Basic app loader - this would normally be the compiled React app
console.log('Photo Library loading...');
document.getElementById('root').innerHTML = `
  <div class="container text-center p-4">
    <h1>Photo Library</h1>
    <p>Build system encountered issues. Please check the backend is running at /api/</p>
    <p>Frontend build needs to be completed manually.</p>
  </div>
`;
EOF

echo "Fallback build complete"