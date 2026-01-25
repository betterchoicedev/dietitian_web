@echo off
REM Start the Dietitian Web Backend API

cd backend

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Check if .env exists
if not exist ".env" (
    echo WARNING: .env file not found!
    echo Please create a .env file with your Supabase credentials.
    echo See .env.example for reference.
    pause
    exit /b 1
)

REM Start the API
echo Starting backend API on http://localhost:8000
echo Swagger UI available at http://localhost:8000/docs
python supabase_api.py

