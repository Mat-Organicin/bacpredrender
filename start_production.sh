#!/bin/bash

# Create logs directory if it doesn't exist
mkdir -p logs

# Activate virtual environment if you're using one
# source venv/bin/activate

# Set production environment
export FLASK_ENV=production

# Create a SECRET_KEY if not already set
if [ -z "$SECRET_KEY" ]; then
    export SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(24))")
    echo "Generated new SECRET_KEY"
fi

# Start Gunicorn with the configuration
echo "Starting BacPred in production mode..."
gunicorn -c gunicorn_config.py wsgi:app 