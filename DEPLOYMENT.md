# Azure Static Web Apps Deployment Setup

## Current Status
✅ Build configuration fixed (outputs to `build` directory)  
✅ Duplicate keys in LanguageContext.jsx resolved  
✅ Workflow file configured with proper settings  
❌ **Missing**: Azure Static Web Apps API token in GitHub secrets  

## Required Setup Steps

### 1. Configure Azure Static Web Apps API Token

The deployment is currently failing because the `AZURE_STATIC_WEB_APPS_API_TOKEN` is not configured in your GitHub repository secrets.

#### Steps to fix:

1. **Get the deployment token from Azure:**
   - Open [Azure Portal](https://portal.azure.com)
   - Navigate to your Static Web App resource
   - Go to **Overview** → **Manage deployment token**
   - Copy the deployment token (it starts with something like `0-...`)

2. **Add the token to GitHub Secrets:**
   - Go to your GitHub repository: `https://github.com/YOUR_USERNAME/dietitian_web`
   - Click **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - **Name**: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - **Value**: Paste the deployment token from Azure
   - Click **Add secret**

### 2. Verify Deployment

After adding the secret:
1. Push any commit to the `main` branch
2. Check the **Actions** tab in GitHub to see the deployment progress
3. The deployment should now succeed

## Build Configuration

The project is now configured to:
- Build using Vite with output directory set to `build/`
- Deploy the `build/` directory contents to Azure Static Web Apps
- Handle missing secrets gracefully (build will succeed even without deployment token)

## Troubleshooting

If you still encounter issues:

1. **Verify the token is correct**: Make sure you copied the full deployment token from Azure
2. **Check the token name**: It must be exactly `AZURE_STATIC_WEB_APPS_API_TOKEN`
3. **Regenerate token**: If needed, you can regenerate the deployment token in Azure Portal

## Files Modified

- ✅ `vite.config.js` - Added build output directory configuration
- ✅ `src/contexts/LanguageContext.jsx` - Removed 83 duplicate keys
- ✅ `.github/workflows/azure-static-web-apps.yml` - Created/updated workflow
