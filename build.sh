#!/bin/bash
set -e

# Print version information
echo "Python version:"
python --version
echo "Pip version:"
pip --version

# Install Python dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create directories if they don't exist
echo "Creating necessary directories..."
mkdir -p logs
mkdir -p uploads
mkdir -p data
mkdir -p static/images

# Make sure static files have the right permissions
echo "Setting appropriate permissions..."
chmod -R 755 logs
chmod -R 755 uploads
chmod -R 755 data
chmod -R 755 static

# Initialize database - use a simple script that imports the database module
echo "Setting up database..."
python -c "import database; print('Database initialized')"

# Run basic application tests
echo "Running basic tests..."
python -c "import app; print('App imported successfully')"

echo "Build completed successfully" 