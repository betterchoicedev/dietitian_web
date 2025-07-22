# BetterChoice Backend Deployment Guide

## Overview

This guide covers deploying the BetterChoice Dietitian Backend to various platforms. The backend is a Flask application that requires specific environment variables and dependencies.

## Prerequisites

- Python 3.8+
- pip package manager
- Access to Azure services (OpenAI, Translator, AD)
- Supabase project
- Domain name (for production)

## Local Development Setup

### 1. Clone and Setup

```bash
git clone <repository-url>
cd dietitian_web/backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment Variables

Create a `.env` file in the backend directory:

```bash
# Azure OpenAI
AZURE_OPENAI_API_BASE=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your_openai_key
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_DEPLOYMENT=your_deployment_name

# Azure Translator
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
AZURE_TRANSLATOR_KEY=your_translator_key
AZURE_TRANSLATOR_REGION=your_region

# Supabase
supabaseUrl=https://your-project.supabase.co
supabaseKey=your_supabase_anon_key

# Azure AD (for UPC lookup)
AZURE_TENANT_ID=your_tenant_id
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
AZURE_UPC_SCOPE=api://sqlservice/.default

# Flask
FLASK_ENV=development
FLASK_DEBUG=1
```

### 3. Run Locally

```bash
python backend.py
```

The server will start on `http://localhost:8000`

## Azure App Service Deployment

### 1. Prerequisites

- Azure subscription
- Azure CLI installed
- App Service plan

### 2. Create App Service

```bash
# Login to Azure
az login

# Create resource group
az group create --name betterchoice-backend --location eastus

# Create App Service plan
az appservice plan create --name betterchoice-plan --resource-group betterchoice-backend --sku B1 --is-linux

# Create web app
az webapp create --name betterchoice-backend --resource-group betterchoice-backend --plan betterchoice-plan --runtime "PYTHON|3.9"
```

### 3. Configure Environment Variables

```bash
# Set environment variables
az webapp config appsettings set --name betterchoice-backend --resource-group betterchoice-backend --settings \
  AZURE_OPENAI_API_BASE="https://your-resource.openai.azure.com/" \
  AZURE_OPENAI_API_KEY="your_openai_key" \
  AZURE_OPENAI_API_VERSION="2024-12-01-preview" \
  AZURE_OPENAI_DEPLOYMENT="your_deployment_name" \
  AZURE_TRANSLATOR_ENDPOINT="https://api.cognitive.microsofttranslator.com" \
  AZURE_TRANSLATOR_KEY="your_translator_key" \
  AZURE_TRANSLATOR_REGION="your_region" \
  supabaseUrl="https://your-project.supabase.co" \
  supabaseKey="your_supabase_anon_key" \
  AZURE_TENANT_ID="your_tenant_id" \
  AZURE_CLIENT_ID="your_client_id" \
  AZURE_CLIENT_SECRET="your_client_secret" \
  AZURE_UPC_SCOPE="api://sqlservice/.default" \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

### 4. Deploy Code

```bash
# Deploy from local directory
az webapp deployment source config-local-git --name betterchoice-backend --resource-group betterchoice-backend

# Get deployment URL
az webapp deployment list-publishing-credentials --name betterchoice-backend --resource-group betterchoice-backend

# Push to Azure
git remote add azure <deployment-url>
git push azure main
```

### 5. Configure Startup Command

Create a `startup.txt` file in the backend directory:

```txt
gunicorn --bind=0.0.0.0 --timeout 600 backend:app
```

## Docker Deployment

### 1. Create Dockerfile

```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--timeout", "600", "backend:app"]
```

### 2. Build and Run

```bash
# Build image
docker build -t betterchoice-backend .

# Run container
docker run -p 8000:8000 --env-file .env betterchoice-backend
```

### 3. Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "8000:8000"
    environment:
      - AZURE_OPENAI_API_BASE=${AZURE_OPENAI_API_BASE}
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - AZURE_OPENAI_API_VERSION=${AZURE_OPENAI_API_VERSION}
      - AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT}
      - AZURE_TRANSLATOR_ENDPOINT=${AZURE_TRANSLATOR_ENDPOINT}
      - AZURE_TRANSLATOR_KEY=${AZURE_TRANSLATOR_KEY}
      - AZURE_TRANSLATOR_REGION=${AZURE_TRANSLATOR_REGION}
      - supabaseUrl=${supabaseUrl}
      - supabaseKey=${supabaseKey}
      - AZURE_TENANT_ID=${AZURE_TENANT_ID}
      - AZURE_CLIENT_ID=${AZURE_CLIENT_ID}
      - AZURE_CLIENT_SECRET=${AZURE_CLIENT_SECRET}
      - AZURE_UPC_SCOPE=${AZURE_UPC_SCOPE}
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

## Heroku Deployment

### 1. Prerequisites

- Heroku account
- Heroku CLI installed

### 2. Create Heroku App

```bash
# Login to Heroku
heroku login

# Create app
heroku create betterchoice-backend

# Add Python buildpack
heroku buildpacks:set heroku/python
```

### 3. Configure Environment Variables

```bash
heroku config:set AZURE_OPENAI_API_BASE="https://your-resource.openai.azure.com/"
heroku config:set AZURE_OPENAI_API_KEY="your_openai_key"
heroku config:set AZURE_OPENAI_API_VERSION="2024-12-01-preview"
heroku config:set AZURE_OPENAI_DEPLOYMENT="your_deployment_name"
heroku config:set AZURE_TRANSLATOR_ENDPOINT="https://api.cognitive.microsofttranslator.com"
heroku config:set AZURE_TRANSLATOR_KEY="your_translator_key"
heroku config:set AZURE_TRANSLATOR_REGION="your_region"
heroku config:set supabaseUrl="https://your-project.supabase.co"
heroku config:set supabaseKey="your_supabase_anon_key"
heroku config:set AZURE_TENANT_ID="your_tenant_id"
heroku config:set AZURE_CLIENT_ID="your_client_id"
heroku config:set AZURE_CLIENT_SECRET="your_client_secret"
heroku config:set AZURE_UPC_SCOPE="api://sqlservice/.default"
```

### 4. Deploy

```bash
git push heroku main
```

## Production Considerations

### 1. Security

- Use HTTPS in production
- Store secrets in environment variables
- Implement rate limiting
- Add request logging
- Use secure headers

### 2. Performance

- Enable gzip compression
- Use CDN for static assets
- Implement caching strategies
- Monitor response times
- Scale horizontally if needed

### 3. Monitoring

- Set up health checks
- Monitor error rates
- Track API usage
- Set up alerts for failures
- Log performance metrics

### 4. SSL/TLS

For Azure App Service:
```bash
# Enable HTTPS
az webapp update --name betterchoice-backend --resource-group betterchoice-backend --https-only true

# Configure custom domain
az webapp config hostname add --webapp-name betterchoice-backend --resource-group betterchoice-backend --hostname your-domain.com
```

## Health Checks

Add a health check endpoint to your application:

```python
@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.datetime.now().isoformat(),
        'version': '1.0.0'
    })
```

## Troubleshooting

### Common Issues

1. **Import Errors**
   - Ensure all dependencies are installed
   - Check Python version compatibility

2. **Environment Variable Issues**
   - Verify all required variables are set
   - Check for typos in variable names

3. **Azure Service Issues**
   - Verify API keys and endpoints
   - Check service quotas and limits
   - Ensure proper authentication

4. **Database Connection Issues**
   - Verify Supabase credentials
   - Check network connectivity
   - Ensure database is accessible

### Logs

View logs for different platforms:

**Azure App Service:**
```bash
az webapp log tail --name betterchoice-backend --resource-group betterchoice-backend
```

**Docker:**
```bash
docker logs <container-id>
```

**Heroku:**
```bash
heroku logs --tail
```

## Backup and Recovery

### 1. Environment Variables

Keep a secure backup of all environment variables.

### 2. Database

- Set up automated Supabase backups
- Test restore procedures regularly

### 3. Application Code

- Use version control (Git)
- Tag releases for easy rollback
- Keep deployment scripts in version control

## Scaling

### Horizontal Scaling

For Azure App Service:
```bash
# Scale to multiple instances
az appservice plan update --name betterchoice-plan --resource-group betterchoice-backend --number-of-workers 3
```

### Load Balancing

- Use Azure Application Gateway
- Configure health checks
- Set up auto-scaling rules

## Cost Optimization

### Azure App Service

- Use appropriate service plan
- Monitor usage and scale down when possible
- Use reserved instances for predictable workloads

### Azure OpenAI

- Monitor token usage
- Implement caching where possible
- Use appropriate model tiers

### Supabase

- Monitor database usage
- Optimize queries
- Use appropriate plan tier 