# TODO List - Dietitian Web Application

## High Priority Issues

### 1. Fix Macro Rebalancing
- **File**: `src/pages/Users.jsx` (lines 244-373)
- **Issue**: Macro adjustment rebalancing logic needs fixing
- **Status**: Fixed

### 2. User Creation Supplements Flow
- **Issue**: When user is created, prompt them to send images and specify what supplements they are taking and how much
- **Status**: Fixed

### 3. Show Supplements in Menu Creation
- **File**: `src/pages/MenuCreate.jsx`
- **Issue**: Display user's supplements when creating meal plans
- **Status**: Fixed

### 4. Fix Ingredient Carbs Calculation
- **Files**: `src/pages/MenuCreate.jsx`, `src/pages/MenuLoad.jsx`
- **Issue**: Carbs are not calculated correctly when changing ingredients
- **Status**: Fixed

## User Experience Improvements

### 5. Meal Plan Activation Notification
- **Files**: `src/pages/MenuLoad.jsx`, `src/pages/Chat.jsx`
- **Issue**: When a meal plan is activated for a client, send a notification message like "Hi you got a new meal plan" via chat
- **Status**: Pending
- **Implementation**: 
  - Add notification function to send chat message when meal plan status changes to 'active'
  - Modify handleUpdateStatus in MenuLoad.jsx to trigger notification after successful activation
  - Create helper function to send notification message via user_message_queue table
  - Test notification functionality with different meal plan activations

### 6. Raw/Cooked Food Specification
- **Issue**: Meal plans need to specify if food should be raw or cooked
- **Status**: Pending

### 7. Fix Olive Oil Instructions
- **Issue**: When olive oil is in meal plan, say to put it in the meal, not drink it
- **Status**: Ask Roy

### 8. Remove Brand Requirements
- **Issue**: Meat/fish and vegetables don't need brand of product (any kind of not ready food)
- **Status**: Fixed

### 9. Optional Household Measures
- **Issue**: Don't have to put household measure when adding a product
- **Status**: Fixed

### 10. Edit AI Ingredient Amounts
- **Issue**: Make it so you can edit the amount of ingredients that the AI has created
- **Status**: fixed

## Display & Formatting

### 11. Add Decimal Formatting to Macros
- **Issue**: In the macros add .0 for consistency
- **Status**: Pending

### 12. Translation Fixes
- **Issue**: Translation system needs fixes
- **Status**: Pending

---

## Notes
- Created: $(date)
- Last Updated: $(date)
- Total Tasks: 12
- Completed: 4
- In Progress: 0
- Pending: 8
