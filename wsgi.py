import os
import sys

# Add the parent directory to the path so we can import the app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import environment variables
from dotenv import load_dotenv
load_dotenv()

# Set environment to production
os.environ['FLASK_ENV'] = 'production'

# Import the Flask app
from app import app

if __name__ == "__main__":
    app.run() 