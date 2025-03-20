import multiprocessing
import os

# Get the directory of this file
current_dir = os.path.dirname(os.path.abspath(__file__))

# Bind address and port
bind = f"0.0.0.0:{os.environ.get('PORT', '5002')}"

# Number of worker processes (use fewer on dev machines)
workers = min(multiprocessing.cpu_count() * 2 + 1, 8)  # Cap at 8 workers

# Worker class
worker_class = "sync"

# Timeout for worker processes (increased for analysis tasks)
timeout = 300

# Access log settings
accesslog = os.path.join(current_dir, "logs/access.log")

# Error log settings
errorlog = os.path.join(current_dir, "logs/error.log")

# Log level
loglevel = "info"

# Process name
proc_name = "bacpred_app"

# Preload application code for faster startup
preload_app = True

# Set environment variables
raw_env = [
    "FLASK_ENV=production",
]

# Reload when code changes (useful for development)
reload = False 