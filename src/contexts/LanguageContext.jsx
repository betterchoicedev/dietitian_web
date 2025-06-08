import React, { createContext, useState, useContext } from 'react';

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
    
    // Common buttons and labels
    submit: 'Submit',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    signOut: 'Sign Out',
    retry: 'Retry',
    
    // Client selection
    selectClient: 'Select a client',
    
    // Language switch
    switchLanguage: 'עברית',
    
    // Error messages
    connectionError: 'Connection Error',
    failedToLoad: 'Failed to load user data. Please try refreshing the page.',
    
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
    
    // Common buttons and labels
    submit: 'שלח',
    cancel: 'ביטול',
    save: 'שמור',
    delete: 'מחק',
    signOut: 'התנתק',
    retry: 'נסה שוב',
    
    // Client selection
    selectClient: 'בחר לקוח',
    
    // Language switch
    switchLanguage: 'English',
    
    // Error messages
    connectionError: 'שגיאת התחברות',
    failedToLoad: 'טעינת נתוני המשתמש נכשלה. אנא רענן את הדף.',
    
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

  const toggleLanguage = () => {
    const newLanguage = language === languages.en ? languages.he : languages.en;
    setLanguage(newLanguage);
    // Update document direction based on new language
    document.documentElement.dir = newLanguage === languages.he ? 'rtl' : 'ltr';
    document.documentElement.lang = newLanguage;
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