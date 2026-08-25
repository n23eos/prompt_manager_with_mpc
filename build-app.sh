#!/bin/bash
# Prompt Manager — build a standalone .app bundle into dist/
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js not found. Install it first:  brew install node"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies…"
  npm install
fi

echo "🔨 Building .app (this downloads Electron binaries on first run)…"
npx electron-builder --mac dir

APP=$(find dist -name "*.app" -maxdepth 3 | head -1)
if [ -n "$APP" ]; then
  echo ""
  echo "✅ Done: $APP"
  echo "   Drag it to /Applications if you like:"
  echo "   cp -r \"$APP\" /Applications/"
else
  echo "⚠️  Build finished but .app not found in dist/ — check output above."
fi
