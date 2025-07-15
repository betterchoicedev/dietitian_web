#!/bin/bash
cd /home/site/wwwroot

# Use the Azure App Service Python environment
echo "Setting up Azure App Service environment..."

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Start the Flask application
echo "Starting Flask application..."
python backend.py 