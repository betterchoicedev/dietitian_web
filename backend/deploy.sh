#!/bin/bash

# Azure App Service deployment script
echo "Setting up Azure App Service environment..."

# Install dependencies
echo "Installing Python dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

# Set environment variables if not already set
export PORT=8000
export FLASK_ENV=production

# Start the application
echo "Starting Flask application on port $PORT..."
python3 backend.py 