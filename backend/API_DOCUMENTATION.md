# BetterChoice Dietitian Backend API Documentation

## Overview

The BetterChoice Dietitian Backend is a Flask-based REST API that provides personalized meal planning, nutrition analysis, and dietary management services. The API integrates with Azure OpenAI for AI-powered meal generation, Azure Translator for multilingual support, and Supabase for data persistence.

## Base URL

```
https://dietitian-be.azurewebsites.net/api
```

## Authentication

Most endpoints require a `user_code` parameter to identify the user and load their preferences from the Supabase database.

## Environment Variables

The following environment variables must be configured:

```bash
# Azure OpenAI
AZURE_OPENAI_API_BASE=your_azure_openai_endpoint
AZURE_OPENAI_API_KEY=your_azure_openai_key
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_DEPLOYMENT=your_deployment_name

# Azure Translator
AZURE_TRANSLATOR_ENDPOINT=your_translator_endpoint
AZURE_TRANSLATOR_KEY=your_translator_key
AZURE_TRANSLATOR_REGION=your_translator_region

# Supabase
supabaseUrl=your_supabase_url
supabaseKey=your_supabase_key

# Azure AD (for UPC lookup)
AZURE_TENANT_ID=your_tenant_id
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
AZURE_UPC_SCOPE=api://sqlservice/.default
```

## API Endpoints

### 1. Template Generation

#### `POST /api/template`

Generates a personalized meal template based on user preferences and dietary requirements.

**Request Body:**
```json
{
  "user_code": "string"
}
```

**Response:**
```json
{
  "template": [
    {
      "meal": "Breakfast",
      "main": {
        "name": "Scrambled Eggs with Toast",
        "calories": 400,
        "protein": 25,
        "fat": 15,
        "carbs": 45,
        "main_protein_source": "eggs"
      },
      "alternative": {
        "name": "Greek Yogurt with Berries",
        "calories": 380,
        "protein": 22,
        "fat": 18,
        "carbs": 42,
        "main_protein_source": "yogurt"
      }
    }
  ]
}
```

**Features:**
- Supports 3-5 meals per day
- Perfect macro distribution (0% tolerance)
- Region-specific ingredients and brands
- Dietary restriction compliance (kosher, allergies, etc.)
- Automatic retry logic with validation feedback

### 2. Menu Building

#### `POST /api/build-menu`

Builds complete meals from a template, including detailed ingredients and nutrition information.

**Request Body:**
```json
{
  "template": [...],
  "user_code": "string"
}
```

**Response:**
```json
{
  "menu": [
    {
      "meal": "Breakfast",
      "main": {
        "meal_title": "Scrambled Eggs with Whole Wheat Toast",
        "nutrition": {
          "calories": 400,
          "protein": 25,
          "fat": 15,
          "carbs": 45
        },
        "ingredients": [
          {
            "item": "Eggs",
            "brand of pruduct": "Tnuva",
            "portionSI(gram)": 100,
            "household_measure": "2 large eggs",
            "calories": 140,
            "protein": 12,
            "fat": 10,
            "carbs": 0
          }
        ]
      },
      "alternative": {...}
    }
  ],
  "totals": {
    "calories": 2000,
    "protein": 150,
    "fat": 80,
    "carbs": 250
  }
}
```

**Features:**
- Detailed ingredient breakdown with brands
- Realistic portion sizes based on region
- Automatic validation of macro targets
- Support for dietary restrictions

### 3. Template Validation

#### `POST /api/validate-template`

Validates a meal template against user preferences and nutritional requirements.

**Request Body:**
```json
{
  "template": [...],
  "user_code": "string"
}
```

**Response:**
```json
{
  "is_valid": true,
  "is_valid_main": true,
  "is_valid_alt": true,
  "is_valid_main_alt": true,
  "is_valid_main_vs_snack": true,
  "issues_main": [],
  "issues_alt": [],
  "issues_main_alt": [],
  "issues_main_vs_snack": [],
  "totals_main": {
    "calories": 2000,
    "protein": 150,
    "fat": 80,
    "carbs": 250
  },
  "totals_alt": {
    "calories": 2000,
    "protein": 150,
    "fat": 80,
    "carbs": 250
  },
  "targets": {
    "calories": 2000,
    "protein": 150,
    "fat": 80,
    "carbs": 250
  }
}
```

**Validation Rules:**
- Perfect macro matching (0% tolerance)
- Main vs alternative equality
- Main meals vs snacks distribution
- Dietary restriction compliance

### 4. Menu Validation

#### `POST /api/validate-menu`

Validates individual meals against templates and dietary requirements.

**Request Body:**
```json
{
  "template": [...],
  "menu": [...],
  "user_code": "string"
}
```

**Response:**
```json
{
  "is_valid": true,
  "issues": []
}
```

### 5. Translation Services

#### `POST /api/translate`

Translates menu content to target language (primarily Hebrew).

**Request Body:**
```json
{
  "menu": {...},
  "targetLang": "he"
}
```

**Response:**
```json
{
  "meals": [...],
  "note": "translated_note"
}
```

#### `POST /api/translate-recipes`

Translates recipe content to target language.

**Request Body:**
```json
{
  "recipes": [...],
  "targetLang": "he"
}
```

**Response:**
```json
{
  "recipes": [...]
}
```

**Translation Features:**
- Custom food term mapping
- Bidirectional text support (Hebrew)
- Azure Translator integration
- Placeholder preservation for custom terms

### 6. PDF Generation

#### `POST /api/menu-pdf`

Generates a PDF document of the meal plan.

**Request Body:**
```json
{
  "menu": {...}
}
```

**Response:**
PDF file download

**Features:**
- Hebrew text support with proper RTL rendering
- Nutritional summary
- Ingredient details with portions
- Professional formatting
- Automatic font detection and fallback

### 7. UPC Code Services

#### `POST /api/enrich-menu-with-upc`

Adds UPC codes to menu ingredients.

**Request Body:**
```json
{
  "menu": [...],
  "user_code": "string"
}
```

**Response:**
```json
{
  "menu": [
    {
      "meal": "Breakfast",
      "main": {
        "ingredients": [
          {
            "item": "Eggs",
            "brand of pruduct": "Tnuva",
            "UPC": "123456789012"
          }
        ]
      }
    }
  ]
}
```

#### `POST /api/batch-upc-lookup`

Performs batch UPC lookups for multiple ingredients.

**Request Body:**
```json
{
  "ingredients": [
    {
      "brand": "Tnuva",
      "name": "Cottage Cheese"
    }
  ],
  "user_code": "string"
}
```

**Response:**
```json
{
  "results": [
    {
      "brand": "Tnuva",
      "name": "Cottage Cheese",
      "upc": "123456789012"
    }
  ],
  "summary": {
    "total": 1,
    "successful": 1,
    "failed": 0
  }
}
```

**UPC Features:**
- Region-specific lookup strategies
- Hebrew product support for Israeli region
- Azure AD authentication for secure access
- Batch processing for efficiency

### 8. Alternative Meal Generation

#### `POST /api/generate-alternative-meal`

Generates a new alternative meal that differs from existing options.

**Request Body:**
```json
{
  "main": {...},
  "alternative": {...},
  "user_code": "string"
}
```

**Response:**
```json
{
  "meal_title": "New Alternative Meal",
  "ingredients": [...],
  "nutrition": {...},
  "UPC": {...}
}
```

#### `POST /api/generate-alternative-meal-by-id`

Generates alternative meals for a specific meal plan stored in Supabase.

**Request Body:**
```json
{
  "user_code": "string",
  "id": "plan_id",
  "meal_name": "Breakfast"
}
```

**Response:**
```json
{
  "meal_title": "New Alternative Meal",
  "ingredients": [...],
  "nutrition": {...},
  "UPC": {...}
}
```

**Alternative Generation Features:**
- Different protein sources
- Different cooking methods
- Different flavor profiles
- Macro matching within ±5% tolerance
- Automatic UPC enrichment

## User Preferences Structure

User preferences are loaded from Supabase and include:

```json
{
  "calories_per_day": 2000,
  "macros": {
    "protein": "150g",
    "fat": "80g",
    "carbs": "250g"
  },
  "allergies": ["nuts", "shellfish"],
  "limitations": ["kosher", "vegetarian"],
  "diet_type": "personalized",
  "meal_count": 5,
  "client_preference": {
    "likes": ["pasta", "chicken"],
    "dislikes": ["mushrooms", "fish"]
  },
  "region": "israel"
}
```

## Supported Regions

- **Israel**: Israeli brands (Tnuva, Osem, Strauss, Elite, Telma), local foods, Hebrew UPC lookup
- **US**: American brands (Kraft, General Mills, Kellogg's), typical American foods
- **UK**: British brands (Tesco, Sainsbury's, Heinz UK), typical British foods
- **Canada**: Canadian brands (Loblaws, President's Choice), typical Canadian foods
- **Australia**: Australian brands (Woolworths, Coles, Arnott's), typical Australian foods

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200`: Success
- `400`: Bad Request (missing parameters, validation errors)
- `404`: Not Found (user, meal plan, or meal not found)
- `500`: Internal Server Error

Error responses include detailed error messages:

```json
{
  "error": "Detailed error message",
  "failure_type": "validation_failed",
  "attempts_made": 3
}
```

## Rate Limiting

The API includes retry logic for AI-powered endpoints:
- Template generation: Up to 4 attempts with validation feedback
- Menu building: Up to 4 attempts with template regeneration
- Individual meal building: Up to 6 attempts per meal

## Dependencies

```
Flask==3.1.1
flask-cors==6.0.1
openai==0.28.0
python-dotenv==1.1.1
reportlab==4.4.2
requests==2.32.4
supabase==2.16.0
arabic-reshaper==3.0.0
python-bidi==0.6.6
weasyprint==61.2
flask-weasyprint==1.1.0
gunicorn==21.2.0
```

## Deployment

The backend can be deployed using:
- **Gunicorn**: Production WSGI server
- **Azure App Service**: Cloud hosting with automatic scaling
- **Docker**: Containerized deployment

## Security Considerations

- API keys and secrets stored in environment variables
- Azure AD authentication for UPC lookup services
- Input validation and sanitization
- CORS configuration for frontend integration
- Error logging without exposing sensitive information

## Monitoring and Logging

The API includes comprehensive logging:
- Request/response logging
- Error tracking with stack traces
- Performance monitoring
- Validation feedback logging
- UPC lookup success/failure tracking

## Support

For technical support or questions about the API, please refer to the project documentation or contact the development team. 