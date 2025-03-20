#!/bin/bash

# Simple script to make the application accessible over the internet

# Create logs directory if it doesn't exist
mkdir -p logs

# Stop any running Flask or Gunicorn servers
pkill -f "flask run" 2>/dev/null || true
pkill -f "gunicorn" 2>/dev/null || true

# Get local IP address
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
fi

# Get public IP address (this will only work if directly connected to internet)
PUBLIC_IP=$(curl -s ifconfig.me)

# Start Gunicorn in the background
echo "Starting BacPred in production mode..."
gunicorn -c gunicorn_config.py wsgi:app --daemon

# Wait for Gunicorn to start
sleep 2

# Check if server is running
if curl -s http://localhost:5002 > /dev/null; then
    echo "✅ BacPred is now running!"
    echo ""
    echo "Your application is available at:"
    echo "-----------------------------------------------------------"
    echo "• Local network:  http://$LOCAL_IP:5002"
    echo "• Local machine:  http://localhost:5002"
    echo ""
    echo "To share with others on the internet:"
    echo "-----------------------------------------------------------"
    echo "1. Set up port forwarding on your router for port 5002"
    echo "2. Share this link with others: http://$PUBLIC_IP:5002"
    echo ""
    echo "Use CTRL+C to stop monitoring logs (server will keep running)"
    echo "To stop the server, run: pkill -f gunicorn"
    echo "-----------------------------------------------------------"
    
    # Show logs
    tail -f logs/error.log
else
    echo "❌ Failed to start BacPred. Check the logs for more information."
    tail -n 20 logs/error.log
fi 