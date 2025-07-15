#!/bin/bash
cd /home/site/wwwroot
python -m pip install --upgrade pip
pip install -r requirements.txt
gunicorn --bind 0.0.0.0:8000 backend:app 