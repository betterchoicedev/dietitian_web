#!/bin/bash
cd /home/site/wwwroot

# Install dependencies
echo "Installing Python dependencies..."
python -m pip install --upgrade pip
pip install -r requirements.txt

# Start the application with gunicorn
echo "Starting Flask application..."
gunicorn --bind 0.0.0.0:8000 --timeout 120 --workers 1 backend:app 