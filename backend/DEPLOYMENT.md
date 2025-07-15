git# Azure App Service Deployment Guide

## Overview
This Flask backend application is deployed to Azure App Service using GitHub Actions.

## Required Environment Variables

Configure these environment variables in your Azure App Service:

### Supabase Configuration
- `supabaseUrl` - Your Supabase project URL
- `supabaseKey` - Your Supabase API key

### Azure Translator Configuration
- `AZURE_TRANSLATOR_ENDPOINT` - Azure Translator endpoint (e.g., https://api.cognitive.microsofttranslator.com)
- `AZURE_TRANSLATOR_KEY` - Azure Translator API key
- `AZURE_TRANSLATOR_REGION` - Azure Translator region

### Azure OpenAI Configuration
- `AZURE_OPENAI_API_BASE` - Azure OpenAI endpoint
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT` - Azure OpenAI deployment name (optional, defaults to "obi1")

## Azure App Service Configuration

### Startup Command
Set the startup command in Azure App Service to:
```bash
python -m pip install --upgrade pip && pip install -r requirements.txt && python backend.py
```

### Application Settings
Configure these app settings in Azure:
- `WEBSITES_PORT` = `8000`
- `SCM_DO_BUILD_DURING_DEPLOYMENT` = `0`
- `WEBSITES_CONTAINER_START_TIME_LIMIT` = `1800`

## Troubleshooting

### Common Issues

1. **ModuleNotFoundError: No module named 'flask'**
   - Ensure requirements.txt is being installed during deployment
   - Check that the startup command includes `pip install -r requirements.txt`

2. **Container didn't respond to HTTP pings on port: 8000**
   - Verify the app is binding to port 8000
   - Check that the startup command is correct
   - Ensure all environment variables are configured

3. **File not found errors**
   - Verify the deployment includes all necessary files
   - Check that the working directory is set correctly

### Logs
Check the Azure App Service logs for detailed error information:
- Go to Azure Portal → App Service → Logs
- Enable Application Logging if needed
- Check the Kudu console for deployment logs

## Manual Deployment

If GitHub Actions deployment fails, you can manually deploy:

1. Zip the backend folder contents
2. Upload to Azure App Service via Kudu or Azure CLI
3. Set the startup command manually
4. Configure environment variables
5. Restart the app service 