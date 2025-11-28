#!/bin/bash

# Translation Worker Startup Script
# Starts the background translation worker process

echo "🚀 Starting Translation Worker..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Set Node.js path
export PATH="/usr/local/opt/node@20/bin:$PATH"

# Check if worker is already running
if pgrep -f "translationWorker.js" > /dev/null; then
  echo "⚠️  Translation Worker is already running!"
  echo "PID: $(pgrep -f translationWorker.js)"
  exit 1
fi

# Start worker
echo "▶️  Starting worker process..."
node src/workers/translationWorker.js

