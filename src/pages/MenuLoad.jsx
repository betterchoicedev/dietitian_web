import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader, Save, Search, Filter, Utensils, Edit, CalendarRange, Download, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from '@/api/entities';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase, secondSupabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { getMyProfile } from '@/utils/auth';
import { EventBus } from '@/utils/EventBus';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Helper function to get user language preference
// Returns the actual language value from database, or 'en' as fallback
// Only 'he' will trigger Hebrew notifications, everything else gets English
const getUserLanguage = async (userCode) => {
  try {
    console.log('🔍 Fetching language for user_code:', userCode);
    const { data: userData, error: userError } = await supabase
      .from('chat_users')
      .select('language')
      .eq('user_code', userCode)
      .single();
    
    console.log('📊 Language query result:', { userData, userError });
    
    if (!userError && userData?.language) {
      console.log('📝 User language preference found:', userData.language);
      return userData.language; // Return whatever is in the database
    } else {
      console.log('⚠️ No language found or error occurred, using default English');
    }
  } catch (langError) {
    console.warn('Could not fetch user language preference, using default English:', langError);
  }
  
  return 'en'; // Default to English if no language found
};

// Function to send meal plan activation notification
const sendMealPlanActivationNotification = async (userCode, mealPlanName, clientId) => {
  try {
    console.log('📬 Sending meal plan activation notification...');
    
    // Get current user (dietitian) info
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Error getting current user for notification:', authError);
      return;
    }

    // Get user's language preference
    const userLanguage = await getUserLanguage(userCode);
    console.log('🌐 Detected language for notification:', userLanguage, '(type:', typeof userLanguage, ')');

    // Set notification message based on user language (only Hebrew gets Hebrew, everything else gets English)
    // This handles: 'he' = Hebrew, anything else (en, null, undefined, etc.) = English
    const notificationMessage = userLanguage === 'he' 
      ? `יש לך תפריט חדש! שאל את הצ'אט למידע נוסף.`
      : `You have a new meal plan! ask the chat for more info.`;
    
    console.log('📝 Notification message to send:', notificationMessage);

    // Add notification to user_message_queue table
    const { data, error } = await supabase
      .from('user_message_queue')
      .insert({
        user_id: clientId,
        user_code: userCode,
        message_type: 'system_reminder',
        message_content: notificationMessage,
        message_priority: 1, // High priority for meal plan notifications
        scheduled_for: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        trigger_type: 'immediate',
        context_data: {
          notification_type: 'meal_plan_activation',
          meal_plan_name: mealPlanName
        },
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding meal plan notification to user_message_queue:', error);
      throw error;
    }

    console.log('✅ Meal plan activation notification sent successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to send meal plan activation notification:', error);
    // Don't throw error to avoid breaking the main flow
    console.warn('Meal plan activation notification failed, but status was updated successfully');
  }
};

// Function to check for future meal plans and send 2-3 day advance notifications
const checkAndSendFutureMealPlanNotifications = async () => {
  try {
    console.log('🔍 Checking for future meal plans that need 2-3 day advance notifications...');
    
    // Calculate dates 2 and 3 days from now
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const twoDayTarget = twoDaysFromNow.toISOString().split('T')[0];
    
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDayTarget = threeDaysFromNow.toISOString().split('T')[0];
    
    // Find meal plans scheduled to be active in 2-3 days
    const { data: futureMealPlans, error } = await supabase
      .from('meal_plans_and_schemas')
      .select('id, user_code, meal_plan_name, active_from, status')
      .eq('status', 'scheduled')
      .in('active_from', [twoDayTarget, threeDayTarget]);
    
    if (error) {
      console.error('Error fetching future meal plans:', error);
      return;
    }
    
    if (!futureMealPlans || futureMealPlans.length === 0) {
      console.log('📅 No meal plans scheduled for activation in 2-3 days');
      return;
    }
    
    console.log(`📅 Found ${futureMealPlans.length} meal plan(s) scheduled for activation in 2-3 days`);
    
    // Send notifications for each future meal plan
    for (const mealPlan of futureMealPlans) {
      try {
        // Check if we already sent a notification for this meal plan today
        const today = new Date().toISOString().split('T')[0];
        const { data: existingNotification, error: checkError } = await supabase
          .from('user_message_queue')
          .select('id')
          .eq('user_code', mealPlan.user_code)
          .eq('message_type', 'system_reminder')
          .eq('context_data->notification_type', 'future_meal_plan_advance')
          .eq('context_data->meal_plan_name', mealPlan.meal_plan_name || 'Untitled Meal Plan')
          .gte('scheduled_for', `${today}T00:00:00.000Z`)
          .lt('scheduled_for', `${today}T23:59:59.999Z`)
          .limit(1);
        
        if (checkError) {
          console.error('Error checking existing notifications:', checkError);
          continue;
        }
        
        if (existingNotification && existingNotification.length > 0) {
          console.log(`📬 Notification already sent today for meal plan: ${mealPlan.meal_plan_name}`);
          continue;
        }
        
        // Get client ID for notification
        const { data: clientData, error: clientError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', mealPlan.user_code)
          .single();
        
        if (clientData && !clientError) {
          // Send advance notification
          await sendFutureMealPlanNotification(
            mealPlan.user_code, 
            mealPlan.meal_plan_name || 'Untitled Meal Plan', 
            clientData.id,
            mealPlan.active_from
          );
        } else {
          console.warn(`Could not find client ID for user_code: ${mealPlan.user_code}`);
        }
      } catch (notificationError) {
        console.error(`Error sending notification for meal plan ${mealPlan.id}:`, notificationError);
      }
    }
    
  } catch (error) {
    console.error('Error checking future meal plan notifications:', error);
  }
};

// Function to send 3-day advance notification
const sendFutureMealPlanNotification = async (userCode, mealPlanName, clientId, activationDate) => {
  try {
    console.log('📬 Sending 3-day advance meal plan notification...');
    
    // Get current user (dietitian) info
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Error getting current user for notification:', authError);
      return;
    }

    // Get user's language preference
    const userLanguage = await getUserLanguage(userCode);
    console.log('🌐 Detected language for future notification:', userLanguage, '(type:', typeof userLanguage, ')');

    // Set notification message based on user language (only Hebrew gets Hebrew, everything else gets English)
    // This handles: 'he' = Hebrew, anything else (en, null, undefined, etc.) = English
    const notificationMessage = userLanguage === 'he' 
      ? `יש לך תפריט חדש שמגיע בעוד כמה ימים!`
      : `You have a new meal plan coming in a couple of days!`;
    
    console.log('📝 Future notification message to send:', notificationMessage);

    // Add notification to user_message_queue table
    const { data, error } = await supabase
      .from('user_message_queue')
      .insert({
        user_id: clientId,
        user_code: userCode,
        message_type: 'system_reminder',
        message_content: notificationMessage,
        message_priority: 2, // Medium priority for advance notifications
        scheduled_for: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        trigger_type: 'immediate',
        context_data: {
          notification_type: 'future_meal_plan_advance',
          meal_plan_name: mealPlanName,
          activation_date: activationDate
        },
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding future meal plan notification to user_message_queue:', error);
      throw error;
    }

    console.log('✅ Future meal plan notification sent successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to send future meal plan notification:', error);
  }
};

const EditableTitle = ({ value, onChange, mealIndex, optionIndex }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    onChange(editValue, mealIndex, optionIndex);
    setIsEditing(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (!isEditing) {
    return (
      <h4 
        onClick={() => setIsEditing(true)}
        className="font-medium text-gray-900 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
        title="Click to edit meal name"
      >
        {value}
      </h4>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={handleKeyPress}
      className="font-medium text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 w-full"
    />
  );
};

const EditableIngredient = ({ value, onChange, mealIndex, optionIndex, ingredientIndex, translations }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [originalValue, setOriginalValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    setEditValue(value);
    setOriginalValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const fetchSuggestions = async (query) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      // Use only the external API endpoint
      const response = await fetch(`https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/suggestions?query=${encodeURIComponent(query)}`);
      
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || data || []);
      } else {
        console.error('Failed to fetch suggestions from external API:', response.status);
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setEditValue(newValue);
    setShowSuggestions(true);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Escape') {
      // Cancel editing and revert to original value
      setEditValue(originalValue);
      setIsEditing(false);
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const handleBlur = () => {
    // Always revert to original value - only database suggestions should trigger changes
    setEditValue(originalValue);
    setIsEditing(false);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSelect = async (suggestion) => {
    try {
      let updatedValues;
      
      // Check if this is from the enhanced API (MenuCreate style)
      if (suggestion.hebrew && suggestion.english) {
        const response = await fetch(`https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-nutrition?name=${encodeURIComponent(suggestion.english)}`);
        if (response.ok) {
          const nutritionData = await response.json();
          updatedValues = {
            item: suggestion.hebrew || suggestion.english,
            household_measure: suggestion.household_measure || '',
            calories: nutritionData.Energy || 0,
            protein: nutritionData.Protein || 0,
            fat: nutritionData.Total_lipid__fat_ || 0,
            carbs: nutritionData.Carbohydrate__by_difference || 0,
            'brand of pruduct': nutritionData.brand || ''
          };
        } else {
          // Fallback to basic data
          updatedValues = {
            item: suggestion.hebrew || suggestion.english,
            household_measure: suggestion.household_measure || '',
            calories: 0,
            protein: 0,
            fat: 0,
            carbs: 0,
            'brand of pruduct': ''
          };
        }
        setEditValue(suggestion.hebrew || suggestion.english);
      } else {
        // Handle original API format
        const nutritionData = {
          calories: Math.round(suggestion.Energy || 0),
          protein: Math.round(suggestion.Protein || 0),
          fat: Math.round(suggestion.Fat || 0),
          carbs: Math.round(suggestion.Carbohydrate__by_difference || 0)
        };

        updatedValues = {
          item: suggestion.name,
          household_measure: suggestion.household_measure || '',
          ...nutritionData,
          'brand of pruduct': ''
        };
        setEditValue(suggestion.name);
      }

      onChange(updatedValues, mealIndex, optionIndex, ingredientIndex);
      setShowSuggestions(false);
      setIsEditing(false);
      setSuggestions([]);
    } catch (error) {
      console.error('Error fetching nutrition data:', error);
    }
  };

  const startEditing = () => {
    setOriginalValue(value); // Store the current value as original
    setEditValue(value);
    setIsEditing(true);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  if (!isEditing) {
    return (
      <span 
        onClick={startEditing}
        className="cursor-pointer hover:bg-gray-100 px-1 rounded"
        title="Click to edit ingredient"
      >
        {value}
      </span>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        onBlur={handleBlur}
        onFocus={() => setShowSuggestions(true)}
        className="bg-white border border-gray-300 rounded px-2 py-1 text-sm min-w-[120px]"
        placeholder="Search ingredient..."
        autoFocus
      />

      {isLoading && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-64 bg-white border border-gray-300 rounded-md shadow-lg mt-1">
          {suggestions.map((suggestion, idx) => (
            <div
              key={idx}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              onClick={() => handleSelect(suggestion)}
            >
              {suggestion.hebrew && suggestion.english ? (
                <div className="flex flex-col">
                  <span className="font-medium">{suggestion.hebrew}</span>
                  <span className="text-xs text-gray-500">{suggestion.english}</span>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="font-medium">{suggestion.name}</div>
                  <div className="text-xs text-gray-500">
                    {Math.round(suggestion.Energy || 0)} {translations?.calories || 'cal'}, {Math.round(suggestion.Protein || 0)}g {translations?.protein || 'protein'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Function to filter out generic brand names
const shouldShowBrand = (brand) => {
  if (!brand || typeof brand !== 'string') return false;
  
  const normalizedBrand = brand.trim().toLowerCase();
  const genericBrands = ['fresh', 'none', 'generic', 'store brand', 'private label', 'no brand', 'unbranded'];
  
  return !genericBrands.includes(normalizedBrand) && normalizedBrand.length > 0;
};

const MenuLoad = () => {
  const [menus, setMenus] = useState([]);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [editedMenu, setEditedMenu] = useState(null);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUserCode, setFilterUserCode] = useState('all');
  const [userCodes, setUserCodes] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedMenuForStatus, setSelectedMenuForStatus] = useState(null);
  const [statusForm, setStatusForm] = useState({
    status: 'draft',
    active_from: '',
    active_until: ''
  });
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [checkingExpired, setCheckingExpired] = useState(false);
  const [expiredCheckResult, setExpiredCheckResult] = useState(null);
  const [checkingFuture, setCheckingFuture] = useState(false);
  const [futureCheckResult, setFutureCheckResult] = useState(null);
  const [generatingAlt, setGeneratingAlt] = useState({});
  const [loading, setLoading] = useState(false);
  const [userTargets, setUserTargets] = useState(null);
  const [loadingUserTargets, setLoadingUserTargets] = useState(false);
  const [deletingMenu, setDeletingMenu] = useState(null);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [shoppingList, setShoppingList] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [clientRecommendations, setClientRecommendations] = useState([]);
  const [editingRecommendation, setEditingRecommendation] = useState(null);
  const [showRecommendationDialog, setShowRecommendationDialog] = useState(false);
  const [originalMenu, setOriginalMenu] = useState(null); // Store original English menu
  const [translatedMenus, setTranslatedMenus] = useState({}); // Cache translations by language
  const [removeBrandsFromPdf, setRemoveBrandsFromPdf] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { language, translations } = useLanguage();
  const { selectedClient, clients, isLoading: clientsLoading } = useClient();

  // Convert saved menu format to editable format
  const convertToEditFormat = (savedMenu) => {
    console.log('Converting menu to edit format:', savedMenu);
    
    let meals = null;
    
    // Handle the actual database structure where meal_plan contains the menu data
    if (savedMenu.meal_plan && savedMenu.meal_plan.meals) {
      meals = savedMenu.meal_plan.meals;
    } else if (savedMenu.meals && Array.isArray(savedMenu.meals)) {
      meals = savedMenu.meals;
    }
    
    if (!meals || !Array.isArray(meals)) {
      console.error('No valid meals structure found in:', savedMenu);
      return null;
    }

    const convertedMeals = meals.map((meal, mealIndex) => {
      // Handle the user's actual database structure with main/alternative format
      const mainOption = meal.main || meal;
      const altOption = meal.alternative;
      
      const mealName = meal.meal || mainOption.meal_name || mainOption.mealName || `Meal ${mealIndex + 1}`;
      
      // Convert main option
      const convertedMain = {
        meal_title: mainOption.meal_title || mainOption.itemName || mealName,
        mealIndex,
        nutrition: {
          calories: mainOption.nutrition?.calories || mainOption.mealCalories || 0,
          protein: mainOption.nutrition?.protein || mainOption.mealProtein || 0,
          fat: mainOption.nutrition?.fat || mainOption.mealFat || 0,
          carbs: mainOption.nutrition?.carbs || mainOption.mealCarbs || 0
        },
        ingredients: (mainOption.ingredients || []).map(ing => ({
          item: ing.item || ing.ingredientName || ing.name || '',
          household_measure: ing.household_measure || ing.portionUser || ing.portion || '',
          calories: ing.calories || 0,
          protein: ing.protein || 0,
          fat: ing.fat || 0,
          carbs: ing.carbs || 0,
          'brand of pruduct': ing['brand of pruduct'] || ing.brand || ''
        }))
      };

      const result = {
        meal: mealName,
        main: convertedMain
      };

      // Convert alternative option if it exists
      if (altOption) {
        result.alternative = {
          meal_title: altOption.meal_title || altOption.itemName || `${mealName} Alternative`,
          mealIndex,
          nutrition: {
            calories: altOption.nutrition?.calories || altOption.mealCalories || 0,
            protein: altOption.nutrition?.protein || altOption.mealProtein || 0,
            fat: altOption.nutrition?.fat || altOption.mealFat || 0,
            carbs: altOption.nutrition?.carbs || altOption.mealCarbs || 0
          },
          ingredients: (altOption.ingredients || []).map(ing => ({
            item: ing.item || ing.ingredientName || ing.name || '',
            household_measure: ing.household_measure || ing.portionUser || ing.portion || '',
            calories: ing.calories || 0,
            protein: ing.protein || 0,
            fat: ing.fat || 0,
            carbs: ing.carbs || 0,
            'brand of pruduct': ing['brand of pruduct'] || ing.brand || ''
          }))
        };
      }

      // Convert additional alternatives array if it exists
      if (meal.alternatives && Array.isArray(meal.alternatives)) {
        console.log(`🔄 Converting ${meal.alternatives.length} additional alternatives for meal ${mealIndex}:`, meal.alternatives);
        result.alternatives = meal.alternatives.map((alt, altIndex) => ({
          meal_title: alt.meal_title || alt.itemName || `${mealName} Alternative ${altIndex + 2}`,
          mealIndex,
          alternativeIndex: altIndex,
          nutrition: {
            calories: alt.nutrition?.calories || alt.mealCalories || 0,
            protein: alt.nutrition?.protein || alt.mealProtein || 0,
            fat: alt.nutrition?.fat || alt.mealFat || 0,
            carbs: alt.nutrition?.carbs || alt.mealCarbs || 0
          },
          ingredients: (alt.ingredients || []).map(ing => ({
            item: ing.item || ing.ingredientName || ing.name || '',
            household_measure: ing.household_measure || ing.portionUser || ing.portion || '',
            calories: ing.calories || 0,
            protein: ing.protein || 0,
            fat: ing.fat || 0,
            carbs: ing.carbs || 0,
            'brand of pruduct': ing['brand of pruduct'] || ing.brand || ''
          }))
        }));
      }

      return result;
    });

    // Get totals from the saved menu
    const totals = savedMenu.meal_plan?.totals || savedMenu.totals || {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0
    };

    return {
      meals: convertedMeals,
      totals: totals,
      note: savedMenu.meal_plan?.note || savedMenu.note || ''
    };
  };

  // Fetch user targets from the database
  const fetchUserTargets = async (userCode) => {
    if (!userCode) {
      console.warn('No user code provided for fetchUserTargets');
      return null;
    }

    setLoadingUserTargets(true);
    setError(null);

    try {
      console.log('🔍 Testing database connectivity...');
      const { data: testData, error: testError } = await supabase
        .from('chat_users')
        .select('user_code')
        .limit(1);
      
      console.log('🔍 Database connectivity test:', { testData, testError });
      
      if (testError) {
        console.error('❌ Database connectivity issue:', testError);
        setError('Database connection issue: ' + testError.message);
        return null;
      }

      console.log('🔍 Fetching user targets for:', userCode);

      const { data, error } = await supabase
        .from('chat_users')
        .select('base_daily_total_calories, macros, region, food_allergies, food_limitations, age, gender, weight_kg, height_cm, client_preference')
        .eq('user_code', userCode)
        .single();

      console.log('📊 Database response:', { data, error });

      if (error) {
        console.error('❌ Error fetching user targets:', error);
        if (error.code === 'PGRST116') {
          // No rows returned
          console.error('❌ No user found with code:', userCode);
          setError(`No user found with code: ${userCode}. Please check if the user exists in the database.`);
        } else {
          setError('Failed to load user targets: ' + error.message);
        }
        return null;
      }

      if (!data) {
        console.error('❌ No data returned from database');
        setError('No data returned from database for user: ' + userCode);
        return null;
      }

      console.log('✅ Fetched user targets:', data);

      // Check if essential fields are missing
      const missingFields = [];
      if (!data.base_daily_total_calories) missingFields.push('base_daily_total_calories');
      if (!data.macros) missingFields.push('macros');
      
      if (missingFields.length > 0) {
        console.warn('⚠️ Missing essential fields:', missingFields);
        console.log('Available data:', data);
      }

      // Parse macros if it's a string
      let parsedMacros = data.macros;
      if (typeof parsedMacros === 'string') {
        try {
          parsedMacros = JSON.parse(parsedMacros);
        } catch (e) {
          console.warn('Failed to parse macros JSON:', e);
          parsedMacros = { protein: "150g", fat: "80g", carbs: "250g" };
        }
      }

      // Parse arrays if they're strings
      const parseArrayField = (field) => {
        if (Array.isArray(field)) return field;
        if (typeof field === 'string') {
          try {
            return JSON.parse(field);
          } catch (e) {
            return field.split(',').map(item => item.trim()).filter(Boolean);
          }
        }
        return [];
      };

      const userTargetsData = {
        calories: data.base_daily_total_calories || 2000,
        macros: {
          protein: parseFloat(parsedMacros?.protein?.replace('g', '') || '150'),
          fat: parseFloat(parsedMacros?.fat?.replace('g', '') || '80'),
          carbs: parseFloat(parsedMacros?.carbs?.replace('g', '') || '250')
        },
        region: data.region || 'israel',
        allergies: parseArrayField(data.food_allergies),
        limitations: parseArrayField(data.food_limitations),
        age: data.age,
        gender: data.gender,
        weight_kg: data.weight_kg,
        height_cm: data.height_cm,
        client_preference: parseArrayField(data.client_preference)
      };

      console.log('✅ Processed user targets:', userTargetsData);
      setUserTargets(userTargetsData);
      setError(null); // Clear any errors on success
      return userTargetsData;

    } catch (error) {
      console.error('❌ Error in fetchUserTargets:', error);
      setError('Failed to load client nutritional targets');
      return null;
    } finally {
      setLoadingUserTargets(false);
    }
  };

  // Calculate meal totals
  const calculateMainTotals = (menu) => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalFat = 0;
    let totalCarbs = 0;

    if (!menu.meals) return { calories: 0, protein: 0, fat: 0, carbs: 0 };

    menu.meals.forEach(meal => {
      if (meal.main?.nutrition) {
        totalCalories += meal.main.nutrition.calories || 0;
        totalProtein += meal.main.nutrition.protein || 0;
        totalFat += meal.main.nutrition.fat || 0;
        totalCarbs += meal.main.nutrition.carbs || 0;
      }
    });

    return {
      calories: Math.round(totalCalories),
      protein: Math.round(totalProtein),
      fat: Math.round(totalFat),
      carbs: Math.round(totalCarbs)
    };
  };

  // Generate shopping list from menu
  function generateShoppingList(menu) {
    if (!menu || !menu.meals) return [];
    const itemsMap = {};

    // Helper functions for ingredient processing
    function extractBaseIngredient(item) {
      if (!item) return '';
      // Remove brand names in parentheses and other descriptive text
      return item
        .replace(/\s*\([^)]*\)$/, '') // Remove text in parentheses at the end
        .replace(/\s*-.*$/, '') // Remove text after dash
        .replace(/\s*,.*$/, '') // Remove text after comma
        .trim();
    }

    function normalizeIngredientName(name) {
      if (!name) return '';
      return name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Process each meal
    menu.meals.forEach((meal, mealIndex) => {
      // Process main option
      if (meal.main && meal.main.ingredients) {
        meal.main.ingredients.forEach(ingredient => {
          if (!ingredient.item) return;
          
          const baseItem = extractBaseIngredient(ingredient.item);
          const normalizedName = normalizeIngredientName(baseItem);
          
          if (!itemsMap[normalizedName]) {
            itemsMap[normalizedName] = {
              name: baseItem,
              originalName: ingredient.item,
              measures: new Set(),
              meals: new Set(),
              brands: new Set()
            };
          }
          
          if (ingredient.household_measure) {
            itemsMap[normalizedName].measures.add(ingredient.household_measure);
          }
          if (ingredient['brand of pruduct']) {
            itemsMap[normalizedName].brands.add(ingredient['brand of pruduct']);
          }
          itemsMap[normalizedName].meals.add(meal.meal || `Meal ${mealIndex + 1}`);
        });
      }

      // Process alternative option
      if (meal.alternative && meal.alternative.ingredients) {
        meal.alternative.ingredients.forEach(ingredient => {
          if (!ingredient.item) return;
          
          const baseItem = extractBaseIngredient(ingredient.item);
          const normalizedName = normalizeIngredientName(baseItem);
          
          if (!itemsMap[normalizedName]) {
            itemsMap[normalizedName] = {
              name: baseItem,
              originalName: ingredient.item,
              measures: new Set(),
              meals: new Set(),
              brands: new Set()
            };
          }
          
          if (ingredient.household_measure) {
            itemsMap[normalizedName].measures.add(ingredient.household_measure);
          }
          if (ingredient['brand of pruduct']) {
            itemsMap[normalizedName].brands.add(ingredient['brand of pruduct']);
          }
          itemsMap[normalizedName].meals.add(meal.meal || `Meal ${mealIndex + 1}`);
        });
      }

      // Process additional alternatives
      if (meal.alternatives && Array.isArray(meal.alternatives)) {
        meal.alternatives.forEach(alt => {
          if (alt.ingredients) {
            alt.ingredients.forEach(ingredient => {
              if (!ingredient.item) return;
              
              const baseItem = extractBaseIngredient(ingredient.item);
              const normalizedName = normalizeIngredientName(baseItem);
              
              if (!itemsMap[normalizedName]) {
                itemsMap[normalizedName] = {
                  name: baseItem,
                  originalName: ingredient.item,
                  measures: new Set(),
                  meals: new Set(),
                  brands: new Set()
                };
              }
              
              if (ingredient.household_measure) {
                itemsMap[normalizedName].measures.add(ingredient.household_measure);
              }
              if (ingredient['brand of pruduct']) {
                itemsMap[normalizedName].brands.add(ingredient['brand of pruduct']);
              }
              itemsMap[normalizedName].meals.add(meal.meal || `Meal ${mealIndex + 1}`);
            });
          }
        });
      }
    });

    // Convert to array and sort
    return Object.values(itemsMap)
      .map(item => ({
        name: item.name,
        originalName: item.originalName,
        measures: Array.from(item.measures).join(', '),
        meals: Array.from(item.meals).join(', '),
        brands: Array.from(item.brands).filter(Boolean).join(', ')
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Load client recommendations from chat_users table
  const fetchClientRecommendations = async (userCode) => {
    if (!userCode) {
      console.log('⚠️ No user code provided for client recommendations');
      setClientRecommendations([]);
      return [];
    }

    try {
      console.log('📋 Fetching client recommendations for user:', userCode);

      const { data: userData, error } = await supabase
        .from('chat_users')
        .select('recommendations')
        .eq('user_code', userCode)
        .single();

      if (error) {
        console.error('❌ Error fetching client recommendations:', error);
        setClientRecommendations([]);
        return [];
      }

      if (userData && userData.recommendations) {
        let recommendations = userData.recommendations;

        // Parse recommendations if they're stored as a string
        if (typeof recommendations === 'string') {
          try {
            recommendations = JSON.parse(recommendations);
          } catch (e) {
            console.warn('Failed to parse recommendations as JSON:', e);
            recommendations = {};
          }
        }

        console.log('📋 Parsed recommendations:', recommendations);
        console.log('📋 Recommendations type:', typeof recommendations);
        console.log('📋 Is array:', Array.isArray(recommendations));
        console.log('📋 Recommendations keys:', typeof recommendations === 'object' ? Object.keys(recommendations) : 'N/A');

        let clientRecs = [];

        if (Array.isArray(recommendations)) {
          clientRecs = recommendations.map((rec, index) => {
            if (typeof rec === 'object' && rec !== null) {
              // Handle object recommendations with better content extraction
              let content = '';
              if (rec.content) {
                content = rec.content;
              } else if (rec.text) {
                content = rec.text;
              } else if (rec.recommendation) {
                content = rec.recommendation;
              } else if (rec.description) {
                content = rec.description;
              } else if (rec.message) {
                content = rec.message;
              } else {
                // If no recognizable text field, format the object nicely
                const keys = Object.keys(rec).filter(key => key !== 'id' && key !== 'category' && key !== 'title' && key !== 'priority');
                if (keys.length > 0) {
                  content = keys.map(key => `• ${key.charAt(0).toUpperCase() + key.slice(1)}: ${rec[key]}`).join('\n');
                } else {
                  content = JSON.stringify(rec, null, 2);
                }
              }

              return {
                id: rec.id || `client-${index}`,
                category: rec.category || 'general',
                title: rec.title || `Recommendation ${index + 1}`,
                content: content,
                priority: rec.priority || 'medium',
                isClientRecommendation: true
              };
            } else {
              return {
                id: `client-${index}`,
                category: 'general',
                title: `Recommendation ${index + 1}`,
                content: String(rec),
                priority: 'medium',
                isClientRecommendation: true
              };
            }
          });
        } else if (typeof recommendations === 'object' && recommendations !== null) {
          clientRecs = Object.entries(recommendations).map(([category, content], index) => {
            // Handle different content types
            let processedContent = '';
            if (typeof content === 'string') {
              processedContent = content;
            } else if (typeof content === 'object' && content !== null) {
              // If content is an object, try to extract meaningful text
              if (content.text) {
                processedContent = content.text;
              } else if (content.content) {
                processedContent = content.content;
              } else if (content.recommendation) {
                processedContent = content.recommendation;
              } else if (content.description) {
                processedContent = content.description;
              } else {
                // If it's an object with no recognizable text fields, format it nicely
                const keys = Object.keys(content);
                if (keys.length > 0) {
                  processedContent = keys.map(key => `• ${key.charAt(0).toUpperCase() + key.slice(1)}: ${content[key]}`).join('\n');
                } else {
                  processedContent = JSON.stringify(content, null, 2);
                }
              }
            } else {
              processedContent = String(content);
            }

            return {
              id: `client-${category}-${index}`,
              category: category,
              title: category.charAt(0).toUpperCase() + category.slice(1),
              content: processedContent,
              priority: 'medium',
              isClientRecommendation: true
            };
          });
        }

        console.log('✅ Loaded client recommendations:', clientRecs);
        setClientRecommendations(clientRecs);
        return clientRecs;
      } else {
        console.log('ℹ️ No recommendations found for user:', userCode);
        setClientRecommendations([]);
        return [];
      }
    } catch (err) {
      console.error('❌ Error fetching client recommendations:', err);
      setClientRecommendations([]);
      return [];
    }
  };

  // Load saved menus
  const loadMenus = useCallback(async () => {
    if (profileLoading) {
      console.log('⏳ Profile loading, skipping menu load...');
      return;
    }

    if (!userProfile) {
      console.warn('⚠️ No user profile available, cannot load menus');
      return;
    }

    if (clientsLoading) {
      console.log('⏳ Clients still loading, delaying menu load...');
      return;
    }

    setLoadingMenus(true);
    setError(null);
    try {
      // First, check and update any expired menus
      await checkAndUpdateExpiredMenus();
      
      const isSysAdmin = userProfile.role === 'sys_admin';
      let accessibleUserCodes = null;
      if (!isSysAdmin) {
        accessibleUserCodes = Array.isArray(clients)
          ? Array.from(new Set(clients.map((client) => client.user_code).filter(Boolean)))
          : [];

        if (!accessibleUserCodes || accessibleUserCodes.length === 0) {
          console.log('🔒 No accessible clients for current user, skipping menu fetch.');
          setMenus([]);
          setUserCodes([]);
          return;
        }
      }

      let loadedMenus = [];
      try {
        const filterParams = {
          record_type: 'meal_plan',
          ...(accessibleUserCodes ? { user_code: accessibleUserCodes } : {})
        };
        loadedMenus = await Menu.filter(filterParams, '-created_at');
      } catch (fetchError) {
        console.error("Error loading menus:", fetchError);
        const allMenus = await Menu.list();
        loadedMenus = allMenus.filter(menu => 
          menu.record_type === 'meal_plan'
        );
        if (accessibleUserCodes) {
          const allowedSet = new Set(accessibleUserCodes);
          loadedMenus = loadedMenus.filter(menu => allowedSet.has(menu.user_code));
        }
      }
      
      setMenus(loadedMenus);
      
      const uniqueUserCodes = [...new Set(loadedMenus.map(menu => menu.user_code).filter(Boolean))];
      setUserCodes(uniqueUserCodes);
    } catch (error) {
      console.error("Error loading menus:", error);
      setError("Failed to load menus. Please check your connection and try again.");
    } finally {
      setLoadingMenus(false);
    }
  }, [clients, clientsLoading, profileLoading, userProfile]);

  useEffect(() => {
    loadMenus();
    // Note: Future meal plan notifications are now only sent via manual check button
    // to prevent duplicate notifications on page refresh
  }, [loadMenus]);
  useEffect(() => {
    let isMounted = true;
    const fetchUserProfile = async () => {
      try {
        setProfileLoading(true);
        const profile = await getMyProfile();
        if (isMounted) {
          setUserProfile(profile);
        }
      } catch (profileError) {
        console.error('❌ Failed to load user profile:', profileError);
        if (isMounted) {
          setError('Failed to load user profile. Please refresh the page.');
        }
      } finally {
        if (isMounted) {
          setProfileLoading(false);
        }
      }
    };

    fetchUserProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  // Generate shopping list when editedMenu changes
  useEffect(() => {
    if (editedMenu) {
      setShoppingList(generateShoppingList(editedMenu));
    }
  }, [editedMenu]);

  // Fetch client recommendations when a menu is selected
  useEffect(() => {
    if (selectedMenu && selectedMenu.user_code) {
      fetchClientRecommendations(selectedMenu.user_code);
    }
  }, [selectedMenu]);

  // Handle URL parameters to automatically load a specific meal plan
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const menuId = urlParams.get('menuId');
    
    if (menuId && menus.length > 0 && !selectedMenu) {
      const menuToLoad = menus.find(menu => menu.id === menuId);
      if (menuToLoad) {
        console.log('🎯 Auto-loading menu from URL parameter:', menuToLoad);
        handleMenuSelect(menuToLoad);
      }
    }
  }, [menus, location.search, selectedMenu]);

  const filteredMenus = menus.filter(menu => {
    // If a client is selected globally, filter by that client
    if (selectedClient) {
      return menu.user_code === selectedClient.user_code;
    }
    
    // Otherwise, use the existing search and filter logic
    const matchesSearch = 
      (menu.meal_plan_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
       menu.user_code?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesUserCode = filterUserCode === 'all' || menu.user_code === filterUserCode;
    
    return matchesSearch && matchesUserCode;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'published':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'scheduled':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleMenuSelect = (menu) => {
    console.log('Selected menu:', menu);
    setSelectedMenu(menu);
    
    const convertedMenu = convertToEditFormat(menu);
    if (convertedMenu) {
      // Store original menu for English mode restoration
      setOriginalMenu(convertedMenu);
      // Clear previous translations cache
      setTranslatedMenus({});
      
      setEditedMenu(convertedMenu);
      setIsEditing(true);
      
      // Fetch user targets for the selected menu's user
      if (menu.user_code) {
        fetchUserTargets(menu.user_code);
      }
    } else {
      setError('Failed to load menu data');
    }
  };

  const handleBackToList = () => {
    setSelectedMenu(null);
    setEditedMenu(null);
    setIsEditing(false);
    setError(null);
  };

  const handleTitleChange = (newTitle, mealIndex, optionIndex) => {
    setEditedMenu(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const option = optionIndex === 'main' ? updated.meals[mealIndex].main : updated.meals[mealIndex].alternative;
      option.meal_title = newTitle;
      updated.meals[mealIndex].meal = newTitle;
      updated.totals = calculateMainTotals(updated);
      return updated;
    });
  };

  const handleIngredientChange = (newValues, mealIndex, optionIndex, ingredientIndex) => {
    setEditedMenu(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const option = optionIndex === 'main' ? updated.meals[mealIndex].main : updated.meals[mealIndex].alternative;
      
      if (option.ingredients && option.ingredients[ingredientIndex]) {
        Object.assign(option.ingredients[ingredientIndex], newValues);
        
        if (optionIndex === 'main') {
          const totalNutrition = option.ingredients.reduce((acc, ing) => ({
            calories: acc.calories + (ing.calories || 0),
            protein: acc.protein + (ing.protein || 0),
            fat: acc.fat + (ing.fat || 0),
            carbs: acc.carbs + (ing.carbs || 0)
          }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
          
          option.nutrition = totalNutrition;
          updated.totals = calculateMainTotals(updated);
        }
      }
      
      return updated;
    });
  };

  const handleMakeAlternativeMain = (mealIndex, alternativeIndex = null) => {
    setEditedMenu(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const meal = updated.meals[mealIndex];
      
      if (alternativeIndex !== null) {
        // Handle additional alternatives array
        const alternative = meal.alternatives[alternativeIndex];
        const currentMain = meal.main;
        
        // Swap main with the selected alternative
        meal.main = alternative;
        meal.alternatives[alternativeIndex] = currentMain;
      } else {
        // Handle main and alternative sections
        const currentMain = meal.main;
        const currentAlternative = meal.alternative;
        
        // Swap main and alternative
        meal.main = currentAlternative;
        meal.alternative = currentMain;
      }

      // Recalculate daily totals
      updated.totals = calculateMainTotals(updated);

      return updated;
    });
  };

  const handleDeleteIngredient = (mealIndex, optionIndex, ingredientIndex, alternativeIndex = null) => {
    setEditedMenu(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const meal = updated.meals[mealIndex];
      
      let option;
      if (alternativeIndex !== null) {
        // Handle additional alternatives array
        option = meal.alternatives[alternativeIndex];
      } else {
        // Handle main and alternative sections
        option = optionIndex === 'main' ? meal.main : meal.alternative;
      }

      // Remove the ingredient
      option.ingredients.splice(ingredientIndex, 1);

      // Recalculate nutrition totals from remaining ingredients
      const newNutrition = option.ingredients.reduce(
        (acc, ing) => {
          acc.calories += Number(ing.calories) || 0;
          acc.protein += Number(ing.protein) || 0;
          acc.fat += Number(ing.fat) || 0;
          acc.carbs += Number(ing.carbs) || 0;
          return acc;
        },
        { calories: 0, protein: 0, fat: 0, carbs: 0 }
      );

      // Update option nutrition
      option.nutrition = {
        calories: Math.round(newNutrition.calories),
        protein: Math.round(newNutrition.protein),
        fat: Math.round(newNutrition.fat),
        carbs: Math.round(newNutrition.carbs),
      };

      // Recalculate daily totals
      updated.totals = calculateMainTotals(updated);

      return updated;
    });
  };

  async function generateAlternativeMeal(main, alternative) {
    const response = await fetch('https://dietitian-be.azurewebsites.net/api/generate-alternative-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        main,
        alternative,
        user_code: editedMenu.user_code
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate alternative meal');
    }
    return await response.json();
  }

  const handleAddAlternative = async (mealIdx) => {
    setGeneratingAlt((prev) => ({ ...prev, [mealIdx]: true }));
    try {
      const meal = editedMenu.meals[mealIdx];
      if (!meal || !meal.main || !meal.alternative) return;
      
      const newAlt = await generateAlternativeMeal(meal.main, meal.alternative);
      
      // If we're in Hebrew mode, translate the new alternative immediately
      let translatedAlt = newAlt;
      if (language === 'he') {
        try {
          console.log('🌐 Translating new alternative meal to Hebrew...');
          
          // Create a proper menu structure for translation
          const menuForTranslation = {
            meals: [{
              meal: newAlt.meal || 'Alternative',
              main: newAlt,
              alternative: newAlt
            }]
          };
          
          const translatedMenu = await translateMenu(menuForTranslation, 'he');
          translatedAlt = translatedMenu.meals[0].main; // Extract the translated meal
          console.log('✅ New alternative translated to Hebrew:', translatedAlt);
        } catch (translationError) {
          console.error('❌ Failed to translate new alternative:', translationError);
          // Fall back to original English version
          translatedAlt = newAlt;
        }
      }
      
      // Update the edited menu with the new alternative
      setEditedMenu((prevMenu) => {
        const updated = { ...prevMenu };
        if (!updated.meals[mealIdx].alternatives) updated.meals[mealIdx].alternatives = [];
        updated.meals[mealIdx].alternatives.push(translatedAlt);
        return { ...updated };
      });
    } catch (err) {
      alert(err.message || 'Failed to generate alternative meal');
    } finally {
      setGeneratingAlt((prev) => ({ ...prev, [mealIdx]: false }));
    }
  };

  const handleSave = async () => {
    if (!editedMenu || !selectedMenu) {
      setError('No menu to save');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setError('You must be logged in to save menus');
        return;
      }
      
      const updatedMenu = {
        id: selectedMenu.id,
        meal_plan_name: editedMenu.meal_plan_name || 'Updated Meal Plan',
        user_code: editedMenu.user_code,
        meal_plan: {
          note: editedMenu.note || '',
          meals: editedMenu.meals.map(meal => {
            const mealData = {
              meal: meal.meal,
              main: {
                meal_name: meal.meal,
                meal_title: meal.main.meal_title,
                nutrition: {
                  calories: Math.round(meal.main.nutrition.calories || 0),
                  protein: Math.round(meal.main.nutrition.protein || 0),
                  fat: Math.round(meal.main.nutrition.fat || 0),
                  carbs: Math.round(meal.main.nutrition.carbs || 0)
                },
                ingredients: meal.main.ingredients.map(ing => ({
                  item: ing.item,
                  household_measure: ing.household_measure,
                  calories: Math.round(ing.calories || 0),
                  protein: Math.round(ing.protein || 0),
                  fat: Math.round(ing.fat || 0),
                  carbs: Math.round(ing.carbs || 0),
                  'brand of pruduct': ing['brand of pruduct'] || '',
                  UPC: ing.UPC || null
                }))
              }
            };

            // Add alternative if it exists
            if (meal.alternative) {
              mealData.alternative = {
                meal_name: meal.meal,
                meal_title: meal.alternative.meal_title,
                nutrition: {
                  calories: Math.round(meal.alternative.nutrition.calories || 0),
                  protein: Math.round(meal.alternative.nutrition.protein || 0),
                  fat: Math.round(meal.alternative.nutrition.fat || 0),
                  carbs: Math.round(meal.alternative.nutrition.carbs || 0)
                },
                ingredients: meal.alternative.ingredients.map(ing => ({
                  item: ing.item,
                  household_measure: ing.household_measure,
                  calories: Math.round(ing.calories || 0),
                  protein: Math.round(ing.protein || 0),
                  fat: Math.round(ing.fat || 0),
                  carbs: Math.round(ing.carbs || 0),
                  'brand of pruduct': ing['brand of pruduct'] || '',
                  UPC: ing.UPC || null
                }))
              };
            }

            // Add additional alternatives array if it exists
            if (meal.alternatives && meal.alternatives.length > 0) {
              mealData.alternatives = meal.alternatives.map(alt => ({
                meal_name: meal.meal,
                meal_title: alt.meal_title,
                nutrition: {
                  calories: Math.round(alt.nutrition.calories || 0),
                  protein: Math.round(alt.nutrition.protein || 0),
                  fat: Math.round(alt.nutrition.fat || 0),
                  carbs: Math.round(alt.nutrition.carbs || 0)
                },
                ingredients: alt.ingredients.map(ing => ({
                  item: ing.item,
                  household_measure: ing.household_measure,
                  calories: Math.round(ing.calories || 0),
                  protein: Math.round(ing.protein || 0),
                  fat: Math.round(ing.fat || 0),
                  carbs: Math.round(ing.carbs || 0),
                  'brand of pruduct': ing['brand of pruduct'] || '',
                  UPC: ing.UPC || null
                }))
              }));
            }

            return mealData;
          }),
          totals: {
            calories: Math.round(editedMenu.totals.calories || 0),
            protein: Math.round(editedMenu.totals.protein || 0),
            fat: Math.round(editedMenu.totals.fat || 0),
            carbs: Math.round(editedMenu.totals.carbs || 0)
          }
        },
        daily_total_calories: Math.round(editedMenu.totals.calories || 0),
        macros_target: {
          protein: Math.round(editedMenu.totals.protein || 0),
          fat: Math.round(editedMenu.totals.fat || 0),
          carbs: Math.round(editedMenu.totals.carbs || 0)
        },
        status: 'draft',
        dietitian_id: user.id
      };

      const result = await Menu.update(selectedMenu.id, updatedMenu);
      console.log('✅ Menu updated successfully:', result);
      
      alert('Menu updated successfully!');
      handleBackToList();
      loadMenus(); // Refresh the list
      
    } catch (error) {
      console.error('Error saving menu:', error);
      setError('Failed to save menu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (menu) => {
    setSelectedMenuForStatus(menu);
    setStatusForm({
      status: menu.status || 'draft',
      active_from: menu.active_from ? new Date(menu.active_from).toISOString().split('T')[0] : '',
      active_until: menu.active_until ? new Date(menu.active_until).toISOString().split('T')[0] : ''
    });
    setShowStatusModal(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedMenuForStatus) return;

    try {
      setUpdatingStatus(true);
      setError(null);

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setError('You must be logged in to update menu status');
        return;
      }

      const updateData = {
        status: statusForm.status,
        user_code: selectedMenuForStatus.user_code, // Include user_code for backend validation
        ...(statusForm.active_from && { active_from: statusForm.active_from }),
        ...(statusForm.active_until && { active_until: statusForm.active_until })
      };

      // If status is being set to draft or expired, clear active dates
      if (statusForm.status === 'draft' || statusForm.status === 'expired') {
        updateData.active_from = null;
        updateData.active_until = null;
      }
      
      // If status is being set to active without an active_until date, set it to far future (2099-01-01)
      if (statusForm.status === 'active' && !statusForm.active_until) {
        updateData.active_until = '2099-01-01';
      }
      
      // If status is being set to scheduled, require active_from date
      if (statusForm.status === 'scheduled' && !statusForm.active_from) {
        setError('Scheduled status requires an activation date');
        return;
      }

      // Deactivation of other active menus (if needed) is handled in the API layer

      const result = await Menu.update(selectedMenuForStatus.id, updateData);
      console.log('✅ Menu status updated successfully:', result);
      
      // If status is being set to 'active', add to the second Supabase table
      if (statusForm.status === 'active') {
        try {
          // Get the meal plan data from the selected menu
          const mealPlanData = selectedMenuForStatus.meal_plan;
          
          if (mealPlanData) {
            // Insert into the second Supabase table
            const { data: secondTableData, error: secondTableError } = await secondSupabase
              .from('meal_plans')
              .insert({
                user_code: selectedMenuForStatus.user_code,
                meal_plan: mealPlanData
              });

            if (secondTableError) {
              console.error('Error adding to second table:', secondTableError);
              // Don't fail the entire operation, just log the error
              console.warn('Failed to add meal plan to second table, but status was updated successfully');
            } else {
              console.log('✅ Meal plan added to second table successfully:', secondTableData);
            }
          } else {
            console.warn('No meal plan data found in selected menu');
          }
        } catch (secondTableError) {
          console.error('Error adding to second table:', secondTableError);
          // Don't fail the entire operation, just log the error
          console.warn('Failed to add meal plan to second table, but status was updated successfully');
        }
      }
      
      // Send notification if meal plan was activated
      if (statusForm.status === 'active') {
        try {
          const mealPlanName = selectedMenuForStatus.meal_plan_name || 'Untitled Meal Plan';
          const userCode = selectedMenuForStatus.user_code;
          
          // Get client ID for notification
          const { data: clientData, error: clientError } = await supabase
            .from('chat_users')
            .select('id')
            .eq('user_code', userCode)
            .single();
          
          if (clientData && !clientError) {
            await sendMealPlanActivationNotification(userCode, mealPlanName, clientData.id);
          } else {
            console.warn('Could not find client ID for notification, but meal plan was activated successfully');
          }
        } catch (notificationError) {
          console.error('Notification error (non-blocking):', notificationError);
        }
      }
      
      alert('Menu status updated successfully!');
      setShowStatusModal(false);
      setSelectedMenuForStatus(null);
      loadMenus(); // Refresh the list
      
    } catch (error) {
      console.error('Error updating menu status:', error);
      setError('Failed to update menu status: ' + error.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteMenu = async (menu) => {
    const menuName = menu.meal_plan_name || 'Untitled Menu';
    const userCode = menu.user_code || 'Unknown Client';
    
    if (!window.confirm(`${translations.confirmDeleteMenu || 'Are you sure you want to delete'} "${menuName}" ${translations.forClient || 'for client'} ${userCode}? ${translations.deleteWarning || 'This action cannot be undone.'}`)) {
      return;
    }
    
    setDeletingMenu(menu.id);
    setError(null);
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setError('You must be logged in to delete menus');
        return;
      }

      await Menu.delete(menu.id);
      console.log('✅ Menu deleted successfully:', menu.id);
      
      // Show success message
      alert(`${translations.menuDeleted || 'Menu deleted successfully'}: ${menuName}`);
      
      // Refresh the menu list
      loadMenus();
      
    } catch (error) {
      console.error('Error deleting menu:', error);
      setError(`${translations.failedToDeleteMenu || 'Failed to delete menu'}: ${error.message}`);
    } finally {
      setDeletingMenu(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Translation function
  async function translateMenu(menu, targetLang = 'he') {
    const response = await fetch('https://dietitian-be.azurewebsites.net/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu, targetLang }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Translation failed');
    }
    return await response.json();
  }

  // PDF download function
  async function downloadPdf(menu, version = 'portrait') {
    try {
      // Create HTML content for the PDF with specified version
      const htmlContent = generateMenuHtml(menu, version, removeBrandsFromPdf);
      
      // Create a blob from the HTML content
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      // Open in new window for printing
      const printWindow = window.open(url, '_blank');
      
      // Wait for the window to load, then trigger print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          // Clean up after printing
          setTimeout(() => {
            printWindow.close();
            URL.revokeObjectURL(url);
          }, 1000);
        }, 500);
      };
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  }

  function generateMenuHtml(menu, version = 'portrait', removeBrands = false) {
    // Get current date in Hebrew
    const today = new Date();
    const hebrewDate = today.toLocaleDateString('he-IL', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const totals = menu.totals || calculateMainTotals(menu);
    const userName = selectedClient?.full_name || 'Client';
    
    // Detect if menu contains Hebrew text
    const containsHebrew = (text) => {
      if (!text) return false;
      return /[\u0590-\u05FF]/.test(text);
    };
    
    const hasHebrewContent = menu.meals?.some(meal => 
      containsHebrew(meal.meal) ||
      containsHebrew(meal.main?.meal_title) ||
      containsHebrew(meal.alternative?.meal_title) ||
      meal.main?.ingredients?.some(ing => containsHebrew(ing.item)) ||
      meal.alternative?.ingredients?.some(ing => containsHebrew(ing.item))
    );
    
    const htmlDir = hasHebrewContent ? 'rtl' : 'ltr';
    const htmlLang = hasHebrewContent ? 'he' : 'en';
    
    return `
<!DOCTYPE html>
<html lang="${htmlLang}" dir="${htmlDir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BetterChoice - תפריט אישי</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&family=Inter:wght@400;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Noto Sans Hebrew', 'Inter', sans-serif;
            line-height: 1.6;
            color: #333;
            background: white;
            margin: 0;
            padding: 0;
        }
        
        .page {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background: #e8f5e8;
            padding: 20px;
            text-align: center;
        }
        
        .logo {
            width: 50px;
            height: 50px;
            background: #4CAF50;
            border-radius: 50%;
            margin: 0 auto 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 20px;
        }
        
        .main-title {
            font-size: 28px;
            font-weight: 700;
            color: #333;
            margin-bottom: 8px;
        }
        
        .user-name {
            font-size: 20px;
            font-weight: 600;
            color: #4CAF50;
            margin-bottom: 8px;
        }
        
        .date {
            font-size: 16px;
            font-weight: 500;
            color: #666;
            margin-bottom: 8px;
        }
        
        .content {
            flex: 1;
            padding: 20px;
        }
        
        .meal-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
        }
        
        .meal-title {
            font-size: 18px;
            font-weight: 700;
            color: #666;
            text-align: right;
            margin-bottom: 12px;
            padding-bottom: 4px;
            border-bottom: 2px dashed #ddd;
        }
        
        .meal-subtitle {
            font-size: 14px;
            font-weight: 600;
            color: #4CAF50;
            text-align: right;
            margin-bottom: 8px;
        }
        
        .meal-options {
            margin-right: 20px;
        }
        
        .meal-option {
            margin-bottom: 8px;
            font-size: 14px;
            line-height: 1.4;
            padding-left: 15px;
            padding-right: 15px;
            position: relative;
        }
        
        .meal-option::before {
            content: '•';
            color: #4CAF50;
            font-weight: bold;
            position: absolute;
            left: 0;
            top: 0;
            font-size: 16px;
        }
        
        [dir="rtl"] .meal-option {
            padding-left: 0;
            padding-right: 15px;
        }
        
        [dir="rtl"] .meal-option::before {
            left: auto;
            right: 0;
        }
        
        .option-text {
            color: #333;
        }
        
        .meal-dish-title {
            font-weight: 600;
            color: #2d5016;
            margin-bottom: 4px;
            font-size: 14px;
        }
        
        .highlighted {
            text-decoration: underline;
            text-decoration-color: #ff4444;
            text-decoration-thickness: 2px;
        }
        
        .bold-note {
            font-weight: 700;
            color: #333;
        }
        
        .footer {
            background: #e8f5e8;
            padding: 15px;
            text-align: right;
        }
        
        .contact-info {
            color: white;
            font-size: 14px;
            line-height: 1.8;
        }
        
        .contact-info div {
            margin-bottom: 5px;
        }
        
        @media print {
            /* ${version === 'landscape' ? 'Set to A4 landscape with 10mm margins' : 'Disable browser headers and footers'} */
            @page {
                margin: ${version === 'landscape' ? '10mm' : '0'};
                size: A4${version === 'landscape' ? ' landscape' : ''};
            }
            
            body {
                font-size: 12px;
                margin: 0;
                padding: 0;
            }
            
            ${version === 'portrait' ? `
            /* Portrait-specific: Footer at bottom of last page */
            .page {
                display: block !important;
                min-height: auto !important;
            }
            
            .content {
                display: block !important;
                page-break-after: auto;
            }
            
            .footer {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                width: 100%;
                z-index: 1000;
            }
            ` : ''}
            
            .header {
                padding: 20px;
            }
            
            .logo {
                width: 50px;
                height: 50px;
                font-size: 20px;
                margin-bottom: 15px;
            }
            
            .main-title {
                font-size: 28px;
                margin-bottom: 8px;
            }
            
            .user-name {
                font-size: 20px;
                margin-bottom: 8px;
            }
            
            .date {
                font-size: 16px;
                margin-bottom: 8px;
            }
            
            .content {
                padding: ${version === 'landscape' ? '6px 15px' : '20px'};
                ${version === 'landscape' ? 'display: flex; flex-wrap: wrap; gap: 12px;' : ''}
            }
            
            .meal-title {
                font-size: 18px;
                margin-bottom: 12px;
            }
            
            .meal-subtitle {
                font-size: 14px;
                margin-bottom: 8px;
            }
            
            .meal-option {
                font-size: 14px;
                margin-bottom: 6px;
            }
            
            .footer {
                padding: 15px;
            }
            
            .contact-info {
                font-size: 12px;
            }
            
            /* Keep meal sections together but allow natural flow */
            .meal-section {
                page-break-inside: avoid;
                break-inside: avoid;
                ${version === 'landscape' ? 'flex: 1 1 calc(50% - 6px); min-width: 280px; margin-bottom: 12px;' : ''}
            }
            
            ${version === 'landscape' ? `
            /* Landscape-specific styles */
            body {
                font-size: 11px !important;
            }
            
            .header {
                padding: 3px 15px !important;
            }
            
            .logo {
                width: 24px !important;
                height: 24px !important;
                font-size: 12px !important;
                margin-bottom: 2px !important;
            }
            
            .main-title {
                font-size: 14px !important;
                margin-bottom: 1px !important;
            }
            
            .user-name {
                font-size: 13px !important;
                margin-bottom: 1px !important;
            }
            
            .date {
                font-size: 10px !important;
                margin-bottom: 1px !important;
            }
            
            .meal-title {
                font-size: 16px !important;
                margin-bottom: 6px !important;
                padding: 4px 8px !important;
            }
            
            .meal-subtitle {
                font-size: 12px !important;
                margin-bottom: 4px !important;
            }
            
            .meal-option {
                font-size: 11px !important;
                margin-bottom: 4px !important;
                padding-left: 12px !important;
                padding-right: 12px !important;
            }
            
            [dir="rtl"] .meal-option {
                padding-left: 0 !important;
                padding-right: 12px !important;
            }
            
            [dir="rtl"] .meal-option::before {
                left: auto !important;
                right: 0 !important;
            }
            
            .meal-dish-title {
                font-size: 12px !important;
                margin-bottom: 2px !important;
            }
            
            .footer {
                padding: 2px 15px !important;
                font-size: 8px !important;
            }
            
            .contact-info {
                font-size: 8px !important;
                line-height: 1.1 !important;
            }
            
            .contact-info div {
                margin-bottom: 1px !important;
            }
            
            /* Fallback to three columns if needed for many meals */
            @supports (display: grid) {
                .content {
                    display: grid !important;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)) !important;
                    gap: 15px !important;
                }
                
                .meal-section {
                    flex: none !important;
                }
            }
            ` : ''}
        }
        
        /* RTL Support */
        [dir="rtl"] {
            text-align: right;
        }
        
        [dir="rtl"] .meal-options {
            margin-right: 0;
            margin-left: 20px;
        }
    </style>
</head>
<body>
    <div class="page">
        <div class="header">
            <div class="logo">BC</div>
            <div class="main-title">תפריט אישי</div>
            <div class="user-name">${userName}</div>
            <div class="date">${hebrewDate}</div>
            </div>
        
        <div class="content">
            ${menu.meals ? menu.meals.map((meal, index) => {
                // Get meal name in Hebrew or English
                const mealName = meal.meal || `Meal ${index + 1}`;
                const isSnack = mealName.toLowerCase().includes('snack') || mealName.toLowerCase().includes('ביניים');
                
                return `
                    <div class="meal-section">
                        <h2 class="meal-title">${mealName}</h2>
                        ${isSnack ? '<div class="meal-subtitle">לבחירתך מתי</div>' : ''}
                        
                        <div class="meal-options">
                            ${(() => {
                                let options = [];
                                
                                // Add main meal
                                if (meal.main && meal.main.ingredients && meal.main.ingredients.length > 0) {
                                    const mainIngredients = meal.main.ingredients.map(ing => {
                                        let text = ing.item || 'Ingredient';
                                        // Conditionally remove brand information in parentheses from PDF display
                                        if (removeBrands) {
                                            text = text.replace(/\s*\([^)]*\)$/, '');
                                        } else {
                                            // Remove generic brand names even when not removing all brands
                                            const brandMatch = text.match(/\s*\(([^)]*)\)$/);
                                            if (brandMatch && !shouldShowBrand(brandMatch[1])) {
                                                text = text.replace(/\s*\([^)]*\)$/, '');
                                            }
                                        }
                                        // Highlight specific words (brands, types, etc.)
                                        text = text.replace(/\b(וגן|קוביה|בישבת|טורטיות|סולוג|מולך|אלשבע|בולים)\b/g, '<span class="highlighted">$1</span>');
                                        
                                        // Add household measure if available
                                        if (ing.household_measure) {
                                            text += ` (${ing.household_measure})`;
                                        }
                                        
                                        return text;
                                    }).join(', ');
                                    
                                    // Include meal title if available
                                    const mainMealTitle = meal.main.meal_title || '';
                                    const mealTitleText = mainMealTitle ? `<div class="meal-dish-title">${mainMealTitle}</div>` : '';
                                    options.push(`<div class="meal-option"><span class="option-text">${mealTitleText}${mainIngredients}</span></div>`);
                                }
                                
                                // Add alternative meal
                                if (meal.alternative && meal.alternative.ingredients && meal.alternative.ingredients.length > 0) {
                                    const altIngredients = meal.alternative.ingredients.map(ing => {
                                        let text = ing.item || 'Ingredient';
                                        // Conditionally remove brand information in parentheses from PDF display
                                        if (removeBrands) {
                                            text = text.replace(/\s*\([^)]*\)$/, '');
                                        } else {
                                            // Remove generic brand names even when not removing all brands
                                            const brandMatch = text.match(/\s*\(([^)]*)\)$/);
                                            if (brandMatch && !shouldShowBrand(brandMatch[1])) {
                                                text = text.replace(/\s*\([^)]*\)$/, '');
                                            }
                                        }
                                        text = text.replace(/\b(וגן|קוביה|בישבת|טורטיות|סולוג|מולך|אלשבע|בולים)\b/g, '<span class="highlighted">$1</span>');
                                        
                                        // Add household measure if available
                                        if (ing.household_measure) {
                                            text += ` (${ing.household_measure})`;
                                        }
                                        
                                        return text;
                                    }).join(', ');
                                    
                                    // Include meal title if available
                                    const altMealTitle = meal.alternative.meal_title || '';
                                    const altMealTitleText = altMealTitle ? `<div class="meal-dish-title">${altMealTitle}</div>` : '';
                                    options.push(`<div class="meal-option"><span class="option-text">${altMealTitleText}${altIngredients}</span></div>`);
                                }
                                
                                // Add additional alternatives
                                if (meal.alternatives && meal.alternatives.length > 0) {
                                    meal.alternatives.forEach(alt => {
                                        if (alt.ingredients && alt.ingredients.length > 0) {
                                            const altIngredients = alt.ingredients.map(ing => {
                                                let text = ing.item || 'Ingredient';
                                                // Conditionally remove brand information in parentheses from PDF display
                                                if (removeBrands) {
                                                    text = text.replace(/\s*\([^)]*\)$/, '');
                                                } else {
                                                    // Remove generic brand names even when not removing all brands
                                                    const brandMatch = text.match(/\s*\(([^)]*)\)$/);
                                                    if (brandMatch && !shouldShowBrand(brandMatch[1])) {
                                                        text = text.replace(/\s*\([^)]*\)$/, '');
                                                    }
                                                }
                                                text = text.replace(/\b(וגן|קוביה|בישבת|טורטיות|סולוג|מולך|אלשבע|בולים)\b/g, '<span class="highlighted">$1</span>');
                                                
                                                // Add household measure if available
                                                if (ing.household_measure) {
                                                    text += ` (${ing.household_measure})`;
                                                }
                                                
                                                return text;
                                            }).join(', ');
                                            options.push(`<div class="meal-option"><span class="option-text">${altIngredients}</span></div>`);
                                        }
                                    });
                                }
                                
                                // Add special note for lunch if it exists
                                if (mealName.toLowerCase().includes('lunch') || mealName.toLowerCase().includes('צהרים')) {
                                    options.push(`<div class="meal-option"><span class="bold-note">**אם רוצה אז להוסיף לך חלבון וירקות**</span></div>`);
                                }
                                
                                return options.join('');
                            })()}
                        </div>
                                        </div>
                `;
            }).join('') : ''}
                </div>
    
    <div class="footer">
            <div class="contact-info">
                <div>כתובת: משכית 10, הרצליה</div>
                <div>לקביעת תור: 054-3066442</div>
                <div>א"ל: galbecker106@gmail.com</div>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  // Handle language changes
  const handleLanguageChange = async (lang) => {
    if (!editedMenu || loading || !originalMenu) return;

    if (lang === 'en') {
      // Restore original English menu
      console.log('🔄 Switching to English - restoring original menu');
      setEditedMenu(originalMenu);
      return;
    }

    // Check if we have cached translation for this language
    if (translatedMenus[lang]) {
      console.log('🔄 Using cached translation for:', lang);
      setEditedMenu(translatedMenus[lang]);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Translating menu to:', lang);
      const translated = await translateMenu(originalMenu, lang);
      
      // Cache the translation
      setTranslatedMenus(prev => ({
        ...prev,
        [lang]: translated
      }));
      
      setEditedMenu(translated);
      console.log('✅ Translation completed and cached for:', lang);
    } catch (err) {
      console.error('Translation failed:', err);
      setError('Failed to translate menu.');
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to language changes
  useEffect(() => {
    EventBus.on('translateMenu', handleLanguageChange);
    return () => {
      if (EventBus.off) {
        EventBus.off('translateMenu', handleLanguageChange);
      }
    };
  }, [editedMenu, loading]);

  // Manual check for future meal plan notifications
  const manualCheckFutureMealPlans = async () => {
    try {
      setCheckingFuture(true);
      setFutureCheckResult(null);
      setError(null);
      
      console.log('🔍 Manually checking for future meal plan notifications...');
      
      // Calculate dates 2 and 3 days from now
      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
      const twoDayTarget = twoDaysFromNow.toISOString().split('T')[0];
      
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      const threeDayTarget = threeDaysFromNow.toISOString().split('T')[0];
      
      // Find meal plans scheduled to be active in 2-3 days
      const { data: futureMealPlans, error } = await supabase
        .from('meal_plans_and_schemas')
        .select('id, user_code, meal_plan_name, active_from, status')
        .eq('status', 'scheduled')
        .in('active_from', [twoDayTarget, threeDayTarget]);
      
      if (error) {
        throw error;
      }
      
      let notificationsSent = 0;
      let errors = 0;
      
      if (futureMealPlans && futureMealPlans.length > 0) {
        console.log(`📅 Found ${futureMealPlans.length} meal plan(s) scheduled for activation in 2-3 days`);
        
        // Send notifications for each future meal plan
        for (const mealPlan of futureMealPlans) {
          try {
            // Check if we already sent a notification for this meal plan today
            const today = new Date().toISOString().split('T')[0];
            const { data: existingNotification, error: checkError } = await supabase
              .from('user_message_queue')
              .select('id')
              .eq('user_code', mealPlan.user_code)
              .eq('message_type', 'system_reminder')
              .eq('context_data->notification_type', 'future_meal_plan_advance')
              .eq('context_data->meal_plan_name', mealPlan.meal_plan_name || 'Untitled Meal Plan')
              .gte('scheduled_for', `${today}T00:00:00.000Z`)
              .lt('scheduled_for', `${today}T23:59:59.999Z`)
              .limit(1);
            
            if (checkError) {
              console.error('Error checking existing notifications:', checkError);
              errors++;
              continue;
            }
            
            if (existingNotification && existingNotification.length > 0) {
              console.log(`📬 Notification already sent today for meal plan: ${mealPlan.meal_plan_name}`);
              continue;
            }
            
            // Get client ID for notification
            const { data: clientData, error: clientError } = await supabase
              .from('chat_users')
              .select('id')
              .eq('user_code', mealPlan.user_code)
              .single();
            
            if (clientData && !clientError) {
              // Send advance notification
              await sendFutureMealPlanNotification(
                mealPlan.user_code, 
                mealPlan.meal_plan_name || 'Untitled Meal Plan', 
                clientData.id,
                mealPlan.active_from
              );
              notificationsSent++;
            } else {
              console.warn(`Could not find client ID for user_code: ${mealPlan.user_code}`);
              errors++;
            }
          } catch (notificationError) {
            console.error(`Error sending notification for meal plan ${mealPlan.id}:`, notificationError);
            errors++;
          }
        }
      }
      
      setFutureCheckResult({
        found: futureMealPlans?.length || 0,
        notificationsSent,
        errors,
        targetDate: `${twoDayTarget} or ${threeDayTarget}`
      });
      
    } catch (error) {
      console.error('Error in manualCheckFutureMealPlans:', error);
      setError('Failed to check future meal plans: ' + error.message);
    } finally {
      setCheckingFuture(false);
    }
  };

  // Check and update expired menus
  const checkAndUpdateExpiredMenus = async () => {
    try {
      setCheckingExpired(true);
      setExpiredCheckResult(null);
      setError(null);
      
      const now = new Date().toISOString();
      
      // Find all active menus that have expired
      const { data: expiredMenus, error } = await supabase
        .from('meal_plans_and_schemas')
        .select('id, meal_plan_name, active_until')
        .eq('status', 'active')
        .not('active_until', 'is', null)
        .lt('active_until', now);

      if (error) {
        console.error('Error checking for expired menus:', error);
        setError('Failed to check for expired menus: ' + error.message);
        return;
      }

      if (expiredMenus && expiredMenus.length > 0) {
        console.log(`Found ${expiredMenus.length} expired menus:`, expiredMenus);
        
        let updatedCount = 0;
        let errorCount = 0;
        
        // Update each expired menu to 'expired' status
        for (const menu of expiredMenus) {
          const updateData = {
            status: 'expired',
            active_until: null, // Clear the active_until date
            updated_at: new Date().toISOString()
          };

          const { error: updateError } = await supabase
            .from('meal_plans_and_schemas')
            .update(updateData)
            .eq('id', menu.id);

          if (updateError) {
            console.error(`Error updating expired menu ${menu.id}:`, updateError);
            errorCount++;
          } else {
            console.log(`✅ Updated expired menu: ${menu.meal_plan_name}`);
            updatedCount++;
          }
        }

        // Set result message
        setExpiredCheckResult({
          found: expiredMenus.length,
          updated: updatedCount,
          errors: errorCount,
          menus: expiredMenus.map(m => m.meal_plan_name)
        });

        // Refresh the menu list to show updated statuses
        if (updatedCount > 0) {
          loadMenus();
        }
      } else {
        setExpiredCheckResult({
          found: 0,
          updated: 0,
          errors: 0,
          menus: []
        });
      }
    } catch (error) {
      console.error('Error in checkAndUpdateExpiredMenus:', error);
      setError('Failed to check expired menus: ' + error.message);
    } finally {
      setCheckingExpired(false);
    }
  };

  const renderMealOption = (option, isAlternative = false) => {
    if (!option) return null;

    return (
      <div className={`p-4 rounded-lg ${isAlternative ? 'bg-blue-50' : 'bg-green-50'}`}>
        <div className="flex justify-between items-start mb-3">
          <EditableTitle 
            value={option.meal_title}
            onChange={handleTitleChange}
            mealIndex={option.mealIndex}
            optionIndex={isAlternative ? 'alternative' : 'main'}
          />
          <div className="flex gap-2">
            <Badge variant="outline" className={`${isAlternative ? 'bg-blue-100 border-blue-200' : 'bg-green-100 border-green-200'}`}>
              {typeof option.nutrition?.calories === 'number' ? option.nutrition.calories + ' ' + (translations.calories || 'kcal') : option.nutrition?.calories}
            </Badge>
            {isAlternative && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMakeAlternativeMain(option.mealIndex, option.alternativeIndex)}
                className="text-xs bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                title={translations.makeMain || 'Make this the main option'}
              >
                ⭐ {translations.makeMain || 'Make Main'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div>
            <p className="text-gray-500">{translations.protein || 'Protein'}</p>
            <p className="font-medium">{typeof option.nutrition?.protein === 'number' ? option.nutrition.protein.toFixed(1) + 'g' : option.nutrition?.protein}</p>
          </div>
          <div>
            <p className="text-gray-500">{translations.fat || 'Fat'}</p>
            <p className="font-medium">{typeof option.nutrition?.fat === 'number' ? option.nutrition.fat.toFixed(1) + 'g' : option.nutrition?.fat}</p>
          </div>
          <div>
            <p className="text-gray-500">{translations.carbs || 'Carbs'}</p>
            <p className="font-medium">{typeof option.nutrition?.carbs === 'number' ? option.nutrition.carbs.toFixed(1) + 'g' : option.nutrition?.carbs}</p>
          </div>
        </div>

        {option.ingredients && option.ingredients.length > 0 && (
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">{translations.ingredients || 'Ingredients'}:</h5>
            <ul className="space-y-1">
              {option.ingredients.map((ingredient, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm group">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EditableIngredient
                        value={ingredient.item}
                        onChange={handleIngredientChange}
                        mealIndex={option.mealIndex}
                        optionIndex={isAlternative ? 'alternative' : 'main'}
                        ingredientIndex={idx}
                        translations={translations}
                      />
                      <span className="text-gray-600">
                        {ingredient.household_measure}
                      </span>
                      {(ingredient.calories || ingredient.protein || ingredient.fat || ingredient.carbs) && (
                        <>
                          <span className="text-orange-600 font-medium">
                            {Math.round(ingredient.calories || 0)} {translations.calories || 'cal'}
                          </span>
                          <span className="text-blue-600 font-medium">
                            {Math.round(ingredient.protein || 0)}g {translations.protein || 'protein'}
                          </span>
                          <span className="text-amber-600 font-medium">
                            {Math.round(ingredient.fat || 0)}g {translations.fat || 'fat'}
                          </span>
                          <span className="text-green-600 font-medium">
                            {Math.round(ingredient.carbs || 0)}g {translations.carbs || 'carbs'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteIngredient(option.mealIndex, isAlternative ? 'alternative' : 'main', idx, option.alternativeIndex)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded"
                    title={translations.deleteIngredient || 'Delete ingredient'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  if (isEditing && editedMenu) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={handleBackToList}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {translations.editMenu || 'Edit Menu'}: {editedMenu.meal_plan_name || (translations.loadedMenu || 'Loaded Menu')}
            </h1>
            {editedMenu.user_code && (
              <p className="text-sm text-gray-500">{translations.clientCode || 'User Code'}: {editedMenu.user_code}</p>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <Alert>
            <Loader className="animate-spin h-4 w-4 mr-2" />
            <AlertTitle>Translating Menu</AlertTitle>
            <AlertDescription>Please wait while the menu is being translated...</AlertDescription>
          </Alert>
        )}

        {editedMenu.totals && (
          <Card className="bg-green-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <CalendarRange className="h-5 w-5" />
                {translations.dailyTotals || 'Daily Totals'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <p className="text-sm text-green-600 font-medium">{translations.calories || 'Calories'}</p>
                  <p className="text-2xl font-bold text-green-700">
                    {editedMenu.totals.calories}
                    <span className="text-sm font-normal text-green-600 ml-1">{translations.calories || 'kcal'}</span>
                  </p>
                </div>
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <p className="text-sm text-blue-600 font-medium">{translations.protein || 'Protein'}</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {editedMenu.totals.protein}
                    <span className="text-sm font-normal text-blue-600 ml-1">g</span>
                  </p>
                </div>
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <p className="text-sm text-amber-600 font-medium">{translations.fat || 'Fat'}</p>
                  <p className="text-2xl font-bold text-amber-700">
                    {editedMenu.totals.fat}
                    <span className="text-sm font-normal text-amber-600 ml-1">g</span>
                  </p>
                </div>
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <p className="text-sm text-orange-600 font-medium">{translations.carbs || 'Carbs'}</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {editedMenu.totals.carbs}
                    <span className="text-sm font-normal text-orange-600 ml-1">g</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Nutrition Targets Display */}
        {selectedMenu && selectedMenu.user_code && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <span>🎯</span>
                {translations.nutritionTargets || 'Client Nutritional Targets'}
              </CardTitle>
              <CardDescription className="text-blue-600">
                {translations.fromDatabase ? `${translations.fromDatabase} ${selectedMenu.user_code}` : `from database ${selectedMenu.user_code}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUserTargets ? (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader className="animate-spin h-4 w-4" />
                  {translations.loadingClientTargets || 'Loading client targets...'}
                </div>
              ) : userTargets ? (
                <div className="space-y-4">
                  {/* Target Macros */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-sm text-blue-600 font-medium mb-2">{translations.calories || 'Calories'}</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {userTargets.calories}
                        <span className="text-sm font-normal text-blue-600 ml-1">{translations.calories || 'kcal'}</span>
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-sm text-blue-600 font-medium mb-2">{translations.protein || 'Protein'}</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {userTargets.macros.protein}
                        <span className="text-sm font-normal text-blue-600 ml-1">g</span>
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-sm text-blue-600 font-medium mb-2">{translations.fat || 'Fat'}</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {userTargets.macros.fat}
                        <span className="text-sm font-normal text-blue-600 ml-1">g</span>
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-sm text-blue-600 font-medium mb-2">{translations.carbs || 'Carbs'}</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {userTargets.macros.carbs}
                        <span className="text-sm font-normal text-blue-600 ml-1">g</span>
                      </p>
                    </div>
                  </div>

                  {/* Client Information */}
                  {(userTargets.age || userTargets.gender || userTargets.weight_kg || userTargets.height_cm) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {userTargets.age && (
                        <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
                          <p className="text-sm text-gray-600 font-medium mb-1">{translations.age || 'Age'}</p>
                          <p className="text-lg font-semibold text-gray-800">{userTargets.age} {translations.yearsOld || 'years'}</p>
                        </div>
                      )}
                      {userTargets.gender && (
                        <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
                          <p className="text-sm text-gray-600 font-medium mb-1">{translations.gender || 'Gender'}</p>
                          <p className="text-lg font-semibold text-gray-800">{userTargets.gender}</p>
                        </div>
                      )}
                      {userTargets.weight_kg && (
                        <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
                          <p className="text-sm text-gray-600 font-medium mb-1">{translations.weight || 'Weight'}</p>
                          <p className="text-lg font-semibold text-gray-800">{userTargets.weight_kg} kg</p>
                        </div>
                      )}
                      {userTargets.height_cm && (
                        <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
                          <p className="text-sm text-gray-600 font-medium mb-1">{translations.height || 'Height'}</p>
                          <p className="text-lg font-semibold text-gray-800">{userTargets.height_cm} cm</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dietary Restrictions */}
                  {(userTargets.allergies.length > 0 || userTargets.limitations.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {userTargets.allergies.length > 0 && (
                        <div className="p-3 bg-white rounded-lg shadow-sm border border-red-200">
                          <p className="text-sm text-red-700 font-medium mb-2 flex items-center gap-2">
                            <span>⚠️</span>
                            {translations.dietaryAllergies || 'Food Allergies'}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {userTargets.allergies.map((allergy, idx) => (
                              <Badge key={idx} variant="outline" className="bg-red-50 border-red-200 text-red-700 text-xs">
                                {allergy}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {userTargets.limitations.length > 0 && (
                        <div className="p-3 bg-white rounded-lg shadow-sm border border-orange-200">
                          <p className="text-sm text-orange-700 font-medium mb-2 flex items-center gap-2">
                            <span>🚫</span>
                            {translations.dietaryRestrictions || 'Dietary Restrictions'}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {userTargets.limitations.map((limitation, idx) => (
                              <Badge key={idx} variant="outline" className="bg-orange-50 border-orange-200 text-orange-700 text-xs">
                                {limitation}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Client Preferences */}
                  {userTargets.client_preference && userTargets.client_preference.length > 0 && (
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-green-200">
                      <p className="text-sm text-green-700 font-medium mb-2 flex items-center gap-2">
                        <span>❤️</span>
                        {translations.clientPreferences || 'Client Preferences'}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {userTargets.client_preference.map((pref, idx) => (
                          <Badge key={idx} variant="outline" className="bg-green-50 border-green-200 text-green-700 text-xs">
                            {pref}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Target vs Generated Menu Comparison */}
                  {editedMenu && editedMenu.totals && (
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <span>📊</span>
                        {translations.targetVsGenerated || 'Target vs Generated Menu Comparison'}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Calories Comparison */}
                        <div className="p-4 bg-white rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-600 font-medium mb-2">{translations.calories || 'Calories'}</p>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-blue-600">{translations.target || 'Target'}:</span>
                              <span className="font-bold text-blue-700">{userTargets.calories}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-green-600">{translations.generated || 'Generated'}:</span>
                              <span className="font-bold text-green-700">{editedMenu.totals.calories}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                              <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>
                              <span className={`text-sm font-medium ${Math.abs(editedMenu.totals.calories - userTargets.calories) <= userTargets.calories * 0.05
                                  ? 'text-green-600'
                                  : 'text-red-600'
                                }`}>
                                {`${editedMenu.totals.calories - userTargets.calories > 0 ? '+' : ''}${((editedMenu.totals.calories - userTargets.calories) / userTargets.calories * 100)
                                    .toFixed(1)
                                  }%`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Protein Comparison */}
                        <div className="p-4 bg-white rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-600 font-medium mb-2">{translations.protein || 'Protein'} (g)</p>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                            <span className="text-sm text-blue-600">{translations.target || 'Target'}:</span>
                            <span className="font-bold text-blue-700">{userTargets.macros.protein}</span>
                            </div>
                            <div className="flex justify-between items-center">
                            <span className="text-sm text-green-600">{translations.generated || 'Generated'}:</span>
                            <span className="font-bold text-green-700">{editedMenu.totals.protein}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                            <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>
                            <span className={`text-sm font-medium ${Math.abs(editedMenu.totals.protein - userTargets.macros.protein) <= userTargets.macros.protein * 0.05
                                  ? 'text-green-600'
                                  : 'text-red-600'
                                }`}>
                                {`${editedMenu.totals.protein - userTargets.macros.protein > 0 ? '+' : ''}${((editedMenu.totals.protein - userTargets.macros.protein)
                                    / userTargets.macros.protein
                                    * 100
                                  ).toFixed(1)
                                  }%`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Fat Comparison */}
                        <div className="p-4 bg-white rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-600 font-medium mb-2">{translations.fat || 'Fat'} (g)</p>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-blue-600">{translations.target || 'Target'}:</span>
                              <span className="font-bold text-blue-700">{userTargets.macros.fat}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-green-600">{translations.generated || 'Generated'}:</span>
                              <span className="font-bold text-green-700">{editedMenu.totals.fat}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                              <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>
                              <span className={`text-sm font-medium ${Math.abs(editedMenu.totals.fat - userTargets.macros.fat) <= userTargets.macros.fat * 0.05
                                  ? 'text-green-600'
                                  : 'text-red-600'
                                }`}>
                                {`${editedMenu.totals.fat - userTargets.macros.fat > 0 ? '+' : ''}${((editedMenu.totals.fat - userTargets.macros.fat)
                                    / userTargets.macros.fat
                                    * 100
                                  ).toFixed(1)
                                  }%`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Carbs Comparison */}
                        <div className="p-4 bg-white rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-600 font-medium mb-2">{translations.carbs || 'Carbs'} (g)</p>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-blue-600">{translations.target || 'Target'}:</span>
                              <span className="font-bold text-blue-700">{userTargets.macros.carbs}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-green-600">{translations.generated || 'Generated'}:</span>
                              <span className="font-bold text-green-700">{editedMenu.totals.carbs}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                              <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>
                              <span className={`text-sm font-medium ${Math.abs(editedMenu.totals.carbs - userTargets.macros.carbs) <= userTargets.macros.carbs * 0.05
                                  ? 'text-green-600'
                                  : 'text-red-600'
                                }`}>
                                {`${editedMenu.totals.carbs - userTargets.macros.carbs > 0 ? '+' : ''}${((editedMenu.totals.carbs - userTargets.macros.carbs)
                                    / userTargets.macros.carbs
                                    * 100
                                  ).toFixed(1)
                                  }%`}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Overall Accuracy Indicator */}
                      <div className="mt-6 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-medium text-gray-700">{translations.menuAccuracy || 'Menu Accuracy'}:</span>
                          <div className="flex items-center gap-3">
                            {(() => {
                              // Calculate percentage differences for each metric
                              const caloriesDiff = Math.abs((editedMenu.totals.calories - userTargets.calories) / userTargets.calories * 100);
                              const proteinDiff = Math.abs((editedMenu.totals.protein - userTargets.macros.protein) / userTargets.macros.protein * 100);
                              const fatDiff = Math.abs((editedMenu.totals.fat - userTargets.macros.fat) / userTargets.macros.fat * 100);
                              const carbsDiff = Math.abs((editedMenu.totals.carbs - userTargets.macros.carbs) / userTargets.macros.carbs * 100);

                              // Calculate accuracy based on how close each value is to target
                              // Perfect accuracy (100%) when all differences are 0%
                              // 0% accuracy when any difference is 50% or more
                              const maxDiff = Math.max(caloriesDiff, proteinDiff, fatDiff, carbsDiff);
                              const avgDiff = (caloriesDiff + proteinDiff + fatDiff + carbsDiff) / 4;
                              
                              // Calculate accuracy: 100% - (average difference * 2) to make it more sensitive
                              // Cap at 100% and floor at 0%
                              const accuracy = Math.max(0, Math.min(100, 100 - (avgDiff * 1.5)));

                              // Count how many are within acceptable ranges
                              const within5Percent = [caloriesDiff <= 5, proteinDiff <= 5, fatDiff <= 5, carbsDiff <= 5].filter(Boolean).length;
                              const within10Percent = [caloriesDiff <= 10, proteinDiff <= 10, fatDiff <= 10, carbsDiff <= 10].filter(Boolean).length;

                              return (
                                <>
                                  <div className={`px-4 py-2 rounded-full text-base font-medium ${accuracy >= 80 ? 'bg-green-100 text-green-700 border border-green-200' :
                                      accuracy >= 60 ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                                        'bg-red-100 text-red-700 border border-red-200'
                                    }`}>
                                    {Math.round(accuracy)}% {translations.accurate || 'Accurate'}
                                  </div>
                                  <span className="text-sm text-gray-500">
                                    ({within5Percent}/4 {translations.within5Percent || 'within ±5%'}, {within10Percent}/4 within ±10%)
                                  </span>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-blue-600">{translations.noTargetDataFound || 'No target data found for this client.'}</p>
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-700 text-sm font-medium">Error Details:</p>
                      <p className="text-red-600 text-sm">{error}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Meal Plan Structure Display */}
        {editedMenu && editedMenu.meals && editedMenu.totals && (
          <Card className="mb-6 border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <span>📋</span>
                {translations.mealPlanStructure || 'Meal Plan Structure'}
              </CardTitle>
              <CardDescription className="text-blue-600">
                {translations.mealBreakdownDescription || 'Breakdown of calories and nutrition across meals'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Meal Breakdown Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-blue-200">
                        <th className="text-left p-3 font-bold text-blue-800 bg-blue-50">
                          {translations.meal || 'Meal'}
                        </th>
                        <th className="text-center p-3 font-bold text-blue-800 bg-blue-50">
                          {translations.calories || 'Calories'}
                        </th>
                        <th className="text-center p-3 font-bold text-blue-800 bg-blue-50">
                          {translations.percentage || '% of Total'}
                        </th>
                        <th className="text-center p-3 font-bold text-blue-800 bg-blue-50">
                          {translations.protein || 'Protein (g)'}
                        </th>
                        <th className="text-center p-3 font-bold text-blue-800 bg-blue-50">
                          {translations.fat || 'Fat (g)'}
                        </th>
                        <th className="text-center p-3 font-bold text-blue-800 bg-blue-50">
                          {translations.carbs || 'Carbs (g)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {editedMenu.meals.map((meal, index) => {
                        const mealCalories = meal.main?.nutrition?.calories || 0;
                        const mealProtein = meal.main?.nutrition?.protein || 0;
                        const mealFat = meal.main?.nutrition?.fat || 0;
                        const mealCarbs = meal.main?.nutrition?.carbs || 0;
                        const percentage = editedMenu.totals.calories > 0 ? 
                          ((mealCalories / editedMenu.totals.calories) * 100) : 0;

                        return (
                          <tr
                            key={index}
                            className={`border-b border-blue-100 hover:bg-blue-50 transition-colors ${
                              index % 2 === 0 ? 'bg-white' : 'bg-blue-25'
                            }`}
                          >
                            <td className="p-3">
                              <div className="font-semibold text-gray-800">{meal.meal}</div>
                              {meal.main?.meal_title && meal.main.meal_title !== meal.meal && (
                                <div className="text-xs text-gray-500 mt-1">{meal.main.meal_title}</div>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="font-medium text-blue-700">{Math.round(mealCalories)}</div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center">
                                <div className="font-medium text-blue-700">{percentage.toFixed(1)}%</div>
                                <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="font-medium text-gray-700">{Math.round(mealProtein)}</div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="font-medium text-gray-700">{Math.round(mealFat)}</div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="font-medium text-gray-700">{Math.round(mealCarbs)}</div>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Total Row */}
                      <tr className="border-t-2 border-blue-300 bg-blue-100 font-bold">
                        <td className="p-3 text-blue-800">{translations.total || 'Total'}</td>
                        <td className="p-3 text-center text-blue-800">{Math.round(editedMenu.totals.calories)}</td>
                        <td className="p-3 text-center text-blue-800">100.0%</td>
                        <td className="p-3 text-center text-blue-800">{Math.round(editedMenu.totals.protein)}</td>
                        <td className="p-3 text-center text-blue-800">{Math.round(editedMenu.totals.fat)}</td>
                        <td className="p-3 text-center text-blue-800">{Math.round(editedMenu.totals.carbs)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 bg-white rounded-lg border border-blue-200">
                    <div className="text-sm text-blue-600 font-medium mb-1">
                      {translations.totalMeals || 'Total Meals'}
                    </div>
                    <div className="text-2xl font-bold text-blue-700">
                      {editedMenu.meals.length}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-white rounded-lg border border-blue-200">
                    <div className="text-sm text-blue-600 font-medium mb-1">
                      {translations.averageCaloriesPerMeal || 'Avg Calories/Meal'}
                    </div>
                    <div className="text-2xl font-bold text-blue-700">
                      {Math.round(editedMenu.totals.calories / editedMenu.meals.length)}
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-lg border border-blue-200">
                    <div className="text-sm text-blue-600 font-medium mb-1">
                      {translations.mealsWithAlternatives || 'Meals w/ Alternatives'}
                    </div>
                    <div className="text-2xl font-bold text-blue-700">
                      {editedMenu.meals.filter(meal => meal.alternative || (meal.alternatives && meal.alternatives.length > 0)).length}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recommendations Section */}
        {selectedMenu && selectedMenu.user_code && (clientRecommendations.length > 0 || recommendations.length > 0) && (
          <Card className="mb-6 border-purple-200 bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-100/50 to-pink-100/50 -skew-y-1 transform"></div>
              <div className="relative">
                <CardTitle className="text-purple-800 flex items-center gap-3 text-xl font-bold">
                  <div className="p-2 bg-purple-200 rounded-full">
                    <span role="img" aria-label="lightbulb" className="text-lg">💡</span>
                  </div>
                  {translations.recommendations || 'Recommendations'}
                </CardTitle>
                <CardDescription className="text-purple-700 font-medium mt-2">
                  {translations.personalizedRecommendations || 'Personalized recommendations'} for{' '}
                  <span className="font-bold text-purple-800">{selectedMenu.user_code}</span>
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Client Recommendations */}
                {clientRecommendations.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4 p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg border border-purple-200">
                      <div className="p-2 bg-purple-200 rounded-full">
                        <span role="img" aria-label="user" className="text-lg">👤</span>
                      </div>
                      <h4 className="font-bold text-purple-800 text-lg">
                        {translations.clientRecommendations || 'Client Recommendations'}
                      </h4>
                    </div>
                    <div className="grid gap-3">
                      {clientRecommendations.map((rec, idx) => (
                        <div key={rec.id || idx} className="p-4 bg-white rounded-lg border border-purple-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <Badge variant="outline" className="bg-purple-100 border-purple-300 text-purple-700">
                                {rec.category || 'general'}
                              </Badge>
                            </div>
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 mb-3">{rec.title}</h5>
                              <div className="text-sm leading-relaxed">
                                {typeof rec.content === 'string' && rec.content.includes('\n') ? (
                                  <div className="space-y-2">
                                    {rec.content.split('\n').map((line, lineIdx) => {
                                      if (line.trim().startsWith('•')) {
                                        const cleanLine = line.replace('• ', '').trim();
                                        if (cleanLine.includes(':')) {
                                          const [key, ...valueParts] = cleanLine.split(':');
                                          const value = valueParts.join(':').trim();
                                          return (
                                            <div key={lineIdx} className="flex items-start gap-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-l-4 border-purple-300">
                                              <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0 mt-2"></div>
                                                <span className="font-semibold text-purple-800 capitalize text-sm">
                                                  {key.trim()}
                                                </span>
                                              </div>
                                              <div className="flex-1">
                                                <p className="text-gray-700 text-sm">{value}</p>
                                              </div>
                                            </div>
                                          );
                                        } else {
                                          return (
                                            <div key={lineIdx} className="flex items-start gap-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-l-4 border-purple-300">
                                              <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0 mt-2"></div>
                                              <p className="flex-1 text-gray-700 text-sm">{cleanLine}</p>
                                            </div>
                                          );
                                        }
                                      } else if (line.includes(':')) {
                                        const [key, ...valueParts] = line.split(':');
                                        const value = valueParts.join(':').trim();
                                        return (
                                          <div key={lineIdx} className="flex items-start gap-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-l-4 border-purple-300">
                                            <span className="font-semibold text-purple-800 capitalize text-sm min-w-0 flex-shrink-0">
                                              {key.trim()}
                                            </span>
                                            <div className="flex-1">
                                              <p className="text-gray-700 text-sm">{value}</p>
                                            </div>
                                          </div>
                                        );
                                      } else if (line.trim()) {
                                        return (
                                          <div key={lineIdx} className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-l-4 border-purple-300">
                                            <p className="text-gray-700 text-sm">{line}</p>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })}
                                  </div>
                                ) : (
                                  <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-l-4 border-purple-300">
                                    <p className="text-gray-700 text-sm">{rec.content || 'No content available'}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meal Plan Recommendations */}
                {recommendations.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4 p-3 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg border border-blue-200">
                      <div className="p-2 bg-blue-200 rounded-full">
                        <span role="img" aria-label="menu" className="text-lg">📋</span>
                      </div>
                      <h4 className="font-bold text-blue-800 text-lg">
                        {translations.mealPlanRecommendations || 'Meal Plan Recommendations'}
                      </h4>
                    </div>
                    <div className="grid gap-3">
                      {recommendations.map((rec, idx) => (
                        <div key={rec.id || idx} className="p-4 bg-white rounded-lg border border-blue-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <Badge variant="outline" className="bg-blue-100 border-blue-300 text-blue-700">
                                {rec.category || 'general'}
                              </Badge>
                            </div>
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 mb-3">{rec.title}</h5>
                              <div className="text-sm leading-relaxed">
                                {typeof rec.content === 'string' && rec.content.includes('\n') ? (
                                  <div className="space-y-2">
                                    {rec.content.split('\n').map((line, lineIdx) => {
                                      if (line.trim().startsWith('•')) {
                                        const cleanLine = line.replace('• ', '').trim();
                                        if (cleanLine.includes(':')) {
                                          const [key, ...valueParts] = cleanLine.split(':');
                                          const value = valueParts.join(':').trim();
                                          return (
                                            <div key={lineIdx} className="flex items-start gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-l-4 border-blue-300">
                                              <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                                                <span className="font-semibold text-blue-800 capitalize text-sm">
                                                  {key.trim()}
                                                </span>
                                              </div>
                                              <div className="flex-1">
                                                <p className="text-gray-700 text-sm">{value}</p>
                                              </div>
                                            </div>
                                          );
                                        } else {
                                          return (
                                            <div key={lineIdx} className="flex items-start gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-l-4 border-blue-300">
                                              <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                                              <p className="flex-1 text-gray-700 text-sm">{cleanLine}</p>
                                            </div>
                                          );
                                        }
                                      } else if (line.includes(':')) {
                                        const [key, ...valueParts] = line.split(':');
                                        const value = valueParts.join(':').trim();
                                        return (
                                          <div key={lineIdx} className="flex items-start gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-l-4 border-blue-300">
                                            <span className="font-semibold text-blue-800 capitalize text-sm min-w-0 flex-shrink-0">
                                              {key.trim()}
                                            </span>
                                            <div className="flex-1">
                                              <p className="text-gray-700 text-sm">{value}</p>
                                            </div>
                                          </div>
                                        );
                                      } else if (line.trim()) {
                                        return (
                                          <div key={lineIdx} className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-l-4 border-blue-300">
                                            <p className="text-gray-700 text-sm">{line}</p>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })}
                                  </div>
                                ) : (
                                  <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-l-4 border-blue-300">
                                    <p className="text-gray-700 text-sm">{rec.content || 'No content available'}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {editedMenu.meals.map((meal, mealIdx) => (
            <Card key={mealIdx} className="overflow-hidden">
              <CardHeader className="border-b bg-gray-50">
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2">
                    <Utensils className="h-5 w-5 text-green-600" />
                    {meal.meal}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  {meal.main && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Badge variant="outline" className="bg-green-100 border-green-200">
                          {translations.mainOption || 'Main Option'}
                        </Badge>
                      </div>
                      {renderMealOption({ ...meal.main, mealIndex: mealIdx }, false)}
                    </div>
                  )}
                  
                  {meal.alternative && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Badge variant="outline" className="bg-blue-100 border-blue-200">
                          {translations.alternativeOption || 'Alternative Option'}
                        </Badge>
                      </div>
                      {renderMealOption({ ...meal.alternative, mealIndex: mealIdx }, true)}
                    </div>
                  )}

                  {/* Render additional alternatives if present */}
                  {meal.alternatives && meal.alternatives.length > 0 && (
                    <div className="mt-4">
                      <div className="font-semibold mb-2 text-blue-700">{translations.otherAlternatives || 'Other Alternatives'}:</div>
                      <div className="space-y-4">
                        {console.log(`🎯 Rendering ${meal.alternatives.length} additional alternatives for meal ${mealIdx}:`, meal.alternatives)}
                        {meal.alternatives.map((alt, altIdx) => (
                          <div key={altIdx} className="bg-blue-50 rounded-lg p-3">
                            {renderMealOption({ ...alt, mealIndex: mealIdx, alternativeIndex: altIdx }, true)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add Alternative Button */}
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => handleAddAlternative(mealIdx)}
                      disabled={generatingAlt[mealIdx]}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {generatingAlt[mealIdx] ? (
                        <Loader className="animate-spin h-4 w-4 mr-2" />
                      ) : null}
                      {generatingAlt[mealIdx] ? (translations.generating || 'Generating...') : (translations.addAlternative || 'Add Alternative')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="removeBrands"
              checked={removeBrandsFromPdf}
              onCheckedChange={setRemoveBrandsFromPdf}
            />
            <Label htmlFor="removeBrands" className="text-sm font-medium text-gray-700">
              {translations.removeBrandsFromPdf || 'Remove brand names from PDF'}
            </Label>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => downloadPdf(editedMenu, 'portrait')}
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              <Download className="h-4 w-4 mr-2" />
              {translations.downloadPortraitPdf || 'Download PDF (Portrait)'}
            </Button>
            <Button
              onClick={() => downloadPdf(editedMenu, 'landscape')}
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              <Download className="h-4 w-4 mr-2" />
              {translations.downloadLandscapePdf || 'Download PDF (Landscape)'}
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
          >
            {saving ? (
              <Loader className="animate-spin h-4 w-4 mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? (translations.saving || 'Saving...') : (translations.saveChanges || 'Save Changes')}
          </Button>
        </div>

        {/* Shopping List Section - Moved to bottom */}
        {editedMenu && editedMenu.meals && editedMenu.meals.length > 0 && (
          <div className="mt-8">
            <div className="flex justify-center mb-4">
              <Button
                variant="outline"
                onClick={() => setShowShoppingList((prev) => !prev)}
                className="border-yellow-400 text-yellow-700 hover:bg-yellow-50"
              >
                {showShoppingList ? (translations.hideShoppingList || 'Hide Shopping List') : `🛒 ${translations.showShoppingList || 'Show Shopping List'}`}
              </Button>
            </div>

            {showShoppingList && shoppingList.length > 0 && (
              <Card className="border-yellow-400 bg-gradient-to-br from-yellow-50 to-orange-100 shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-orange-700 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
                      <span role="img" aria-label="cart">🛒</span> {translations.shoppingList || 'Shopping List'}
                    </CardTitle>
                    <CardDescription className="text-orange-600 font-medium">
                      {translations.shoppingListDescription || 'All ingredients needed for this menu, beautifully organized'}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-orange-200">
                          <th className="text-left p-3 font-bold text-orange-800 bg-orange-50">
                            {translations.ingredient || 'Ingredient'}
                          </th>
                          <th className="text-left p-3 font-bold text-orange-800 bg-orange-50">
                            {translations.measures || 'Measures'}
                          </th>
                          <th className="text-left p-3 font-bold text-orange-800 bg-orange-50">
                            {translations.usedInMeals || 'Used in Meals'}
                          </th>
                          <th className="text-left p-3 font-bold text-orange-800 bg-orange-50">
                            {translations.brands || 'Brands'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {shoppingList.map((item, idx) => (
                          <tr
                            key={idx}
                            className={`border-b border-orange-100 hover:bg-orange-50 transition-colors ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-orange-25'
                            }`}
                          >
                            <td className="p-3">
                              <div className="font-semibold text-gray-800">{item.name}</div>
                              {item.originalName !== item.name && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {translations.original || 'Original'}: {item.originalName}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-gray-700">
                              {item.measures || (translations.noMeasure || 'No measure specified')}
                            </td>
                            <td className="p-3 text-gray-700">
                              {item.meals}
                            </td>
                            <td className="p-3 text-gray-700">
                              {item.brands || (translations.noBrand || 'No brand specified')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{translations.loadMenu || 'Load & Edit Menu'}</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {expiredCheckResult && (
        <Alert variant={expiredCheckResult.found > 0 ? "default" : "secondary"}>
          <AlertTitle>
            {expiredCheckResult.found > 0 ? 'Expired Meal plans Found' : 'No Expired Meal plans'}
          </AlertTitle>
          <AlertDescription>
            {expiredCheckResult.found > 0 ? (
              <div className="space-y-2">
                <p>Found {expiredCheckResult.found} expired Meal plan(s).</p>
                <p>Successfully updated {expiredCheckResult.updated} Meal plan(s) to expired status.</p>
                {expiredCheckResult.errors > 0 && (
                  <p className="text-red-600">Failed to update {expiredCheckResult.errors} Meal plan(s).</p>
                )}
                {expiredCheckResult.menus.length > 0 && (
                  <div>
                    <p className="font-medium">Updated Meal plans:</p>
                    <ul className="list-disc list-inside text-sm">
                      {expiredCheckResult.menus.map((name, idx) => (
                        <li key={idx}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p>No expired Meal Plans found. All active menus are still within their active period.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {futureCheckResult && (
        <Alert variant={futureCheckResult.found > 0 ? "default" : "secondary"}>
          <AlertTitle>
            {futureCheckResult.found > 0 ? 'Future Meal Plan Notifications' : 'No Future Meal Plans'}
          </AlertTitle>
          <AlertDescription>
            {futureCheckResult.found > 0 ? (
              <div className="space-y-2">
                <p>Found {futureCheckResult.found} meal plan(s) scheduled for activation on {futureCheckResult.targetDate}.</p>
                <p>Successfully sent {futureCheckResult.notificationsSent} notification(s).</p>
                {futureCheckResult.errors > 0 && (
                  <p className="text-red-600">Failed to send {futureCheckResult.errors} notification(s).</p>
                )}
              </div>
            ) : (
              <p>No meal plans scheduled for activation on {futureCheckResult.targetDate}.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Search className="w-5 h-5 text-gray-400" />
          {selectedClient ? (
            <div className="flex-1 p-3 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <span>✓</span>
                <span className="font-medium">{translations.selectedClient || 'Selected Client'}: {selectedClient.full_name}</span>
                <span className="text-green-600">({selectedClient.user_code})</span>
              </div>
              <div className="text-xs text-green-600 mt-1">
                {translations.filteredBySelectedClient || 'Filtered by selected client'}
              </div>
            </div>
          ) : (
            <Input
              placeholder={translations.searchMenus || "Search by name or client code..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          )}
        </div>
        
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-5 h-5 text-gray-400" />
          {selectedClient ? (
            <div className="w-full sm:w-[180px] p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="text-xs text-blue-700">
                {translations.automaticFiltering || 'Automatic filtering by selected client'}
              </div>
            </div>
          ) : (
            <Select value={filterUserCode} onValueChange={setFilterUserCode}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={translations.filterByClient || "Filter by client"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{translations.allClients || 'All Clients'}</SelectItem>
                {userCodes.map(code => (
                  <SelectItem key={code} value={code}>{code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Button
          variant="outline"
          onClick={checkAndUpdateExpiredMenus}
          disabled={checkingExpired}
          className="border-orange-300 text-orange-700 hover:bg-orange-50"
        >
          {checkingExpired ? (
            <Loader className="animate-spin h-4 w-4 mr-2" />
          ) : (
            <span className="text-sm mr-2">⏰</span>
          )}
          {checkingExpired ? (translations.checking || 'Checking...') : (translations.checkExpiredMenus || 'Check Expired Menus')}
        </Button>

        <Button
          variant="outline"
          onClick={manualCheckFutureMealPlans}
          disabled={checkingFuture}
          className="border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          {checkingFuture ? (
            <Loader className="animate-spin h-4 w-4 mr-2" />
          ) : (
            <span className="text-sm mr-2">📅</span>
          )}
          {checkingFuture ? (translations.checking || 'Checking...') : 'Check Future Notifications'}
        </Button>
      </div>

      {loadingMenus ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredMenus.map(menu => (
            <Card 
              key={menu.id} 
              className={`cursor-pointer hover:shadow-md transition-all ${
                menu.status === 'active' ? 'border-green-200' : 
                menu.status === 'published' ? 'border-blue-200' :
                menu.status === 'scheduled' ? 'border-purple-200' :
                'border-yellow-200'
              }`}
              onClick={() => handleMenuSelect(menu)}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-medium">
                    {menu.meal_plan_name || (translations.untitledMenu || 'Untitled Menu')}
                  </CardTitle>
                  <CardDescription>
                    <span>{translations.clientCode || 'User Code'}: {menu.user_code || (translations.notAvailable || 'N/A')}</span>
                  </CardDescription>
                </div>
                <Badge 
                  variant="secondary"
                  className={getStatusColor(menu.status)}
                >
                  {menu.status === 'published' ? (translations.published || 'Published') : 
                   menu.status === 'active' ? (translations.active || 'Active') : 
                   menu.status === 'scheduled' ? (translations.scheduled || 'Scheduled') :
                   menu.status === 'expired' ? (translations.expired || 'Expired') :
                   (translations.draft || 'Draft')}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">{translations.targetCalories || 'Total Calories'}</p>
                    <p className="font-medium">{menu.daily_total_calories || 0} {translations.calories || 'kcal'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{translations.protein || 'Protein'}</p>
                    <p className="font-medium">{menu.macros_target?.protein || '0g'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{translations.carbs || 'Carbs'}</p>
                    <p className="font-medium">{menu.macros_target?.carbs || '0g'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{translations.fat || 'Fat'}</p>
                    <p className="font-medium">{menu.macros_target?.fat || '0g'}</p>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{translations.created || 'Created'}:</span>
                    <span className="text-xs font-medium">
                      {formatDate(menu.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{translations.updated || 'Updated'}:</span>
                    <span className="text-xs font-medium">
                      {formatDate(menu.updated_at)}
                    </span>
                  </div>
                  {menu.active_from && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{translations.activeFrom || 'Active From'}:</span>
                      <span className="text-xs font-medium text-green-600">
                        {formatDate(menu.active_from)}
                      </span>
                    </div>
                  )}
                  {menu.active_until && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{translations.activeUntil || 'Active Until'}:</span>
                      <span className="text-xs font-medium text-orange-600">
                        {formatDate(menu.active_until)}
                      </span>
                    </div>
                  )}
                </div>


                
                <div className="pt-2 space-y-2">
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMenuSelect(menu);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {translations.loadAndEditMenu || 'Load & Edit Menu'}
                  </Button>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(menu);
                      }}
                    >
                      <span className="text-sm">⚙️</span>
                      {translations.manageStatus || 'Manage Status'}
                    </Button>
                    
                    <Button 
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMenu(menu);
                      }}
                      disabled={deletingMenu === menu.id}
                    >
                      {deletingMenu === menu.id ? (
                        <Loader className="animate-spin h-4 w-4" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredMenus.length === 0 && !loadingMenus && (
            <div className="col-span-full">
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-10">
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    {translations.noMenusFound || 'No menus found'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {translations.noMenusMatchCriteria || 'No menus match your search criteria'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Status Management Modal */}
      {showStatusModal && selectedMenuForStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {translations.manageMenuStatus || 'Manage Menu Status'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {translations.menuName || 'Menu Name'}
                </label>
                <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  {selectedMenuForStatus.meal_plan_name}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {translations.status || 'Status'}
                </label>
                <Select 
                  value={statusForm.status} 
                  onValueChange={(value) => setStatusForm(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{translations.draft || 'Draft'}</SelectItem>
                    <SelectItem value="scheduled">{translations.scheduled || 'Scheduled'}</SelectItem>
                    <SelectItem value="active">{translations.active || 'Active'}</SelectItem>
                    <SelectItem value="published">{translations.published || 'Published'}</SelectItem>
                    <SelectItem value="expired">{translations.expired || 'Expired'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(statusForm.status === 'active' || statusForm.status === 'scheduled') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {translations.activeFrom || 'Active From'}
                    </label>
                    <Input
                      type="date"
                      value={statusForm.active_from}
                      onChange={(e) => setStatusForm(prev => ({ ...prev, active_from: e.target.value }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {translations.activeUntil || 'Active Until'} ({translations.optional || 'Optional'})
                    </label>
                    <Input
                      type="date"
                      value={statusForm.active_until}
                      onChange={(e) => setStatusForm(prev => ({ ...prev, active_until: e.target.value }))}
                      className="w-full"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowStatusModal(false);
                    setSelectedMenuForStatus(null);
                  }}
                  className="flex-1"
                >
                  {translations.cancel || 'Cancel'}
                </Button>
                <Button
                  onClick={handleUpdateStatus}
                  disabled={updatingStatus}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {updatingStatus ? (
                    <Loader className="animate-spin h-4 w-4 mr-2" />
                  ) : (
                    <span className="text-sm">💾</span>
                  )}
                  {updatingStatus ? (translations.updating || 'Updating...') : (translations.updateStatus || 'Update Status')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuLoad; 