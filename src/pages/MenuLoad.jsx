import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader, Save, Search, Filter, Utensils, Edit, CalendarRange, Download, Trash2, Plus } from 'lucide-react';
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

    // Get phone number from chat_users table
    const { data: clientData, error: clientError } = await supabase
      .from('chat_users')
      .select('phone_number')
      .eq('user_code', userCode)
      .single();

    if (clientError || !clientData?.phone_number) {
      console.error('Error fetching phone number from chat_users:', clientError);
      throw new Error(`Failed to get phone number for user ${userCode}`);
    }

    const phoneNumber = clientData.phone_number;

    // Prepare the API request body
    const requestBody = {
      phone_number: phoneNumber,
      message: notificationMessage
    };

    // Send message via external API
    const response = await fetch('https://api-gw.eu-prod.betterchoice.one/whapi/send-external-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error sending message via API:', response.status, errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Meal plan activation notification sent successfully via external API:', result);
    return result;
  } catch (error) {
    console.error('Failed to send meal plan activation notification:', error);
    // Don't throw error to avoid breaking the main flow
    console.warn('Meal plan activation notification failed, but status was updated successfully');
  }
};

// Function to create weekly progress reminders for meal plan
const createWeeklyMealPlanReminders = async (userCode, mealPlanId, activeFrom, activeUntil, dietitianId) => {
  try {
    console.log('📅 Creating weekly meal plan reminders...', { userCode, mealPlanId, activeFrom, activeUntil });
    
    // Get current user (dietitian) info
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Error getting current user for reminders:', authError);
      return;
    }

    // Get client data including phone_number and telegram_chat_id
    const { data: clientData, error: clientError } = await supabase
      .from('chat_users')
      .select('phone_number, telegram_chat_id, id')
      .eq('user_code', userCode)
      .single();
    
    if (clientError || !clientData) {
      console.error('Error fetching client data for reminders:', clientError);
      return;
    }
    
    // Determine channel based on telegram_chat_id
    const channel = clientData.telegram_chat_id ? 'telegram' : 'whatsapp';
    
    // Calculate number of weeks
    if (!activeFrom || !activeUntil) {
      console.warn('Missing active_from or active_until dates, cannot create weekly reminders');
      return;
    }
    
    const startDate = new Date(activeFrom);
    const endDate = new Date(activeUntil);
    const diffTime = endDate - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const numberOfWeeks = Math.ceil(diffDays / 7);
    
    if (numberOfWeeks <= 0) {
      console.warn('Invalid number of weeks calculated:', numberOfWeeks);
      return;
    }
    
    console.log(`📊 Creating ${numberOfWeeks} weekly reminders for meal plan`);
    
    // 10 encouraging messages that rotate for each week
    const encouragingMessages = [
      "Good luck! You're one week closer to your goals! 💪",
      "Keep going! You're doing amazing on your meal plan! 🌟",
      "You're making great progress! Stay strong! 💚",
      "One week down! You're on the right track! 🎯",
      "Keep up the excellent work! Your dedication is inspiring! ✨",
      "You're one week stronger! Keep pushing forward! 🚀",
      "Amazing progress! You're building healthy habits! 🌱",
      "You're doing fantastic! One week at a time! 💫",
      "Keep going strong! Your commitment is paying off! 🏆",
      "You're one week closer to success! Stay motivated! 🌈"
    ];
    
    // Calculate the first reminder date (week 1) - exactly 1 week after activation date, same day of week at 8 AM
    const activationDate = new Date(startDate);
    const firstReminderDate = new Date(activationDate);
    firstReminderDate.setDate(firstReminderDate.getDate() + 7); // 1 week after activation
    firstReminderDate.setHours(8, 0, 0, 0); // Set to 8 AM
    
    console.log('📅 Week 1 reminder on:', firstReminderDate, '(activation date was:', activationDate, ')');
    
    // Create reminders for each week
    const reminders = [];
    const endDateObj = new Date(activeUntil);
    endDateObj.setHours(23, 59, 59, 999); // End of the day for comparison
    
    // Track the last valid reminder date for recurrence_end_date
    let lastValidReminderDate = null;
    
    for (let week = 1; week <= numberOfWeeks; week++) {
      // Calculate the date for this week (same day of week as activation, 1 week apart, at 8 AM)
      const weekDate = new Date(firstReminderDate);
      weekDate.setDate(weekDate.getDate() + ((week - 1) * 7));
      
      // Skip if reminder date is after active_until
      if (weekDate > endDateObj) {
        console.log(`⏭️ Skipping week ${week} reminder (date ${weekDate.toISOString().split('T')[0]} is after active_until ${activeUntil})`);
        continue;
      }
      
      // Track the last valid reminder date
      lastValidReminderDate = weekDate;
      
      // Select message based on week (rotates through the 10 messages)
      const messageIndex = (week - 1) % encouragingMessages.length;
      const message = encouragingMessages[messageIndex];
      
      // Format date and time for scheduled_reminders table
      const scheduledDate = weekDate.toISOString().split('T')[0];
      const scheduledTime = '08:00:00';
      
      // Use active_until as recurrence_end_date (or the last reminder date if earlier)
      const recurrenceEndDate = activeUntil;
      
      reminders.push({
        message_type: 'reminder',
        topic: 'system_reminder',
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        context: message,
        status: 'pending',
        priority: 'medium',
        user_id: user.id, // Dietitian who created the reminder
        user_code: userCode,
        phone_number: clientData.phone_number,
        channel: channel,
        plan_type: 'meal_plan',
        plan_id: mealPlanId,
        week_number: week,
        is_active: true,
        recurrence_pattern: 'weekly',
        recurrence_end_date: recurrenceEndDate,
        media_attachments: null,
        metadata: {
          dietitian_id: dietitianId || user.id,
          client_id: clientData.id,
          reminder_type: 'weekly_progress'
        }
      });
    }
    
    if (reminders.length === 0) {
      console.log('⚠️ No reminders to create (all dates in past)');
      return;
    }
    
    // Insert all reminders in batch
    const { data, error } = await supabase
      .from('scheduled_reminders')
      .insert(reminders)
      .select();
    
    if (error) {
      console.error('Error creating weekly reminders:', error);
      throw error;
    }
    
    console.log(`✅ Created ${reminders.length} weekly reminders successfully:`, data);
    return data;
  } catch (error) {
    console.error('Failed to create weekly meal plan reminders:', error);
    // Don't throw error to avoid breaking the main flow
    console.warn('Weekly reminders creation failed, but meal plan was activated successfully');
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

    // Get phone number from chat_users table
    const { data: clientData, error: clientError } = await supabase
      .from('chat_users')
      .select('phone_number')
      .eq('user_code', userCode)
      .single();

    if (clientError || !clientData?.phone_number) {
      console.error('Error fetching phone number from chat_users:', clientError);
      throw new Error(`Failed to get phone number for user ${userCode}`);
    }

    const phoneNumber = clientData.phone_number;

    // Prepare the API request body
    const requestBody = {
      phone_number: phoneNumber,
      message: notificationMessage
    };

    // Send message via external API
    const response = await fetch('https://api-gw.eu-prod.betterchoice.one/whapi/send-external-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error sending message via API:', response.status, errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Future meal plan notification sent successfully via external API:', result);
    return result;
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

const EditableIngredient = ({
  value,
  onChange,
  mealIndex,
  optionIndex,
  ingredientIndex,
  alternativeIndex,
  translations,
  autoFocus = false,
}) => {
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
      const queryWords = query.trim().split(/\s+/).filter(Boolean);
      let allData = [];

      if (queryWords.length === 1) {
        const word = queryWords[0];
        const startsWithPattern = `${word}%`;
        const containsPattern = `%${word}%`;

        const { data: startsWithData, error: startsWithError } = await supabase
          .from('ingridientsroee')
          .select('id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g')
          .or([
            `name.ilike.${startsWithPattern}`,
            `english_name.ilike.${startsWithPattern}`
          ].join(','))
          .limit(50);

        if (!startsWithError && startsWithData) {
          allData = startsWithData;
        }

        if (allData.length < 20) {
          const { data: containsData, error: containsError } = await supabase
            .from('ingridientsroee')
            .select('id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g')
            .or([
              `name.ilike.${containsPattern}`,
              `english_name.ilike.${containsPattern}`
            ].join(','))
            .limit(50);

          if (!containsError && containsData) {
            const existingIds = new Set(allData.map(item => item.id));
            const newItems = containsData.filter(item => !existingIds.has(item.id));
            allData = [...allData, ...newItems];
          }
        }
      } else {
        const wordsConditions = [];
        queryWords.forEach(word => {
          const pattern = `%${word}%`;
          wordsConditions.push(
            `name.ilike.${pattern}`,
            `english_name.ilike.${pattern}`
          );
        });

        const { data: wordsData, error: wordsError } = await supabase
          .from('ingridientsroee')
          .select('id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g')
          .or(wordsConditions.join(','))
          .limit(200);

        if (!wordsError && wordsData) {
          const filteredWordsData = wordsData.filter(item => {
            const combinedText = `${(item.name || '').toLowerCase()} ${(item.english_name || '').toLowerCase()}`;
            return queryWords.every(word => combinedText.includes(word.toLowerCase()));
          });
          allData = filteredWordsData;
        }
      }

      const rankedData = allData.map(ingredient => {
        const hebrewName = (ingredient.name || '').toLowerCase();
        const englishName = (ingredient.english_name || '').toLowerCase();
        const queryLower = query.toLowerCase();
        const queryWordsLower = queryWords.map(w => w.toLowerCase());
        const isHebrewQuery = /[\u0590-\u05FF]/.test(query);

        const scoreName = (fullName) => {
          if (!fullName) return 0;
          if (fullName === queryLower) return 10000;
          if (fullName.startsWith(queryLower)) return 9000;
          if (queryWordsLower.length > 1) {
            const phrase = queryWordsLower.join(' ');
            if (fullName.startsWith(phrase)) return 8800;
            if (fullName.includes(phrase)) return 5000;
          }
          if (fullName.includes(queryLower)) return 3000;
          return queryWordsLower.every(word => fullName.includes(word)) ? 2000 : 0;
        };

        const englishScore = scoreName(englishName);
        const hebrewScore = scoreName(hebrewName);
        const score = Math.max(englishScore, hebrewScore);
        const preferEnglish = isHebrewQuery ? englishScore > hebrewScore : englishScore >= hebrewScore;

        return {
          ...ingredient,
          _searchScore: score,
          _preferEnglish: preferEnglish && (ingredient.english_name || ingredient.name)
        };
      });

      rankedData.sort((a, b) => {
        if (b._searchScore !== a._searchScore) {
          return b._searchScore - a._searchScore;
        }
        const aName = a._preferEnglish ? (a.english_name || a.name || '') : (a.name || a.english_name || '');
        const bName = b._preferEnglish ? (b.english_name || b.name || '') : (b.name || b.english_name || '');
        return aName.localeCompare(bName);
      });

      const suggestions = rankedData.slice(0, 50).map(ingredient => {
        const displayName = ingredient._preferEnglish
          ? (ingredient.english_name || ingredient.name || '')
          : (ingredient.name || ingredient.english_name || '');

        return {
          english: ingredient.english_name || ingredient.name || '',
          hebrew: displayName,
          household_measure: '',
          calories: ingredient.calories_energy || 0,
          protein: ingredient.protein_g || 0,
          fat: ingredient.fat_g || 0,
          carbs: ingredient.carbohydrates_g || 0,
          'portionSI(gram)': 100,
          'brand of pruduct': ''
        };
      });

      setSuggestions(suggestions);
    } catch (error) {
      console.error('Error fetching suggestions from Supabase:', error);
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

      onChange(updatedValues, mealIndex, optionIndex, ingredientIndex, alternativeIndex);
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

  useEffect(() => {
    if (autoFocus && !isEditing && value === '') {
      startEditing();
    }
  }, [autoFocus, isEditing, value]);

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
        autoFocus={autoFocus}
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

const EditableHouseholdMeasure = ({ value, onChange, mealIndex, optionIndex, ingredientIndex, alternativeIndex, translations }) => {
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
    onChange(editValue, mealIndex, optionIndex, ingredientIndex, alternativeIndex);
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
      <span
        onClick={() => setIsEditing(true)}
        className="text-gray-600 cursor-pointer hover:bg-gray-100 px-1 rounded"
        title={translations?.clickToEditHouseholdMeasure || 'Click to edit household measure'}
      >
        {value || translations?.noMeasure || 'No measure'}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={handleKeyPress}
      onBlur={handleSubmit}
      className="text-gray-600 bg-white border border-gray-300 rounded px-1 py-0.5 text-sm min-w-[80px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      placeholder={translations?.householdMeasurePlaceholder || 'e.g., 1 cup, 2 tbsp'}
    />
  );
};

const IngredientPortionDialog = ({ isOpen, onClose, onConfirm, ingredient, translations }) => {
  const [gramAmount, setGramAmount] = useState('');
  const [householdMeasure, setHouseholdMeasure] = useState('');
  const [adjustedNutrition, setAdjustedNutrition] = useState(null);
  const [isAIConverting, setIsAIConverting] = useState(false);
  const [aiConversionMessage, setAiConversionMessage] = useState('');

  useEffect(() => {
    if (isOpen && ingredient) {
      setGramAmount(ingredient['portionSI(gram)'] || '');
      setHouseholdMeasure(ingredient.household_measure || '');

      const currentPortion = parseFloat(ingredient['portionSI(gram)'] || 0);
      if (currentPortion > 0) {
        const nutritionPer100g = {
          calories: Math.round((ingredient.calories || 0) * 100 / currentPortion),
          protein: Math.round((ingredient.protein || 0) * 100 / currentPortion),
          fat: Math.round((ingredient.fat || 0) * 100 / currentPortion),
          carbs: Math.round((ingredient.carbs || 0) * 100 / currentPortion),
        };

        const ratio = currentPortion / 100;
        setAdjustedNutrition({
          calories: Math.round(nutritionPer100g.calories * ratio),
          protein: Math.round(nutritionPer100g.protein * ratio),
          fat: Math.round(nutritionPer100g.fat * ratio),
          carbs: Math.round(nutritionPer100g.carbs * ratio),
        });
      } else {
        setAdjustedNutrition(null);
      }
    }
  }, [isOpen, ingredient]);

  const recalcNutrition = (newAmount) => {
    if (!ingredient) return;
    const currentPortion = parseFloat(ingredient['portionSI(gram)'] || 0);
    const newAmountNum = parseFloat(newAmount);
    if (!newAmountNum) {
      setAdjustedNutrition(null);
      return;
    }

    if (currentPortion > 0) {
      const nutritionPer100g = {
        calories: Math.round((ingredient.calories || 0) * 100 / currentPortion),
        protein: Math.round((ingredient.protein || 0) * 100 / currentPortion),
        fat: Math.round((ingredient.fat || 0) * 100 / currentPortion),
        carbs: Math.round((ingredient.carbs || 0) * 100 / currentPortion),
      };
      const ratio = newAmountNum / 100;
      setAdjustedNutrition({
        calories: Math.round(nutritionPer100g.calories * ratio),
        protein: Math.round(nutritionPer100g.protein * ratio),
        fat: Math.round(nutritionPer100g.fat * ratio),
        carbs: Math.round(nutritionPer100g.carbs * ratio),
      });
    } else {
      const ratio = newAmountNum / 100;
      setAdjustedNutrition({
        calories: Math.round((ingredient.calories || 0) * ratio),
        protein: Math.round((ingredient.protein || 0) * ratio),
        fat: Math.round((ingredient.fat || 0) * ratio),
        carbs: Math.round((ingredient.carbs || 0) * ratio),
      });
    }
  };

  const handleGramAmountChange = (e) => {
    const newAmount = e.target.value;
    setGramAmount(newAmount);
    if (newAmount) {
      recalcNutrition(newAmount);
    } else {
      setAdjustedNutrition(null);
    }
  };

  const convertGramsToHousehold = async () => {
    if (!gramAmount || !ingredient) return;
    try {
      setIsAIConverting(true);
      setAiConversionMessage('🤖 Converting to household measure...');
      const conversionResult = await convertMeasurementWithAI(ingredient, `${gramAmount}g`, 'household');
      if (conversionResult?.converted_measurement) {
        setHouseholdMeasure(conversionResult.converted_measurement);
        setAiConversionMessage(`✅ Converted to "${conversionResult.converted_measurement}"`);
      } else {
        setAiConversionMessage('⚠️ Could not determine household measure');
      }
    } catch (error) {
      console.error('Error converting grams to household', error);
      setAiConversionMessage('❌ Conversion failed');
    } finally {
      setTimeout(() => {
        setAiConversionMessage('');
        setIsAIConverting(false);
      }, 3000);
    }
  };

  const convertHouseholdToGrams = async () => {
    if (!householdMeasure.trim() || !ingredient) return;
    try {
      setIsAIConverting(true);
      setAiConversionMessage('🤖 Converting to grams...');
      const conversionResult = await convertMeasurementWithAI(ingredient, householdMeasure.trim(), 'grams');
      if (conversionResult?.converted_measurement) {
        setGramAmount(conversionResult.converted_measurement.toString());
        setAiConversionMessage(`✅ Converted to ${conversionResult.converted_measurement}g`);
        recalcNutrition(conversionResult.converted_measurement);
      } else {
        setAiConversionMessage('⚠️ Could not determine gram amount');
      }
    } catch (error) {
      console.error('Error converting household to grams', error);
      setAiConversionMessage('❌ Conversion failed');
    } finally {
      setTimeout(() => {
        setAiConversionMessage('');
        setIsAIConverting(false);
      }, 3000);
    }
  };

  const handleConfirm = () => {
    if (!gramAmount || !householdMeasure.trim()) {
      alert(translations?.pleaseFillAllFields || 'Please fill in all fields');
      return;
    }

    const gramAmountNum = parseFloat(gramAmount);
    if (isNaN(gramAmountNum) || gramAmountNum <= 0) {
      alert(translations?.pleaseEnterValidAmount || 'Please enter a valid amount greater than 0');
      return;
    }

    const updatedIngredient = {
      ...ingredient,
      'portionSI(gram)': gramAmountNum,
      household_measure: householdMeasure.trim(),
      calories: adjustedNutrition?.calories ?? ingredient.calories,
      protein: adjustedNutrition?.protein ?? ingredient.protein,
      fat: adjustedNutrition?.fat ?? ingredient.fat,
      carbs: adjustedNutrition?.carbs ?? ingredient.carbs,
    };

    onConfirm(updatedIngredient);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4" dir="rtl">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">
          {translations?.setPortion || 'Set Portion Size'}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {translations?.portionDialogDescription || 'Enter the amount in grams and a household measurement. The nutrition values will be adjusted automatically.'}
        </p>

        <div className="space-y-4">
          {aiConversionMessage && (
            <div className="bg-purple-50 border border-purple-200 rounded-md p-3 flex items-center gap-2">
              <div className="animate-pulse">🤖</div>
              <span className="text-sm text-purple-700 font-medium">{aiConversionMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {translations?.ingredient || 'Ingredient'}:
            </label>
            <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded border">
              {ingredient?.item}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {translations?.amountInGrams || 'Amount (grams)'}:
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={gramAmount}
                onChange={handleGramAmountChange}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="100"
                min="0"
                step="0.1"
              />
              <Button
                type="button"
                onClick={convertGramsToHousehold}
                disabled={isAIConverting || !gramAmount}
                variant="outline"
                size="sm"
                className="px-3 py-2 text-purple-600 border-purple-300 hover:bg-purple-50 whitespace-nowrap"
                title="Use AI to convert grams to household measure"
              >
                {isAIConverting ? '🤖' : '🏠'}
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {translations?.householdMeasure || 'Household Measure'}:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={householdMeasure}
                onChange={(e) => setHouseholdMeasure(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={translations?.householdMeasurePlaceholder || 'e.g., 1 cup, 2 tbsp'}
              />
              <Button
                type="button"
                onClick={convertHouseholdToGrams}
                disabled={isAIConverting || !householdMeasure.trim()}
                variant="outline"
                size="sm"
                className="px-3 py-2 text-purple-600 border-purple-300 hover:bg-purple-50 whitespace-nowrap"
                title="Use AI to convert household measure to grams"
              >
                {isAIConverting ? '🤖' : '⚖️'}
              </Button>
            </div>
          </div>

          {adjustedNutrition && (
            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-sm font-medium text-blue-800 mb-2">{translations?.adjustedNutrition || 'Adjusted Nutrition'}:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-blue-700">{translations?.calories || 'Calories'}: {adjustedNutrition.calories}</span>
                <span className="text-green-700">{translations?.protein || 'Protein'}: {adjustedNutrition.protein}g</span>
                <span className="text-amber-700">{translations?.fat || 'Fat'}: {adjustedNutrition.fat}g</span>
                <span className="text-orange-700">{translations?.carbs || 'Carbs'}: {adjustedNutrition.carbs}g</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {translations?.cancel || 'Cancel'}
          </Button>
          <Button onClick={handleConfirm}>
            {translations?.save || 'Save'}
          </Button>
        </div>
      </div>
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

const convertMeasurementWithAI = async (ingredient, fromMeasurement, toType, targetLang = 'en', region = 'israel') => {
  if (!ingredient || !fromMeasurement || !toType) return null;
  try {
    const response = await fetch('https://dietitian-be.azurewebsites.net/api/convert-measurement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient: ingredient.item,
        brand: ingredient['brand of pruduct'] || '',
        fromMeasurement,
        toType,
        targetLang,
        region
      })
    });

    if (!response.ok) {
      console.error('Measurement conversion API error', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Measurement conversion failed', error);
    return null;
  }
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
    active_until: '',
    active_days: [] // Array of day numbers: 0=Sunday, 1=Monday, ..., 6=Saturday
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
  const [showPortionDialog, setShowPortionDialog] = useState(false);
  const [selectedIngredientForDialog, setSelectedIngredientForDialog] = useState(null);
  const [dialogIngredientContext, setDialogIngredientContext] = useState(null);
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
      totals,
      note: savedMenu.meal_plan?.note || savedMenu.note || '',
      user_code: savedMenu.user_code || savedMenu.meal_plan?.user_code || null,
      meal_plan_name: savedMenu.meal_plan_name || savedMenu.meal_plan?.name || ''
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
        .select('daily_target_total_calories, macros, region, food_allergies, food_limitations, age, gender, weight_kg, height_cm, client_preference')
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
      if (!data.daily_target_total_calories) missingFields.push('daily_target_total_calories');
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
        calories: data.daily_target_total_calories || 2000,
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

  const handleMenuSelect = async (menu) => {
    console.log('Selected menu:', menu);
    setSelectedMenu(menu);
    
    const convertedMenu = convertToEditFormat(menu);
    if (convertedMenu) {
      // Store original menu for English mode restoration
      setOriginalMenu(convertedMenu);
      // Clear previous translations cache
      setTranslatedMenus({});
      
      setIsEditing(true);
      
      // If current language is Hebrew, automatically translate the menu
      if (language === 'he') {
        setLoading(true);
        setError(null);
        
        try {
          console.log('🌐 Auto-translating menu to Hebrew...');
          const translated = await translateMenu(convertedMenu, 'he');
          const mergedTranslated = {
            ...convertedMenu,
            ...translated,
            user_code: convertedMenu.user_code,
            meal_plan_name: convertedMenu.meal_plan_name
          };
          
          // Cache the translation
          setTranslatedMenus(prev => ({
            ...prev,
            he: mergedTranslated
          }));
          
          setEditedMenu(mergedTranslated);
          console.log('✅ Menu auto-translated to Hebrew');
        } catch (err) {
          console.error('Auto-translation failed:', err);
          // Fall back to original English menu if translation fails
          setEditedMenu(convertedMenu);
          setError('Failed to translate menu. Showing English version.');
        } finally {
          setLoading(false);
        }
      } else {
        // If not Hebrew, just set the English menu
        setEditedMenu(convertedMenu);
      }
      
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

  const handleIngredientChange = (newValues, mealIndex, optionIndex, ingredientIndex, alternativeIndex = null) => {
    const updateMenu = (menuData) => {
      if (!menuData) return menuData;
      const updated = JSON.parse(JSON.stringify(menuData));
      const meal = updated.meals?.[mealIndex];
      if (!meal) return menuData;

      const option =
        alternativeIndex !== null
          ? meal.alternatives?.[alternativeIndex]
          : optionIndex === 'main'
            ? meal.main
            : meal.alternative;

      if (option?.ingredients && option.ingredients[ingredientIndex]) {
        Object.assign(option.ingredients[ingredientIndex], newValues);

        if (optionIndex === 'main' && alternativeIndex === null) {
          const totalNutrition = option.ingredients.reduce(
            (acc, ing) => ({
              calories: acc.calories + (ing.calories || 0),
              protein: acc.protein + (ing.protein || 0),
              fat: acc.fat + (ing.fat || 0),
              carbs: acc.carbs + (ing.carbs || 0)
            }),
            { calories: 0, protein: 0, fat: 0, carbs: 0 }
          );
          option.nutrition = totalNutrition;
          updated.totals = calculateMainTotals(updated);
        }
      }

      return updated;
    };

    setEditedMenu(prev => updateMenu(prev) || prev);
    setOriginalMenu(prev => updateMenu(prev) || prev);
  };

  const handleAddIngredient = (mealIndex, optionIndex, alternativeIndex = null) => {
    const addIngredient = (menuData) => {
      if (!menuData) return menuData;
      const updated = JSON.parse(JSON.stringify(menuData));
      const meal = updated.meals?.[mealIndex];
      if (!meal) return menuData;

      const option =
        alternativeIndex !== null
          ? meal.alternatives?.[alternativeIndex]
          : optionIndex === 'main'
            ? meal.main
            : meal.alternative;

      if (!option) return menuData;
      option.ingredients = option.ingredients || [];
      option.ingredients.push({
        item: '',
        household_measure: '',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        'brand of pruduct': '',
        UPC: null,
        'portionSI(gram)': 0
      });

      return updated;
    };

    setEditedMenu(prev => addIngredient(prev) || prev);
    setOriginalMenu(prev => addIngredient(prev) || prev);
  };

  const handleHouseholdMeasureChange = (newMeasure, mealIndex, optionIndex, ingredientIndex, alternativeIndex = null) => {
    const updateMenu = (menuData) => {
      if (!menuData) return menuData;
      const updated = JSON.parse(JSON.stringify(menuData));
      const meal = updated.meals?.[mealIndex];
      if (!meal) return menuData;

      const option =
        alternativeIndex !== null
          ? meal.alternatives?.[alternativeIndex]
          : optionIndex === 'main'
            ? meal.main
            : meal.alternative;

      if (option?.ingredients && option.ingredients[ingredientIndex]) {
        option.ingredients[ingredientIndex].household_measure = newMeasure;
      }

      return updated;
    };

    setEditedMenu(prev => updateMenu(prev) || prev);
    setOriginalMenu(prev => updateMenu(prev) || prev);
  };

  const handleOpenPortionDialog = (ingredient, mealIndex, optionIndex, ingredientIndex, alternativeIndex = null) => {
    setSelectedIngredientForDialog(ingredient);
    setDialogIngredientContext({ mealIndex, optionIndex, ingredientIndex, alternativeIndex });
    setShowPortionDialog(true);
  };

  const handleClosePortionDialog = () => {
    setShowPortionDialog(false);
    setSelectedIngredientForDialog(null);
    setDialogIngredientContext(null);
  };

  const handleConfirmPortionDialog = (updatedIngredient) => {
    if (dialogIngredientContext) {
      const { mealIndex, optionIndex, ingredientIndex, alternativeIndex } = dialogIngredientContext;
      handleIngredientChange(updatedIngredient, mealIndex, optionIndex, ingredientIndex, alternativeIndex);
    }
    handleClosePortionDialog();
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
    const updateMenu = (menuData) => {
      if (!menuData) return menuData;
      const updated = JSON.parse(JSON.stringify(menuData));
      const meal = updated.meals?.[mealIndex];
      if (!meal) return menuData;

      const option =
        alternativeIndex !== null
          ? meal.alternatives?.[alternativeIndex]
          : optionIndex === 'main'
            ? meal.main
            : meal.alternative;

      if (!option?.ingredients) return menuData;

      option.ingredients.splice(ingredientIndex, 1);

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

      option.nutrition = {
        calories: Math.round(newNutrition.calories),
        protein: Math.round(newNutrition.protein),
        fat: Math.round(newNutrition.fat),
        carbs: Math.round(newNutrition.carbs),
      };

      updated.totals = calculateMainTotals(updated);
      return updated;
    };

    setEditedMenu(prev => updateMenu(prev) || prev);
    setOriginalMenu(prev => updateMenu(prev) || prev);
  };

  async function generateAlternativeMeal(main, alternative) {
    // const response = await fetch('http://127.0.0.1:8000/api/generate-alternative-meal', {
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
      
      // Check if this meal plan exists in the second database and update it
      if (selectedMenu.status === 'active') {
        try {
          console.log('🔄 Checking if meal plan exists in second database...');
          
          // Check if meal plan exists in client_meal_plans table
          const { data: existingClientMealPlan, error: checkError } = await secondSupabase
            .from('client_meal_plans')
            .select('id')
            .eq('original_meal_plan_id', selectedMenu.id)
            .single();
          
          if (!checkError && existingClientMealPlan) {
            console.log('📝 Updating existing meal plan in second database...');
            
            // Update the dietitian_meal_plan with the new version
            const { error: updateError } = await secondSupabase
              .from('client_meal_plans')
              .update({
                meal_plan_name: updatedMenu.meal_plan_name,
                dietitian_meal_plan: updatedMenu.meal_plan,
                daily_total_calories: updatedMenu.daily_total_calories,
                macros_target: updatedMenu.macros_target
              })
              .eq('id', existingClientMealPlan.id);
            
            if (updateError) {
              console.error('Error updating meal plan in second database:', updateError);
              console.warn('Main meal plan was saved, but failed to sync to second database');
            } else {
              console.log('✅ Meal plan synced to second database successfully');
            }
          } else {
            console.log('ℹ️ Meal plan not found in second database (will be created when activated)');
          }
        } catch (syncError) {
          console.error('Error syncing to second database:', syncError);
          // Don't fail the entire operation, just log the error
          console.warn('Main meal plan was saved, but failed to sync to second database');
        }
      }
      
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
    
    // Calculate default dates: today and 1 month later
    const today = new Date();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    
    const todayStr = today.toISOString().split('T')[0];
    const oneMonthLaterStr = oneMonthLater.toISOString().split('T')[0];
    
    // Use existing dates if available, otherwise use defaults
    const activeFrom = menu.active_from 
      ? new Date(menu.active_from).toISOString().split('T')[0] 
      : todayStr;
    const activeUntil = menu.active_until 
      ? new Date(menu.active_until).toISOString().split('T')[0] 
      : oneMonthLaterStr;
    
    setStatusForm({
      status: menu.status || 'draft',
      active_from: activeFrom,
      active_until: activeUntil,
      active_days: menu.active_days || [] // Load existing active days or empty array
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
        ...(statusForm.active_until && { active_until: statusForm.active_until }),
        active_days: statusForm.active_days.length > 0 ? statusForm.active_days : null // Set to null if no days selected (means every day)
      };

      // If status is being set to draft or expired, clear active dates
      if (statusForm.status === 'draft' || statusForm.status === 'expired') {
        updateData.active_from = null;
        updateData.active_until = null;
      }
      
      // If status is being set to active without an active_until date, set it to 1 month from active_from
      if (statusForm.status === 'active' && !statusForm.active_until) {
        const activeFromDate = statusForm.active_from ? new Date(statusForm.active_from) : new Date();
        const oneMonthLater = new Date(activeFromDate);
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
        updateData.active_until = oneMonthLater.toISOString().split('T')[0];
      }

      const result = await Menu.update(selectedMenuForStatus.id, updateData);
      console.log('✅ Menu status updated successfully:', result);
      
      // If status is being set to 'active', sync to the second Supabase table
      if (statusForm.status === 'active') {
        try {
          // Get the meal plan data from the selected menu
          const mealPlanData = selectedMenuForStatus.meal_plan;
          
          if (mealPlanData) {
            console.log('🔄 Syncing meal plan to second database...');
            
            // Check if meal plan already exists in client_meal_plans table
            const { data: existingClientMealPlan, error: checkError } = await secondSupabase
              .from('client_meal_plans')
              .select('id')
              .eq('original_meal_plan_id', selectedMenuForStatus.id)
              .maybeSingle();
            
            if (checkError) {
              console.error('Error checking for existing meal plan:', checkError);
              throw checkError;
            }
            
            // Prepare the data for client_meal_plans table
            const clientMealPlanData = {
              user_code: selectedMenuForStatus.user_code,
              dietitian_id: user.id, // Current authenticated user (dietitian)
              original_meal_plan_id: selectedMenuForStatus.id,
              meal_plan_name: selectedMenuForStatus.meal_plan_name || 'Untitled Meal Plan',
              dietitian_meal_plan: mealPlanData,
              active: true, // Set to active when activating
              active_days: statusForm.active_days.length > 0 ? statusForm.active_days : null, // NULL means every day
              active_from: statusForm.active_from ? new Date(statusForm.active_from).toISOString() : null,
              active_until: statusForm.active_until ? new Date(statusForm.active_until).toISOString() : null,
              daily_total_calories: selectedMenuForStatus.daily_total_calories || null,
              macros_target: selectedMenuForStatus.macros_target || null
            };

            if (existingClientMealPlan) {
              // Update existing meal plan
              console.log('📝 Updating existing meal plan in second database...');
              const { error: updateError } = await secondSupabase
                .from('client_meal_plans')
                .update(clientMealPlanData)
                .eq('id', existingClientMealPlan.id);

              if (updateError) {
                console.error('Error updating client_meal_plans table:', updateError);
                console.warn('Failed to update meal plan in client_meal_plans table, but status was updated successfully');
              } else {
                console.log('✅ Meal plan updated in client_meal_plans table successfully');
              }
            } else {
              // Insert new meal plan
              console.log('➕ Creating new meal plan in second database...');
              clientMealPlanData.client_edited_meal_plan = null; // Initially null for new plans
              
              const { data: insertData, error: insertError } = await secondSupabase
                .from('client_meal_plans')
                .insert(clientMealPlanData);

              if (insertError) {
                console.error('Error inserting to client_meal_plans table:', insertError);
                console.warn('Failed to add meal plan to client_meal_plans table, but status was updated successfully');
              } else {
                console.log('✅ Meal plan added to client_meal_plans table successfully:', insertData);
              }
            }
          } else {
            console.warn('No meal plan data found in selected menu');
          }
          
          // Check if backend automatically deactivated any conflicting meal plans and delete them from client_meal_plans
          try {
            console.log('🔍 Checking for automatically deactivated conflicting meal plans...');
            
            // Get the active days for the newly activated plan
            const newPlanActiveDays = statusForm.active_days && statusForm.active_days.length > 0 
              ? statusForm.active_days 
              : [0, 1, 2, 3, 4, 5, 6]; // All days if null/empty
            
            // Fetch draft meal plans for the same user
            const { data: draftPlans, error: draftCheckError } = await supabase
              .from('meal_plans_and_schemas')
              .select('id, meal_plan_name, active_days')
              .eq('user_code', selectedMenuForStatus.user_code)
              .eq('record_type', 'meal_plan')
              .eq('status', 'draft')
              .neq('id', selectedMenuForStatus.id);
            
            if (!draftCheckError && draftPlans && draftPlans.length > 0) {
              // Check which draft plans have overlapping days with the newly activated plan
              const conflictingDraftPlans = draftPlans.filter(plan => {
                const planActiveDays = plan.active_days && plan.active_days.length > 0 
                  ? plan.active_days 
                  : [0, 1, 2, 3, 4, 5, 6]; // All days if null/empty
                
                // Check if there's any overlap in days
                return planActiveDays.some(day => newPlanActiveDays.includes(day));
              });
              
              if (conflictingDraftPlans.length > 0) {
                console.log(`📋 Found ${conflictingDraftPlans.length} conflicting draft meal plan(s) that may have been automatically deactivated`);
                
                // Delete these conflicting plans from client_meal_plans
                for (const deactivatedPlan of conflictingDraftPlans) {
                  try {
                    const { error: deleteError } = await secondSupabase
                      .from('client_meal_plans')
                      .delete()
                      .eq('original_meal_plan_id', deactivatedPlan.id);
                    
                    if (deleteError) {
                      console.error(`Error deleting automatically deactivated meal plan ${deactivatedPlan.id} from client_meal_plans:`, deleteError);
                    } else {
                      console.log(`✅ Deleted automatically deactivated meal plan ${deactivatedPlan.id} (${deactivatedPlan.meal_plan_name}) from client_meal_plans`);
                    }
                  } catch (deleteError) {
                    console.error(`Error deleting automatically deactivated meal plan ${deactivatedPlan.id}:`, deleteError);
                  }
                }
              }
            }
          } catch (autoDeactivateCheckError) {
            console.error('Error checking for automatically deactivated meal plans:', autoDeactivateCheckError);
            // Don't fail the operation, just log the error
          }
        } catch (secondTableError) {
          console.error('Error syncing to client_meal_plans table:', secondTableError);
          // Don't fail the entire operation, just log the error
          console.warn('Failed to sync meal plan to client_meal_plans table, but status was updated successfully');
        }
      }
      
      // Handle deactivation in second database - delete from client_meal_plans when deactivated (draft or expired)
      if ((statusForm.status === 'draft' || statusForm.status === 'expired') && selectedMenuForStatus.status === 'active') {
        try {
          console.log('🔄 Deleting meal plan from client_meal_plans table (deactivation to draft/expired)...');
          
          // Delete the meal plan from client_meal_plans when deactivated to draft or expired
          const { error: deleteError } = await secondSupabase
            .from('client_meal_plans')
            .delete()
            .eq('original_meal_plan_id', selectedMenuForStatus.id);
          
          if (deleteError) {
            console.error('Error deleting meal plan from client_meal_plans:', deleteError);
            console.warn('Failed to delete from client_meal_plans, but status was updated successfully');
          } else {
            console.log('✅ Meal plan deleted from client_meal_plans table successfully');
          }
        } catch (deleteError) {
          console.error('Error deleting from client_meal_plans:', deleteError);
        }
      }
      
      // Delete all reminders when meal plan is deactivated (draft or expired)
      if (statusForm.status === 'draft' || statusForm.status === 'expired') {
        try {
          console.log('🗑️ Deleting all reminders for deactivated meal plan...');
          
          const { data: deletedReminders, error: deleteRemindersError } = await supabase
            .from('scheduled_reminders')
            .delete()
            .eq('plan_id', selectedMenuForStatus.id)
            .eq('plan_type', 'meal_plan')
            .select('id');
          
          if (deleteRemindersError) {
            console.error('Error deleting reminders:', deleteRemindersError);
            console.warn('Failed to delete reminders, but status was updated successfully');
          } else {
            const deletedCount = deletedReminders?.length || 0;
            console.log(`✅ Deleted ${deletedCount} reminder(s) for meal plan ${selectedMenuForStatus.id}`);
          }
        } catch (deleteRemindersError) {
          console.error('Error deleting reminders:', deleteRemindersError);
          console.warn('Failed to delete reminders, but status was updated successfully');
        }
      }
      
      // Send notification if meal plan was activated
      if (statusForm.status === 'active') {
        try {
          const mealPlanName = selectedMenuForStatus.meal_plan_name || 'Untitled Meal Plan';
          const userCode = selectedMenuForStatus.user_code;
          const mealPlanId = selectedMenuForStatus.id;
          
          // Get client ID for notification
          const { data: clientData, error: clientError } = await supabase
            .from('chat_users')
            .select('id')
            .eq('user_code', userCode)
            .single();
          
          if (clientData && !clientError) {
            await sendMealPlanActivationNotification(userCode, mealPlanName, clientData.id);
            
            // Create weekly progress reminders
            const activeFrom = statusForm.active_from || selectedMenuForStatus.active_from;
            const activeUntil = statusForm.active_until || selectedMenuForStatus.active_until;
            
            if (activeFrom && activeUntil) {
              await createWeeklyMealPlanReminders(
                userCode,
                mealPlanId,
                activeFrom,
                activeUntil,
                user.id
              );
            } else {
              console.warn('Missing active_from or active_until dates, skipping weekly reminders');
            }
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
      
      // Check if this is an overlap error
      if (error.message && error.message.includes('Cannot activate meal plan')) {
        // Fetch conflicting active meal plans
        try {
          const { data: conflictingPlans, error: fetchError } = await supabase
            .from('meal_plans_and_schemas')
            .select('id, meal_plan_name, active_days')
            .eq('user_code', selectedMenuForStatus.user_code)
            .eq('record_type', 'meal_plan')
            .eq('status', 'active')
            .neq('id', selectedMenuForStatus.id);
          
          if (!fetchError && conflictingPlans && conflictingPlans.length > 0) {
            // Helper to convert day numbers to names
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const formatDays = (days) => {
              if (!days || days.length === 0) return 'all days';
              return days.map(d => dayNames[d] || d).join(', ');
            };
            
            // Format the conflicting plans list
            const plansList = conflictingPlans.map(plan => {
              const daysText = formatDays(plan.active_days);
              return `"${plan.meal_plan_name}" (${daysText})`;
            }).join('\n');
            
            // Ask user if they want to deactivate conflicting plans
            const confirmMessage = 
              `There are ${conflictingPlans.length} active meal plan(s) with overlapping days:\n\n${plansList}\n\n` +
              `Would you like to set these to "draft" status so you can activate this meal plan?`;
            
            if (window.confirm(confirmMessage)) {
              // Deactivate conflicting plans
              const conflictingIds = conflictingPlans.map(p => p.id);
              const { error: deactivateError } = await supabase
                .from('meal_plans_and_schemas')
                .update({
                  status: 'draft',
                  active_from: null,
                  active_until: null,
                  updated_at: new Date().toISOString()
                })
                .in('id', conflictingIds);
              
              if (deactivateError) {
                alert('Failed to deactivate conflicting meal plans: ' + deactivateError.message);
                setError(null);
                setUpdatingStatus(false);
                return;
              }
              
              // Delete conflicting meal plans from client_meal_plans table (second Supabase)
              console.log('🗑️ Deleting conflicting meal plans from client_meal_plans table...');
              for (const conflictingPlan of conflictingPlans) {
                try {
                  const { error: deleteClientMealPlanError } = await secondSupabase
                    .from('client_meal_plans')
                    .delete()
                    .eq('original_meal_plan_id', conflictingPlan.id);
                  
                  if (deleteClientMealPlanError) {
                    console.error(`Error deleting meal plan ${conflictingPlan.id} from client_meal_plans:`, deleteClientMealPlanError);
                    // Don't fail the entire operation, just log the error
                    console.warn(`Failed to delete meal plan ${conflictingPlan.id} from client_meal_plans, but it was deactivated successfully`);
                  } else {
                    console.log(`✅ Deleted meal plan ${conflictingPlan.id} from client_meal_plans table`);
                  }
                } catch (deleteError) {
                  console.error(`Error deleting meal plan ${conflictingPlan.id} from client_meal_plans:`, deleteError);
                  // Don't fail the entire operation, just log the error
                  console.warn(`Failed to delete meal plan ${conflictingPlan.id} from client_meal_plans, but it was deactivated successfully`);
                }
              }
              
              // Delete reminders for all conflicting plans that were deactivated
              console.log('🗑️ Deleting reminders for conflicting meal plans...');
              for (const conflictingPlan of conflictingPlans) {
                try {
                  const { error: deleteRemindersError } = await supabase
                    .from('scheduled_reminders')
                    .delete()
                    .eq('plan_id', conflictingPlan.id)
                    .eq('plan_type', 'meal_plan');
                  
                  if (deleteRemindersError) {
                    console.error(`Error deleting reminders for plan ${conflictingPlan.id}:`, deleteRemindersError);
                  } else {
                    console.log(`✅ Deleted reminders for conflicting plan ${conflictingPlan.id}`);
                  }
                } catch (deleteError) {
                  console.error(`Error deleting reminders for plan ${conflictingPlan.id}:`, deleteError);
                }
              }
              
              // Now retry the activation
              console.log('🔄 Retrying activation after deactivating conflicting plans...');
              const retryUpdateData = {
                status: statusForm.status,
                user_code: selectedMenuForStatus.user_code,
                ...(statusForm.active_from && { active_from: statusForm.active_from }),
                ...(statusForm.active_until && { active_until: statusForm.active_until }),
                active_days: statusForm.active_days.length > 0 ? statusForm.active_days : null
              };
              
              if (statusForm.status === 'draft' || statusForm.status === 'expired') {
                retryUpdateData.active_from = null;
                retryUpdateData.active_until = null;
              }
              
              if (statusForm.status === 'active' && !statusForm.active_until) {
                const activeFromDate = statusForm.active_from ? new Date(statusForm.active_from) : new Date();
                const oneMonthLater = new Date(activeFromDate);
                oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
                retryUpdateData.active_until = oneMonthLater.toISOString().split('T')[0];
              }
              
              // Retry the update
              await Menu.update(selectedMenuForStatus.id, retryUpdateData);
              
              // Continue with the rest of the activation logic (sync to second DB, notifications, etc.)
              // We need to re-run the activation logic here
              if (statusForm.status === 'active') {
                try {
                  const mealPlanData = selectedMenuForStatus.meal_plan;
                  
                  if (mealPlanData) {
                    console.log('🔄 Syncing meal plan to second database...');
                    
                    const { data: existingClientMealPlan, error: checkError } = await secondSupabase
                      .from('client_meal_plans')
                      .select('id')
                      .eq('original_meal_plan_id', selectedMenuForStatus.id)
                      .maybeSingle();
                    
                    if (!checkError) {
                      const { data: { user } } = await supabase.auth.getUser();
                      const clientMealPlanData = {
                        user_code: selectedMenuForStatus.user_code,
                        dietitian_id: user.id,
                        original_meal_plan_id: selectedMenuForStatus.id,
                        meal_plan_name: selectedMenuForStatus.meal_plan_name || 'Untitled Meal Plan',
                        dietitian_meal_plan: mealPlanData,
                        active: true,
                        active_days: statusForm.active_days.length > 0 ? statusForm.active_days : null,
                        active_from: statusForm.active_from ? new Date(statusForm.active_from).toISOString() : null,
                        active_until: statusForm.active_until ? new Date(statusForm.active_until).toISOString() : null,
                        daily_total_calories: selectedMenuForStatus.daily_total_calories || null,
                        macros_target: selectedMenuForStatus.macros_target || null
                      };
                      
                      if (existingClientMealPlan) {
                        await secondSupabase
                          .from('client_meal_plans')
                          .update(clientMealPlanData)
                          .eq('id', existingClientMealPlan.id);
                      } else {
                        clientMealPlanData.client_edited_meal_plan = null;
                        await secondSupabase
                          .from('client_meal_plans')
                          .insert(clientMealPlanData);
                      }
                    }
                  }
                } catch (secondTableError) {
                  console.error('Error syncing to client_meal_plans table:', secondTableError);
                }
                
                // Send notification
                try {
                  const mealPlanName = selectedMenuForStatus.meal_plan_name || 'Untitled Meal Plan';
                  const userCode = selectedMenuForStatus.user_code;
                  const mealPlanId = selectedMenuForStatus.id;
                  
                  const { data: clientData, error: clientError } = await supabase
                    .from('chat_users')
                    .select('id')
                    .eq('user_code', userCode)
                    .single();
                  
                  if (clientData && !clientError) {
                    const { data: { user } } = await supabase.auth.getUser();
                    await sendMealPlanActivationNotification(userCode, mealPlanName, clientData.id);
                    
                    const activeFrom = statusForm.active_from || selectedMenuForStatus.active_from;
                    const activeUntil = statusForm.active_until || selectedMenuForStatus.active_until;
                    
                    if (activeFrom && activeUntil) {
                      await createWeeklyMealPlanReminders(
                        userCode,
                        mealPlanId,
                        activeFrom,
                        activeUntil,
                        user.id
                      );
                    }
                  }
                } catch (notificationError) {
                  console.error('Notification error (non-blocking):', notificationError);
                }
              }
              
              alert('Menu status updated successfully! Conflicting meal plans have been set to draft.');
              setShowStatusModal(false);
              setSelectedMenuForStatus(null);
              loadMenus();
              setUpdatingStatus(false);
              return;
            } else {
              // User cancelled
              setError(null);
              setUpdatingStatus(false);
              return;
            }
          }
        } catch (fetchErr) {
          console.error('Error fetching conflicting plans:', fetchErr);
        }
      }
      
      // Show error as popup alert for other errors
      let errorMessage = error.message || 'Failed to update menu status';
      
      // Format the overlap error message to be more user-friendly
      if (errorMessage.includes('Cannot activate meal plan')) {
        // Extract and clean up the error message
        const overlapMatch = errorMessage.match(/Cannot activate meal plan: (.+)/);
        if (overlapMatch) {
          let cleanMessage = overlapMatch[1];
          // Format the message more nicely
          cleanMessage = cleanMessage
            .replace(/Existing plan covers: all days/g, 'Existing plan covers all days')
            .replace(/New plan covers: all days/g, 'New plan covers all days')
            .replace(/Existing plan covers: /g, 'Existing plan covers days: ')
            .replace(/New plan covers: /g, 'New plan covers days: ');
          errorMessage = cleanMessage;
        }
      } else if (errorMessage.includes('Failed to update menu status: ')) {
        // Remove the prefix for cleaner message
        errorMessage = errorMessage.replace('Failed to update menu status: ', '');
      }
      
      alert(errorMessage);
      setError(null); // Clear any inline error
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
      
      // Also delete from second database if it exists there
      try {
        console.log('🔄 Checking if meal plan exists in second database to delete...');
        
        const { error: deleteSecondDbError } = await secondSupabase
          .from('client_meal_plans')
          .delete()
          .eq('original_meal_plan_id', menu.id);
        
        if (deleteSecondDbError) {
          console.error('Error deleting from second database:', deleteSecondDbError);
          console.warn('Main meal plan was deleted, but failed to delete from second database');
        } else {
          console.log('✅ Meal plan deleted from second database successfully');
        }
      } catch (secondDbDeleteError) {
        console.error('Error deleting from second database:', secondDbDeleteError);
        console.warn('Main meal plan was deleted, but failed to delete from second database');
      }
      
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
      const mergedTranslation = {
        ...originalMenu,
        ...translated,
        user_code: originalMenu.user_code,
        meal_plan_name: originalMenu.meal_plan_name
      };
      
      // Cache the translation
      setTranslatedMenus(prev => ({
        ...prev,
        [lang]: mergedTranslation
      }));
      
      setEditedMenu(mergedTranslation);
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

  // Auto-translate menu when language changes to Hebrew and menu is already loaded
  useEffect(() => {
    // Only auto-translate if menu is loaded and we're not already loading/translating
    if (!editedMenu || !originalMenu || loading) return;
    
    // Check if current menu is already in the correct language by comparing with cached translation
    const isCurrentlyHebrew = translatedMenus['he'] && editedMenu === translatedMenus['he'];
    const isCurrentlyEnglish = editedMenu === originalMenu;
    
    if (language === 'he' && !isCurrentlyHebrew) {
      // Check if we already have a Hebrew translation cached
      if (translatedMenus['he']) {
        console.log('🌐 Language is Hebrew, using cached translation');
        setEditedMenu(translatedMenus['he']);
      } else {
        console.log('🌐 Language is Hebrew, auto-translating loaded menu...');
        handleLanguageChange('he');
      }
    } else if (language === 'en' && !isCurrentlyEnglish) {
      // Restore English menu when language changes to English
      console.log('🌐 Language is English, restoring original menu');
      setEditedMenu(originalMenu);
    }
  }, [language, editedMenu, originalMenu, loading, translatedMenus]);

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
            
            // Also delete from second Supabase client_meal_plans table
            try {
              const { error: deleteSecondDbError } = await secondSupabase
                .from('client_meal_plans')
                .delete()
                .eq('original_meal_plan_id', menu.id);
              
              if (deleteSecondDbError) {
                console.error(`Error deleting expired meal plan ${menu.id} from client_meal_plans:`, deleteSecondDbError);
                // Don't increment errorCount as main update succeeded
              } else {
                console.log(`✅ Deleted expired meal plan ${menu.id} from client_meal_plans table`);
              }
            } catch (deleteError) {
              console.error(`Error deleting expired meal plan ${menu.id} from client_meal_plans:`, deleteError);
            }
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

        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2">{translations.ingredients || 'Ingredients'}:</h5>
          {option.ingredients && option.ingredients.length > 0 ? (
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
                        alternativeIndex={option.alternativeIndex}
                        translations={translations}
                        autoFocus={ingredient.item === ''}
                      />
                      <div className="flex items-center gap-1">
                        {ingredient['portionSI(gram)'] && (
                          <span className="text-gray-600 text-xs">
                            ({ingredient['portionSI(gram)']}g)
                          </span>
                        )}
                        <EditableHouseholdMeasure
                          value={ingredient.household_measure}
                          onChange={handleHouseholdMeasureChange}
                          mealIndex={option.mealIndex}
                          optionIndex={isAlternative ? 'alternative' : 'main'}
                          ingredientIndex={idx}
                          alternativeIndex={option.alternativeIndex}
                          translations={translations}
                        />
                        <button
                          onClick={() =>
                            handleOpenPortionDialog(
                              ingredient,
                              option.mealIndex,
                              isAlternative ? 'alternative' : 'main',
                              idx,
                              option.alternativeIndex
                            )
                          }
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded text-xs"
                          title={translations?.editPortion || 'Edit portion size'}
                        >
                          ✏️
                        </button>
                      </div>
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
          ) : (
            <div className="text-gray-500 text-sm italic mb-2">
              {translations.noIngredients || 'No ingredients added yet'}
            </div>
          )}

          <div className="flex justify-end mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddIngredient(option.mealIndex, isAlternative ? 'alternative' : 'main', option.alternativeIndex)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md shadow-sm transition-all duration-200 hover:shadow-md ${
                isAlternative
                  ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 hover:from-blue-100 hover:to-blue-200 hover:border-blue-400 text-blue-700 hover:text-blue-800'
                  : 'bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 hover:from-green-100 hover:to-green-200 hover:border-green-400 text-green-700 hover:text-green-800'
              }`}
            >
              <Plus className="w-3 h-3 mr-1.5" />
              {translations.addIngredient || 'Add Ingredient'}
            </Button>
          </div>
        </div>
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
        <IngredientPortionDialog
          isOpen={showPortionDialog}
          ingredient={selectedIngredientForDialog}
          translations={translations}
          onClose={handleClosePortionDialog}
          onConfirm={handleConfirmPortionDialog}
        />
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
                  {menu.active_days && menu.active_days.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{translations.activeDays || 'Active Days'}:</span>
                      <div className="flex gap-1">
                        {[
                          { value: 0, label: 'S' },
                          { value: 1, label: 'M' },
                          { value: 2, label: 'T' },
                          { value: 3, label: 'W' },
                          { value: 4, label: 'T' },
                          { value: 5, label: 'F' },
                          { value: 6, label: 'S' }
                        ].map(day => (
                          <span
                            key={day.value}
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                              menu.active_days.includes(day.value)
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-200 text-gray-400'
                            }`}
                          >
                            {day.label}
                          </span>
                        ))}
                      </div>
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
                  onValueChange={(value) => {
                    // Set default dates when switching to 'active' if not already set
                    if (value === 'active' && !statusForm.active_from) {
                      const today = new Date();
                      const oneMonthLater = new Date();
                      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
                      
                      setStatusForm(prev => ({
                        ...prev,
                        status: value,
                        active_from: today.toISOString().split('T')[0],
                        active_until: oneMonthLater.toISOString().split('T')[0]
                      }));
                    } else {
                      setStatusForm(prev => ({ ...prev, status: value }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{translations.draft || 'Draft'}</SelectItem>
                    <SelectItem value="active">{translations.active || 'Active'}</SelectItem>
                    <SelectItem value="expired">{translations.expired || 'Expired'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {statusForm.status === 'active' && (
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {translations.activeDays || 'Active Days'} ({translations.optional || 'Optional'})
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      {translations.activeDaysDescription || 'Select specific days when this meal plan should be active. Leave empty for all days.'}
                    </p>
                    <div className="grid grid-cols-7 gap-2">
                      {[
                        { value: 0, label: translations.sunday || 'Sun', fullLabel: translations.sundayFull || 'Sunday' },
                        { value: 1, label: translations.monday || 'Mon', fullLabel: translations.mondayFull || 'Monday' },
                        { value: 2, label: translations.tuesday || 'Tue', fullLabel: translations.tuesdayFull || 'Tuesday' },
                        { value: 3, label: translations.wednesday || 'Wed', fullLabel: translations.wednesdayFull || 'Wednesday' },
                        { value: 4, label: translations.thursday || 'Thu', fullLabel: translations.thursdayFull || 'Thursday' },
                        { value: 5, label: translations.friday || 'Fri', fullLabel: translations.fridayFull || 'Friday' },
                        { value: 6, label: translations.saturday || 'Sat', fullLabel: translations.saturdayFull || 'Saturday' }
                      ].map(day => (
                        <div key={day.value} className="flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => {
                              const isSelected = statusForm.active_days.includes(day.value);
                              setStatusForm(prev => ({
                                ...prev,
                                active_days: isSelected
                                  ? prev.active_days.filter(d => d !== day.value)
                                  : [...prev.active_days, day.value].sort((a, b) => a - b)
                              }));
                            }}
                            className={`w-12 h-12 rounded-full flex items-center justify-center font-medium text-sm transition-all ${
                              statusForm.active_days.includes(day.value)
                                ? 'bg-green-500 text-white border-2 border-green-600 shadow-md'
                                : 'bg-gray-100 text-gray-600 border-2 border-gray-300 hover:bg-gray-200'
                            }`}
                            title={day.fullLabel}
                          >
                            {day.label}
                          </button>
                        </div>
                      ))}
                    </div>
                    {statusForm.active_days.length === 0 && (
                      <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                        <span>ℹ️</span>
                        {translations.allDaysSelected || 'No days selected - meal plan will be active every day'}
                      </p>
                    )}
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