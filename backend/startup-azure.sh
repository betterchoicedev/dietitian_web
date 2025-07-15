#!/bin/bash
cd /home/site/wwwroot

# Use the Azure App Service Python environment
echo "Setting up Azure App Service environment..."

# Find Python executable
PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    PYTHON_CMD="python"
fi

echo "Using Python command: $PYTHON_CMD"

# Install dependencies
echo "Installing dependencies..."
$PYTHON_CMD -m pip install --upgrade pip
$PYTHON_CMD -m pip install -r requirements.txt

# Start the Flask application
echo "Starting Flask application..."
$PYTHON_CMD backend.py 