
### 1. Meal Plan Activation Notification
- **Files**: `src/pages/MenuLoad.jsx`, `src/pages/Chat.jsx`
- **Issue**: When a meal plan is activated for a client, send a notification message like "Hi you got a new meal plan" via chat
- **Status**: Pending
- **Implementation**: 
  - Add notification function to send chat message when meal plan status changes to 'active'
  - Modify handleUpdateStatus in MenuLoad.jsx to trigger notification after successful activation
  - Create helper function to send notification message via user_message_queue table
  - Test notification functionality with different meal plan activations

### 2. Dietitian Dashboard with Client Messages
- **Files**: `src/pages/Dashboard.jsx`, `src/components/`, `src/api/`
- **Issue**: Create a comprehensive dashboard for dietitians showing recent client activity and messages
- **Status**: Pending
- **Implementation**:
  - Create dashboard component showing last 5-10 messages from all clients
  - Add client message preview with timestamp and sender info
  - Include quick action buttons (reply, view full conversation)
  - Add client activity metrics (recent meal plans, weight logs, etc.)
  - Create notification system for new messages
  - Add filtering options (by client, message type, date range)
  - Implement real-time updates for new messages
  - Add dietitian-specific statistics (total clients, active meal plans, etc.)

### 3. Separate Sidebar Layout for Dietitian vs Client Sections
- **Files**: `src/pages/Layout.jsx`, `src/components/ui/`, `src/contexts/AuthContext.jsx`
- **Issue**: Create separate sidebar navigation for dietitian and client sections
- **Status**: Pending
- **Implementation**:
  - Create DietitianSidebar component with dietitian-specific navigation
  - Create ClientSidebar component with client-specific navigation
  - Add role-based sidebar switching in Layout.jsx
  - Separate navigation items:
    - **Dietitian Section**: Users, MenuCreate, MenuLoad, Dashboard, NutritionAnalytics, RecipesPage
    - **Client Section**: My Profile, My Meal Plans, My Progress, Chat, Nutrition Plan
  - Update AuthContext to handle role-based navigation
  - Add visual distinction between dietitian and client sections
  - Implement responsive design for both sidebar types
  - Add section headers/separators in sidebar navigation

