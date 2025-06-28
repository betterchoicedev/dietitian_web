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
    users: 'Users',
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
    
    // Client selection
    selectClient: 'Select a client',
    
    // Language switch
    switchLanguage: 'עברית',
    
    // Error messages
    connectionError: 'Connection Error',
    failedToLoad: 'Failed to load user data. Please try refreshing the page.',
    
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
    users: 'משתמשים',
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
    
    // Client selection
    selectClient: 'בחר לקוח',
    
    // Language switch
    switchLanguage: 'English',
    
    // Error messages
    connectionError: 'שגיאת התחברות',
    failedToLoad: 'טעינת נתוני המשתמש נכשלה. אנא רענן את הדף.',
    
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