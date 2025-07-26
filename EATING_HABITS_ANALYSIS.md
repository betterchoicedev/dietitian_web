# Eating Habits Analysis Feature

## Overview

The Eating Habits Analysis feature provides comprehensive analysis of client food logs to create detailed nutritional insights and generate AI-powered recommendations.

## Features

### 1. Top 3 Foods Analysis by Meal Category
- Analyzes food logs to identify the most frequently consumed foods for each meal type
- Categories: Breakfast, Lunch, Dinner, Snack, Morning Snack, Afternoon Snack, Evening Snack, Other
- Shows consumption frequency for each food item

### 2. AI Dietitian System Prompt Generation
- Creates a comprehensive system prompt for the LLM dietitian analyst
- Includes detailed eating pattern analysis
- Provides structured guidance for nutritional assessment and recommendations

### 3. User Interface Enhancements
- "View Detailed Nutritional Analysis" button in client form
- Modal with comprehensive analysis display
- Copy system prompt functionality
- Multi-language support (English/Hebrew)

## API Endpoint

### `/api/analyze-eating-habits`

**Method:** POST

**Request Body:**
```json
{
  "user_code": "ABC12345"
}
```

**Response:**
```json
{
  "system_prompt": "You are a professional dietitian analyst...",
  "analysis_data": {
    "total_logs": 25,
    "top_foods_by_meal": {
      "breakfast": [["oatmeal", 8], ["banana", 6], ["yogurt", 4]],
      "lunch": [["chicken", 10], ["rice", 7], ["vegetables", 5]]
    },
    "meal_frequency": {
      "breakfast": 18,
      "lunch": 22,
      "dinner": 20
    },
    "unique_foods_count": 45
  }
}
```

## System Prompt Structure

The generated system prompt includes:

1. **Client Eating Habits Analysis**
   - Total food log entries
   - Top foods by meal category with consumption frequency
   - Overall pattern analysis

2. **AI Dietitian Role Definition**
   - Nutritional Assessment guidelines
   - Habit Analysis framework
   - Improvement Recommendations structure
   - Actionable Next Steps

3. **Analysis Guidelines**
   - Evidence-based recommendations
   - Cultural and personal preference considerations
   - Practical feasibility balance

## Usage

1. **In Client Management:**
   - Click the search button next to the user code field
   - System automatically analyzes food logs and populates preferences
   - Click "View Detailed Nutritional Analysis" to see comprehensive breakdown

2. **For AI Integration:**
   - Copy the generated system prompt
   - Use it as input for your LLM dietitian analyst
   - The prompt provides structured context for personalized recommendations

## Technical Implementation

### Frontend Changes
- Modified `checkForFoodLogs` function in `Users.jsx`
- Added detailed analysis modal with comprehensive UI
- Integrated with existing translation system

### Backend Changes
- New API endpoint `/api/analyze-eating-habits`
- Enhanced food log analysis with meal categorization
- System prompt generation with structured format

### Data Flow
1. User enters/selects client user code
2. Frontend calls analysis API
3. Backend fetches and analyzes food logs
4. System prompt generated with structured analysis
5. UI displays summary and detailed breakdown
6. User can copy system prompt for LLM integration

## Benefits

- **Comprehensive Analysis:** Provides detailed insights into eating patterns
- **AI-Ready:** Generates structured prompts for LLM dietitian analysis
- **User-Friendly:** Intuitive interface with detailed breakdowns
- **Multilingual:** Supports both English and Hebrew
- **Actionable:** Provides specific improvement recommendations framework

## Future Enhancements

- Nutritional value analysis of frequently consumed foods
- Trend analysis over time
- Comparison with dietary guidelines
- Integration with menu generation for personalized recommendations 