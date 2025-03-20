#!/bin/bash

# This script sets up temporary access to your BacPred application
# using ngrok for testing purposes. This is NOT recommended for
# permanent production use, only for demonstration or testing.

echo "Setting up temporary internet access for BacPred..."

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "ngrok is not installed. Please install it first:"
    echo "Visit https://ngrok.com/download and follow the instructions."
    exit 1
fi

# Stop existing Flask server if running
pkill -f "flask run" || true
pkill -f "gunicorn" || true

# Create logs directory
mkdir -p logs

# Start Gunicorn in the background
echo "Starting BacPred with Gunicorn..."
cd $(dirname "$0")
gunicorn -c gunicorn_config.py wsgi:app --daemon

# Wait for Gunicorn to start
sleep 2

# Start ngrok to expose the application
echo "Starting ngrok to create a public URL..."
echo "Your BacPred application will be available at the URL shown below."
echo "CTRL+C to stop when finished testing."
echo "-----------------------------------------------------------"
ngrok http 5002 