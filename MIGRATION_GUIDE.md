# Migration Guide: Menu to Meal Plans and Schemas

## Overview
This migration updates the application to use a unified `meal_plans_and_schemas` table instead of separate menu tables. The new structure supports both reusable schemas (templates) and personalized meal plans with comprehensive logging.

## Database Changes

### New Table: `meal_plans_and_schemas`
- **`record_type`**: 'schema' for templates, 'meal_plan' for client plans
- **`schema`**: JSON column for template structure
- **`meal_plan`**: JSON column for personalized meal plans
- **`change_log`**: JSON array for activity logging
- **`meal_plan_name`**: Replaces `programName`
- **`daily_total_calories`**: Replaces `dailyTotalCalories`
- **`macros_target`**: Replaces `macros`
- **`user_code`**: References `chat_users` table by user_code

### Key Changes
1. **Unified Structure**: Both schemas and meal plans in one table
2. **Improved Logging**: Built-in change tracking
3. **Better Relationships**: Direct user_code references to chat_users table
4. **Flexible JSON Storage**: Separate schema and meal_plan columns

## Files Updated

### Core Files
- ✅ `database_schema.sql` - New table definition
- ✅ `src/api/client.js` - Updated Menu entity with logging
- ✅ `src/pages/MenuCreate.jsx` - Added schema/meal plan creation
- ✅ `src/pages/MenuEdit.jsx` - Updated for new schema
- ✅ `src/pages/Menus.jsx` - Updated filtering and display
- ✅ `src/pages/MenuView.jsx` - Updated field references

### Remaining Files to Update
- [ ] `src/pages/Dashboard.jsx`
- [ ] `src/pages/Chat.jsx`
- [ ] `src/pages/ClientMenu.jsx`
- [ ] `src/pages/DataGenerator.jsx`
- [ ] `src/pages/ApiMenus.jsx`
- [ ] `src/pages/ApiClientMenu.jsx`
- [ ] `src/pages/MenuAnalysis.jsx`

## Field Mapping

| Old Field | New Field |
|-----------|-----------|
| `programName` | `meal_plan_name` |
| `dailyTotalCalories` | `daily_total_calories` |
| `macros` | `macros_target` |
| `user_code` | `user_code` (same field, now direct reference to chat_users) |
| `meals` | `meal_plan.meals` |

## Next Steps

1. **Run SQL Migration**: Execute `database_schema.sql` in Supabase
2. **Update Remaining Files**: Complete the file updates listed above
3. **Data Migration**: Convert existing menu data to new format
4. **Test Thoroughly**: Verify all CRUD operations work
5. **Update Documentation**: Update any user-facing documentation

## Usage Examples

### Creating a Schema
```javascript
await Menu.create({
  record_type: 'schema',
  meal_plan_name: 'High Protein Template',
  schema: templateData,
  meal_plan: null,
  dietitian_id: currentUserId
});
```

### Creating a Meal Plan
```javascript
await Menu.create({
  record_type: 'meal_plan',
  meal_plan_name: 'John\'s Custom Plan',
  schema: null,
  meal_plan: personalizedData,
  user_code: userCode, // References chat_users table
  dietitian_id: currentUserId,
  daily_total_calories: 2200,
  macros_target: { protein: '150g', carbs: '200g', fat: '80g' }
});
```

## Change Logging
Every create/update operation automatically logs:
- Timestamp
- Actor (dietitian) ID
- Action type
- Change details

 