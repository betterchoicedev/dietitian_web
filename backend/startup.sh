#!/bin/bash
cd /home/site/wwwroot

# Install dependencies using the correct Python path
echo "Installing Python dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

# Start the application with gunicorn
echo "Starting Flask application..."
python3 -m gunicorn --bind 0.0.0.0:8000 --timeout 120 --workers 1 backend:app 