#!/bin/bash
# Prompt Manager — install dependencies and run the app.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js not found."
  echo "   Install it first:  brew install node"
  echo "   (or download from https://nodejs.org)"
  exit 1
fi

echo "✅ Node $(node -v) found"

if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies (first run only)…"
  npm install
fi

echo "🚀 Starting Prompt Manager…"
npm start
