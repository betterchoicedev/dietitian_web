### 4. Weekly Tracking of Red Meat and Alcohol Consumption
- **Files**: `src/pages/Users.jsx`, `src/pages/NutritionPlan.jsx`, `src/components/`, `src/api/`
- **Issue**: Track weekly consumption of red meat and alcohol to ensure clients don't exceed their assigned limits
- **Status**: Pending
- **Implementation**:
  - Add red meat and alcohol weekly limit fields in client profile (Users.jsx)
  - Create tracking table in database to log daily red meat and alcohol consumption
  - Build consumption tracking component for clients to log intake
  - Implement weekly consumption calculation and monitoring
  - Add visual indicators (progress bars) showing current vs. allowed weekly intake
  - Create alerts when client approaches or exceeds weekly limits
  - Add dietitian notification system when limits are exceeded
  - Display weekly consumption history and trends in nutrition analytics
  - Reset weekly counters automatically at start of each week
  - Add consumption data to meal plan recommendations



### 6. Fix Ingredient Changes After Generating Alternative Meal
- **Files**: `src/pages/MenuCreate.jsx`
- **Issue**: When generating alternative meals, ingredient changes are not properly handled or saved
- **Status**: Pending
- **Implementation**:
  - Investigate alternative meal generation logic in MenuCreate.jsx
  - Fix ingredient modification handling during alternative meal creation
  - Ensure ingredient changes are properly saved and reflected in the menu
  - Test alternative meal generation with various ingredient modifications
  - Add proper state management for ingredient changes in alternative meals
  - Ensure nutritional calculations update correctly when ingredients change

### 7. Upgrade Dietitian Dashboard
- **Files**: `src/pages/DietitianProfile.jsx`, `src/pages/`, `src/components/`
- **Issue**: Dietitian dashboard needs significant improvements and new features
- **Status**: Pending
- **Implementation**:
  - Analyze current dietitian dashboard functionality
  - Add new features for better client management
  - Improve UI/UX for dietitian workflow
  - Add analytics and reporting capabilities
  - Implement better client overview and tracking
  - Add meal plan management tools
  - Improve navigation and user experience
  - Add real-time notifications and updates

### 8. Fix Chat Auto-Scroll on Refresh
- **Files**: `src/pages/Chat.jsx`
- **Issue**: When the chat refreshes, it should automatically scroll to the last message
- **Status**: Pending
- **Implementation**:
  - Add auto-scroll functionality to chat component on mount/refresh
  - Implement scrollToBottom function triggered after messages load
  - Ensure scroll behavior works with new messages
  - Handle scroll position preservation when user manually scrolls up
  - Add smooth scroll animation for better UX
  - Test with various message counts and chat histories
  - Ensure it works with both initial load and refresh scenarios

### 9. Separate BMR and Daily Target Calories in Client Profile
- **Files**: `src/pages/Users.jsx`, `src/contexts/LanguageContext.jsx`, `backend/backend.py`
- **Issue**: Need to separate BMR (Basal Metabolic Rate) from Daily Target Calories for better clarity and data tracking
- **Status**: In Progress
- **Implementation**:
  - ✅ Add `daily_target_total_calories` field to formData state
  - ✅ Modify `calculateHarrisBenedict()` to return both BMR and daily target
  - ✅ Update `base_daily_total_calories` to store BMR only (read-only field)
  - ✅ Update `daily_target_total_calories` to store full calculation (BMR × Activity × Goal)
  - ✅ Update all macro calculations to use daily_target_total_calories
  - ✅ Update all meal plan structure calculations to use daily_target_total_calories
  - ✅ Update UI to show both fields separately with clear labels
  - ✅ Add translations for new field labels (English & Hebrew)
  - 🔄 Add `daily_target_total_calories` column to Supabase `chat_users` table
  - 🔄 Update backend `load_user_preferences()` to fetch both fields
  - 🔄 Test with existing clients to ensure backward compatibility
  - 🔄 Verify meal plan generation uses correct calorie value





