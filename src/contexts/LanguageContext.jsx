import React, { createContext, useState, useContext } from 'react';
import { EventBus } from '@/utils/EventBus';

export const LanguageContext = createContext();

export const languages = {
  en: 'en',
  he: 'he'
};

export const translations = {
  en: {
    // Navigation
    home: 'Dashboard',
    about: 'About',
    services: 'Services',
    contact: 'Contact',
    chat: 'Chat',
    dataGenerator: 'Data Generator',
    nutritionPlan: 'Nutrition Plan',
    menuCreate: 'Menu Create',
    
    // Common buttons and labels
    submit: 'Submit',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    signOut: 'Sign Out',
    retry: 'Retry',
    edit: 'Edit',
    loading: 'Loading...',
    search: 'Search',
    close: 'Close',
    open: 'Open',
    next: 'Next',
    previous: 'Previous',
    send: 'Send',
    upload: 'Upload',
    download: 'Download',
    settings: 'Settings',
    profile: 'Profile',
    back: 'Back',
    continue: 'Continue',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    
    // Client selection
    selectClient: 'Select a client',
    
    // Language switch
    switchLanguage: 'עברית',
    
    // Error messages
    connectionError: 'Connection Error',
    failedToLoad: 'Failed to load user data. Please try refreshing the page.',
    
    // Chat page
    selectClientToChat: 'Select Client to Chat With',
    chooseClientFromList: 'Choose a client from your list to start chatting',
    selectAClient: 'Select a client...',
    chatWith: 'Chat with',
    clientCode: 'Client Code',
    dailyCalories: 'Daily calories',
    notSet: 'Not set',
    startConversation: 'Start a Conversation',
    chatAboutNutrition: 'about their nutrition plan. You can also share food images for analysis.',
    noClientSelected: 'No Client Selected',
    selectClientToStart: 'Please select a client from the dropdown above to start chatting about their nutrition plan.',
    messageClient: 'Message',
    imageSelected: 'Image selected',
    uploadedFood: 'Uploaded food',
    failedToUpload: 'Failed to upload image. Please try again.',
    failedToSend: 'Failed to send message. Please try again.',
    failedToLoadClients: 'Failed to load clients. Please try again later.',
    failedToLoadClientData: 'Failed to load client data. Please try again later.',
    
    // Login page
    login: 'Login',
    enterCredentials: 'Enter your credentials to access your account',
    email: 'Email',
    enterEmail: 'Enter your email',
    password: 'Password',
    enterPassword: 'Enter your password',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    dontHaveAccount: "Don't have an account?",
    register: 'Register',
    failedToSignIn: 'Failed to sign in. Please check your credentials and try again.',
    
    // Users page
    userManagement: 'User Management',
    manageUserProfiles: 'Manage user profiles and dietary information',
    searchUsers: 'Search users...',
    users: 'Users',
    viewAndManageUsers: 'View and manage all registered users',
    userCode: 'User Code',
    details: 'Details',
    actions: 'Actions',
    noData: 'No data',
    noUsersFound: 'No users found',
    editUserInformation: 'Edit User Information',
    heightCm: 'Height (cm)',
    weightKg: 'Weight (kg)',
    gender: 'Gender',
    activity: 'Activity',
    goal: 'Goal',
    selectGender: 'Select gender',
    male: 'Male',
    female: 'Female',
    selectActivityLevel: 'Select activity level',
    sedentary: 'Sedentary',
    lightActivity: 'Light Activity',
    moderateActivity: 'Moderate Activity',
    veryActive: 'Very Active',
    extraActive: 'Extra Active',
    selectGoal: 'Select goal',
    loseWeight: 'Lose Weight',
    maintainWeight: 'Maintain Weight',
    gainWeight: 'Gain Weight',
    saveChanges: 'Save Changes',
    
    // Dashboard page
    dashboard: 'Dashboard',
    overviewOfClient: 'Overview of your client information',
    clientInformation: 'Client Information',
    activityLevel: 'Activity Level',
    notes: 'Notes',
    editInformation: 'Edit Information',
    clientSummary: 'Client Summary',
    menus: 'Menus',
    kcal: 'kcal',
    noMenusYet: 'No menus yet',
    createFirstMenu: 'Create your first menu for this client',
    createMenu: 'Create Menu',
    menusTotal: 'total',
    viewAllMenus: 'View All Menus',
    chatSession: 'Chat Session',
    messages: 'messages',
    noChatHistory: 'No chat history',
    startConversationWith: 'Start a conversation with this client',
    startChat: 'Start Chat',
    chatSessionsTotal: 'chat session',
    viewAllChats: 'View All Chats',
    recentActivity: 'Recent Activity',
    noRecentActivity: 'No recent activity',
    nutritionSummary: 'Nutrition Summary',
    noMenuDataAvailable: 'No menu data available',
    quickActions: 'Quick Actions',
    menuAnalysis: 'Menu Analysis',
    updateInfo: 'Update Info',
    
    // Recipes page
    healthyDeliciousRecipes: 'Healthy & Delicious Recipes',
    salads: 'Salads',
    warmDishes: 'Warm Dishes',
    appetizers: 'Appetizers',
    more: 'More',
    howToMakeIt: 'How to make it',
    tip: 'Tip',
    printRecipe: 'Print Recipe',
    easy: 'Easy',
    healthy: 'Healthy',
    quick: 'Quick',
    translating: 'Translating...',
    translateRecipes: 'Translate Recipes',
    
    // Nutrition Plan
    searchIngredient: 'Search ingredient...',
    editPlan: 'Edit Plan',
    personalizedNutritionPlan: 'Personalized Nutrition Plan',
    addMeal: 'Add Meal',
    addItem: 'Add Item',
    addIngredient: 'Add Ingredient',
    mealName: 'Meal Name',
    itemName: 'Item Name',
    portion: 'Portion',
    protein: 'Protein',
    fat: 'Fat',
    energy: 'Energy',
    calories: 'kcal',
    nutritionValues: 'Nutrition Values',
    ingredients: 'Ingredients',
    alternatives: 'Alternatives',
    overview: 'Overview',
    meals: 'Meals',
    nutrition: 'Nutrition',
    recommendations: 'Recommendations',
    clientInfo: 'Client Information',
    name: 'Name',
    age: 'Age',
    height: 'Height',
    weight: 'Weight',
    dailyNutrition: 'Daily Nutrition',
    carbs: 'Carbs',
    supplements: 'Supplements',
    hydration: 'Hydration',
    sleep: 'Sleep',
    general: 'General',
    
    // Profile
    specialization: 'Specialization',
    certification: 'Certification',
    yearsOfExperience: 'Years of Experience',
    clinicName: 'Clinic Name',
    clinicAddress: 'Clinic Address',
    profileBio: 'Profile Bio',
    languages: 'Languages',
    consultationFee: 'Consultation Fee',
    availableTimes: 'Available Times',
  },
  he: {
    // Navigation
    home: 'לוח בקרה',
    about: 'אודות',
    services: 'שירותים',
    contact: 'צור קשר',
    chat: 'צ\'אט',
    dataGenerator: 'יצירת נתונים',
    nutritionPlan: 'תוכנית תזונה',
    menuCreate: 'יצירת תפריט',
    
    // Common buttons and labels
    submit: 'שלח',
    cancel: 'ביטול',
    save: 'שמור',
    delete: 'מחק',
    signOut: 'התנתק',
    retry: 'נסה שוב',
    edit: 'ערוך',
    loading: 'טוען...',
    search: 'חפש',
    close: 'סגור',
    open: 'פתח',
    next: 'הבא',
    previous: 'הקודם',
    send: 'שלח',
    upload: 'העלה',
    download: 'הורד',
    settings: 'הגדרות',
    profile: 'פרופיל',
    back: 'חזור',
    continue: 'המשך',
    confirm: 'אשר',
    yes: 'כן',
    no: 'לא',
    
    // Client selection
    selectClient: 'בחר לקוח',
    
    // Language switch
    switchLanguage: 'English',
    
    // Error messages
    connectionError: 'שגיאת התחברות',
    failedToLoad: 'טעינת נתוני המשתמש נכשלה. אנא רענן את הדף.',
    
    // Chat page
    selectClientToChat: 'בחר לקוח לשיחה',
    chooseClientFromList: 'בחר לקוח מהרשימה שלך כדי להתחיל לצ\'אט',
    selectAClient: 'בחר לקוח...',
    chatWith: 'צ\'אט עם',
    clientCode: 'קוד לקוח',
    dailyCalories: 'קלוריות יומיות',
    notSet: 'לא נקבע',
    startConversation: 'התחל שיחה',
    chatAboutNutrition: 'על תוכנית התזונה שלהם. תוכל גם לשתף תמונות אוכל לניתוח.',
    noClientSelected: 'לא נבחר לקוח',
    selectClientToStart: 'אנא בחר לקוח מהתפריט הנפתח למעלה כדי להתחיל לצ\'אט על תוכנית התזונה שלהם.',
    messageClient: 'הודעה ל',
    imageSelected: 'תמונה נבחרה',
    uploadedFood: 'אוכל שהועלה',
    failedToUpload: 'העלאת התמונה נכשלה. אנא נסה שוב.',
    failedToSend: 'שליחת ההודעה נכשלה. אנא נסה שוב.',
    failedToLoadClients: 'טעינת הלקוחות נכשלה. אנא נסה שוב מאוחר יותר.',
    failedToLoadClientData: 'טעינת נתוני הלקוח נכשלה. אנא נסה שוב מאוחר יותר.',
    
    // Login page
    login: 'התחברות',
    enterCredentials: 'הכנס את פרטי הגישה שלך כדי לגשת לחשבון שלך',
    email: 'אימייל',
    enterEmail: 'הכנס את האימייל שלך',
    password: 'סיסמה',
    enterPassword: 'הכנס את הסיסמה שלך',
    signIn: 'התחבר',
    signingIn: 'מתחבר...',
    dontHaveAccount: 'אין לך חשבון?',
    register: 'הרשמה',
    failedToSignIn: 'ההתחברות נכשלה. אנא בדוק את פרטי הגישה שלך ונסה שוב.',
    
    // Users page
    userManagement: 'ניהול משתמשים',
    manageUserProfiles: 'נהל פרופילי משתמשים ומידע תזונתי',
    searchUsers: 'חפש משתמשים...',
    users: 'משתמשים',
    viewAndManageUsers: 'צפה ונהל את כל המשתמשים הרשומים',
    userCode: 'קוד משתמש',
    details: 'פרטים',
    actions: 'פעולות',
    noData: 'אין נתונים',
    noUsersFound: 'לא נמצאו משתמשים',
    editUserInformation: 'ערוך מידע משתמש',
    heightCm: 'גובה (סמ)',
    weightKg: 'משקל (ק״ג)',
    gender: 'מין',
    activity: 'פעילות',
    goal: 'מטרה',
    selectGender: 'בחר מין',
    male: 'זכר',
    female: 'נקבה',
    selectActivityLevel: 'בחר רמת פעילות',
    sedentary: 'יושב',
    lightActivity: 'פעילות קלה',
    moderateActivity: 'פעילות בינונית',
    veryActive: 'פעיל מאוד',
    extraActive: 'פעיל במיוחד',
    selectGoal: 'בחר מטרה',
    loseWeight: 'הורדת משקל',
    maintainWeight: 'שמירת משקל',
    gainWeight: 'עלייה במשקל',
    saveChanges: 'שמור שינויים',
    
    // Dashboard page
    dashboard: 'לוח בקרה',
    overviewOfClient: 'סקירה כללית של מידע הלקוח שלך',
    clientInformation: 'מידע לקוח',
    activityLevel: 'רמת פעילות',
    notes: 'הערות',
    editInformation: 'ערוך מידע',
    clientSummary: 'סיכום לקוח',
    menus: 'תפריטים',
    kcal: 'קק״ל',
    noMenusYet: 'אין תפריטים עדיין',
    createFirstMenu: 'צור את התפריט הראשון שלך עבור הלקוח הזה',
    createMenu: 'צור תפריט',
    menusTotal: 'סה״כ',
    viewAllMenus: 'צפה בכל התפריטים',
    chatSession: 'סשן צ\'אט',
    messages: 'הודעות',
    noChatHistory: 'אין היסטוריית צ\'אט',
    startConversationWith: 'התחל שיחה עם הלקוח הזה',
    startChat: 'התחל צ\'אט',
    chatSessionsTotal: 'סשן צ\'אט',
    viewAllChats: 'צפה בכל הצ\'אטים',
    recentActivity: 'פעילות אחרונה',
    noRecentActivity: 'אין פעילות אחרונה',
    nutritionSummary: 'סיכום תזונתי',
    noMenuDataAvailable: 'אין נתוני תפריט זמינים',
    quickActions: 'פעולות מהירות',
    menuAnalysis: 'ניתוח תפריט',
    updateInfo: 'עדכן מידע',
    
    // Recipes page
    healthyDeliciousRecipes: 'מתכונים בריאים וטעימים',
    salads: 'סלטים',
    warmDishes: 'מנות חמות',
    appetizers: 'מתאבנים',
    more: 'עוד',
    howToMakeIt: 'איך להכין',
    tip: 'טיפ',
    printRecipe: 'הדפס מתכון',
    easy: 'קל',
    healthy: 'בריא',
    quick: 'מהיר',
    translating: 'מתרגם...',
    translateRecipes: 'תרגם מתכונים',
    
    // Nutrition Plan
    searchIngredient: 'חפש מרכיב...',
    editPlan: 'ערוך תוכנית',
    personalizedNutritionPlan: 'תוכנית תזונה אישית',
    addMeal: 'הוסף ארוחה',
    addItem: 'הוסף פריט',
    addIngredient: 'הוסף מרכיב',
    mealName: 'שם הארוחה',
    itemName: 'שם הפריט',
    portion: 'מנה',
    protein: 'חלבון',
    fat: 'שומן',
    energy: 'אנרגיה',
    calories: 'קק״ל',
    nutritionValues: 'ערכים תזונתיים',
    ingredients: 'מרכיבים',
    alternatives: 'חלופות',
    overview: 'סקירה כללית',
    meals: 'ארוחות',
    nutrition: 'תזונה',
    recommendations: 'המלצות',
    clientInfo: 'פרטי מתאמן',
    name: 'שם',
    age: 'גיל',
    height: 'גובה',
    weight: 'משקל',
    dailyNutrition: 'תזונה יומית',
    carbs: 'פחמימות',
    supplements: 'תוספי תזונה',
    hydration: 'שתייה',
    sleep: 'שינה',
    general: 'כללי',
    
    // Profile
    specialization: 'התמחות',
    certification: 'תעודות',
    yearsOfExperience: 'שנות ניסיון',
    clinicName: 'שם המרפאה',
    clinicAddress: 'כתובת המרפאה',
    profileBio: 'אודות',
    languages: 'שפות',
    consultationFee: 'מחיר לפגישה',
    availableTimes: 'זמנים פנויים',
  }
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(languages.en);

  const toggleLanguage = async () => {
    const newLanguage = language === languages.en ? languages.he : languages.en;
    setLanguage(newLanguage);
    // Update document direction based on new language
    document.documentElement.dir = newLanguage === languages.he ? 'rtl' : 'ltr';
    document.documentElement.lang = newLanguage;

    // Notify listeners (e.g., MenuCreate.jsx) to translate menu if needed
    EventBus.emit('translateMenu', newLanguage);
  };

  // Set initial direction and language
  React.useEffect(() => {
    document.documentElement.dir = language === languages.he ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, []);

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, translations: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
} 