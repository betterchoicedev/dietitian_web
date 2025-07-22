# BetterChoice Backend API - Quick Reference

## Quick Start

### 1. Generate a Meal Template
```bash
curl -X POST https://dietitian-be.azurewebsites.net/api/template \
  -H "Content-Type: application/json" \
  -d '{"user_code": "USER123"}'
```

### 2. Build a Complete Menu
```bash
curl -X POST https://dietitian-be.azurewebsites.net/api/build-menu \
  -H "Content-Type: application/json" \
  -d '{
    "template": [...],
    "user_code": "USER123"
  }'
```

### 3. Validate a Template
```bash
curl -X POST https://dietitian-be.azurewebsites.net/api/validate-template \
  -H "Content-Type: application/json" \
  -d '{
    "template": [...],
    "user_code": "USER123"
  }'
```

## Common Workflows

### Complete Meal Planning Flow
1. **Generate Template** → `/api/template`
2. **Validate Template** → `/api/validate-template`
3. **Build Menu** → `/api/build-menu`
4. **Add UPC Codes** → `/api/enrich-menu-with-upc`
5. **Generate PDF** → `/api/menu-pdf`

### Translation Flow
1. **Build Menu** → `/api/build-menu`
2. **Translate** → `/api/translate` (targetLang: "he")

### Alternative Meal Generation
1. **Get Existing Menu** → From Supabase or previous build
2. **Generate Alternative** → `/api/generate-alternative-meal`

## Key Data Structures

### Template Structure
```json
{
  "template": [
    {
      "meal": "Breakfast",
      "main": {
        "name": "Meal Name",
        "calories": 400,
        "protein": 25,
        "fat": 15,
        "carbs": 45,
        "main_protein_source": "eggs"
      },
      "alternative": { /* same structure */ }
    }
  ]
}
```

### Menu Structure
```json
{
  "menu": [
    {
      "meal": "Breakfast",
      "main": {
        "meal_title": "Scrambled Eggs with Toast",
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
      "alternative": { /* same structure */ }
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

## User Preferences Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `calories_per_day` | number | Daily calorie target | 2000 |
| `macros.protein` | string | Protein target with unit | "150g" |
| `macros.fat` | string | Fat target with unit | "80g" |
| `macros.carbs` | string | Carbs target with unit | "250g" |
| `allergies` | array | Food allergies to avoid | ["nuts", "shellfish"] |
| `limitations` | array | Dietary restrictions | ["kosher", "vegetarian"] |
| `meal_count` | number | Number of meals per day | 5 |
| `region` | string | Geographic region | "israel" |
| `client_preference.likes` | array | Preferred foods | ["pasta", "chicken"] |
| `client_preference.dislikes` | array | Avoided foods | ["mushrooms", "fish"] |

## Supported Meal Names

### 3 Meals
- Breakfast
- Lunch  
- Dinner

### 4 Meals
- Breakfast
- Morning Snack
- Lunch
- Dinner

### 5 Meals
- Breakfast
- Morning Snack
- Lunch
- Afternoon Snack
- Dinner

## Region-Specific Features

### Israel
- Brands: Tnuva, Osem, Strauss, Elite, Telma
- Hebrew UPC lookup
- Local foods: hummus, falafel, tahini, pita
- Portion sizes: cottage cheese 250g, yogurt 150-200g

### US
- Brands: Kraft, General Mills, Kellogg's, Pepsi
- American foods: bagels, cereals, sandwiches
- Portion sizes: cottage cheese 16oz, yogurt 6-8oz

### UK
- Brands: Tesco, Sainsbury's, Heinz UK, Cadbury
- British foods: beans on toast, fish and chips
- Portion sizes: cottage cheese 300g, yogurt 150-170g

## Error Codes

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 200 | Success | - |
| 400 | Bad Request | Missing parameters, validation errors |
| 404 | Not Found | User not found, meal plan not found |
| 500 | Server Error | AI service errors, database issues |

## Validation Rules

### Template Validation
- Perfect macro matching (0% tolerance)
- Main vs alternative equality
- Main meals > snacks in calories/macros
- Dietary restriction compliance

### Menu Validation
- Macro matching within margins (10-30% based on value)
- Kosher compliance (no meat + dairy mixing)
- Ingredient validation

## Retry Logic

| Endpoint | Max Attempts | Retry Trigger |
|----------|--------------|---------------|
| `/api/template` | 4 | Validation failures, JSON errors |
| `/api/build-menu` | 4 | Template validation failures |
| Individual meals | 6 | Menu validation failures |

## Environment Variables Checklist

```bash
# Required for AI functionality
AZURE_OPENAI_API_BASE=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_DEPLOYMENT=

# Required for translation
AZURE_TRANSLATOR_ENDPOINT=
AZURE_TRANSLATOR_KEY=
AZURE_TRANSLATOR_REGION=

# Required for database
supabaseUrl=
supabaseKey=

# Required for UPC lookup
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_UPC_SCOPE=api://sqlservice/.default
```

## Common Issues & Solutions

### Template Generation Fails
- Check user preferences exist in Supabase
- Verify macro targets are reasonable
- Ensure dietary restrictions are valid

### Menu Building Fails
- Validate template first
- Check ingredient availability for region
- Verify brand names are realistic

### Translation Issues
- Ensure Hebrew font support is available
- Check Azure Translator credentials
- Verify custom term mappings

### UPC Lookup Fails
- Check Azure AD credentials
- Verify region-specific lookup strategy
- Ensure brand names are accurate

## Performance Tips

1. **Use batch UPC lookup** for multiple ingredients
2. **Validate templates** before building menus
3. **Cache user preferences** when possible
4. **Use region-specific** ingredient suggestions
5. **Implement proper error handling** for retry logic

## Testing

### Health Check
```bash
curl https://dietitian-be.azurewebsites.net/api/health
```

### Template Generation Test
```bash
curl -X POST https://dietitian-be.azurewebsites.net/api/template \
  -H "Content-Type: application/json" \
  -d '{"user_code": "TEST_USER"}'
```

### Validation Test
```bash
curl -X POST https://dietitian-be.azurewebsites.net/api/validate-template \
  -H "Content-Type: application/json" \
  -d '{
    "template": [{"meal": "Breakfast", "main": {...}, "alternative": {...}}],
    "user_code": "TEST_USER"
  }'
``` 