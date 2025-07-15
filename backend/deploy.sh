#!/bin/bash

# Azure App Service deployment script
echo "Setting up Azure App Service environment..."

# Install dependencies
echo "Installing Python dependencies..."
python -m pip install --upgrade pip
pip install -r requirements.txt

# Set environment variables if not already set
export PORT=8000
export FLASK_ENV=production

# Start the application
echo "Starting Flask application on port $PORT..."
python backend.py 