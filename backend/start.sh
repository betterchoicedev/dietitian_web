#!/bin/bash
# Start the Dietitian Web Backend API

cd backend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "WARNING: .env file not found!"
    echo "Please create a .env file with your Supabase credentials."
    echo "See .env.example for reference."
    exit 1
fi

# Start the API
echo "Starting backend API on http://localhost:8000"
echo "Swagger UI available at http://localhost:8000/docs"
python supabase_api.py

