### 3. Training Management System
- **Files**: `src/pages/TrainingManagement.jsx`, `src/api/client.js`, `src/contexts/LanguageContext.jsx`, `src/App.jsx`, `src/pages/Layout.jsx`
- **Issue**: Implement comprehensive training/workout management for clients
- **Status**: ✅ COMPLETED (October 21, 2025)
- **Implementation**:
  - ✅ Created Training API functions in src/api/client.js for all database operations
    - TrainingPlans (create, read, update, delete)
    - TrainingLogs (view and filter workout logs)
    - TrainingAnalytics (progress tracking)
    - TrainingReminders (reminder management)
    - ExerciseLibrary (exercise database)
  - ✅ Added training translations to LanguageContext.jsx (English & Hebrew)
    - Full bilingual support for all training features
    - RTL support for Hebrew
  - ✅ Created TrainingManagement.jsx page with 4 tabs:
    - Training Plans tab (create, view, manage plans)
    - Training Logs tab (view client workouts with filtering)
    - Training Analytics tab (progress overview - placeholder)
    - Training Reminders tab (reminder management)
  - ✅ Built pre-built training plan templates
    - Beginner Strength Program (4-week, 3-day split: Push/Pull/Legs)
    - 12 exercises with detailed sets, reps, and form notes
  - ✅ Created UI components for creating/editing custom training plans
    - Client selection
    - Plan customization (name, goal, difficulty, duration)
    - Template selection or custom creation
  - ✅ Built training logs viewer with filtering and search
    - Filter by client and date range
    - View exercises, sets, reps, weights
    - Session duration and perceived exertion
  - ✅ Added Training route to App.jsx (/training, /training-management)
  - ✅ Added navigation link in Layout.jsx sidebar with Dumbbell icon
- **Documentation**:
  - See `TRAINING_IMPLEMENTATION_SUMMARY.md` for full details
  - See `TRAINING_QUICK_START.md` for quick reference guide
- **Database Tables Used**:
  - training_plans
  - training_logs
  - training_progress_analytics
  - training_reminder_queue
  - exercise_library

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
- **Status**: FIxed
- **Implementation**:
  - Investigate alternative meal generation logic in MenuCreate.jsx
  - Fix ingredient modification handling during alternative meal creation
  - Ensure ingredient changes are properly saved and reflected in the menu
  - Test alternative meal generation with various ingredient modifications
  - Add proper state management for ingredient changes in alternative meals
  - Ensure nutritional calculations update correctly when ingredients change


### 8. Fix Chat Auto-Scroll on Refresh
- **Files**: `src/pages/Chat.jsx`
- **Issue**: When the chat refreshes, it should automatically scroll to the last message
- **Status**: Fixed
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
- **Status**: Fixed
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

### 10. Fix Search Logic
- **Files**: TBD (to be determined based on search functionality location)
- **Issue**: Fix search logic functionality onemocněníhe application
- **Status**: Fixed
- **Implementation**:
  - Identify where the search functionality is implemented
  - Investigate current search logic issues
  - Fix search query implementation
  - Ensure proper filtering and results display
  - Test search functionality across different scenarios
  - Optimize search performance if needed

### 11. Check/Review PDF Functionality
- **Files**: `src/pages/MenuCreate.jsx`, `src/pages/MenuLoad.jsx`, `templates/menu_pdf.html`
- **Issue**: Review and test PDF generation/download functionality for menu plans
- **Status**: Pending
- **Implementation**:
  - Test PDF download in portrait mode
  - Test PDF download in landscape mode
  - Verify "Remove brand names from PDF" checkbox functionality
  - Check PDF layout and formatting accuracy
  - Ensure all meal information is correctly displayed in PDF
  - Verify nutritional data displays correctly
  - Test with different menu configurations
  - Check RTL support for Hebrew menus in PDF
  - Optimize PDF generation performance if needed
  - Fix any layout or formatting issues found

### 12. WhatsApp Bot Registration Link with Pre-filled Phone Number
- **Files**: `src/App.jsx`, `src/pages/Register.jsx`
- **Issue**: Create registration link for WhatsApp bot integration that auto-fills phone number
- **Status**: Done
- **Use Case**: 
  - Non-client texts the WhatsApp bot
  - Bot detects user wants to register
  - Bot sends registration link with phone number embedded: `yourwebsite.com/+972555555555`
  - User clicks link and phone number is already pre-filled from WhatsApp
- **Implementation**:
  - Create dynamic route that accepts phone number in URL path (e.g., `/register/+972555555555` or `/+972555555555`)
  - Extract phone number from URL path in Register.jsx
  - Pre-fill the phone number field in the registration form
  - Support international phone number formats (e.g., +972, +1, etc.)
  - Validate phone number format from URL
  - Handle edge cases (invalid numbers, missing numbers, etc.)
  - Auto-focus to next field after phone number is pre-filled
  - Test with various phone number formats
  - Add routing logic in App.jsx to handle phone number parameter
  - Make phone number field read-only when pre-filled from URL (or clearly indicate it's from WhatsApp)
  - Add visual indicator showing "Phone number from WhatsApp" for user clarity
  - Document URL format for WhatsApp bot team to use


### 13. Talk to Emanuel About the Website
- **Task**: Schedule a conversation with Emanuel to walk him through the website features and recent updates
- **Status**: Done
- **Notes**:
  - Prepare a concise overview of current functionality
  - Highlight new training management and meal plan safeguards
  - Gather feedback or questions for follow-up


### 14. Restrict Registration Access
- **Task**: Limit registration so only approved individuals can sign up and access client data
- **Status**: Done
- **Notes**:
  - Add whitelist or invite-based flow for registration
  - Validate registrations against allowed list before creating accounts
  - Provide admin UI to manage approved registrants
  - Ensure unauthorized users cannot view client information


### 15. Move Chat Photo Uploads to Google Cloud Storage
- **Task**: Update chat message photo uploads to use Google Cloud Storage instead of the current path
- **Status**: Pending
- **Added**: 2025-11-10
- **Notes**:
  - Configure GCS bucket and credentials
  - Update upload code to write to GCS
  - Adjust download/display URLs to point to GCS
  - Ensure access rules and security policies match requirements

### 16. Localize Meal Plan Templates in Hebrew
- **Files**: `src/pages/MenuCreate.jsx`, `src/pages/MenuTemplates.jsx`, `src/contexts/LanguageContext.jsx`
- **Task**: Display meal plan template names and ingredient lists in Hebrew alongside existing language
- **Status**: Done
- **Added**: 2025-11-10
- **Notes**:
  - Add Hebrew translations for all template names
  - Translate template ingredient titles and descriptions
  - Ensure UI properly handles RTL presentation where applicable
  - Validate that template selection dialogs show both languages
  - Update export/PDF flows to include Hebrew content

### 17. Fix Translation of Exercise Descriptions When Building and Editing Exercises
- **Files**: `src/pages/TrainingManagement.jsx`, `src/contexts/LanguageContext.jsx`
- **Issue**: Exercise descriptions are not properly translated when building/creating or editing exercises in the training management system
- **Status**: Pending
- **Added**: 2025-11-10
- **Implementation**:
  - Investigate exercise description translation logic in TrainingManagement.jsx
  - Add Hebrew translations for exercise description fields in LanguageContext.jsx
  - Ensure exercise descriptions display in the correct language based on user preference
  - Update exercise creation/editing forms to support bilingual descriptions
  - Fix translation when editing existing exercises in training management
  - Test exercise description translation in both English and Hebrew for both create and edit flows
  - Ensure RTL support for Hebrew exercise descriptions
  - Verify translations work in exercise library and training plan views

