import React, { useState, useEffect } from 'react';

import { ChatUser, FoodLogs } from '@/api/entities';

import { useLanguage } from '@/contexts/LanguageContext';

import { 

  Search, 

  UserPlus, 

  Users as UsersIcon, 

  Mail, 

  Phone, 

  Edit,

  Plus,

  Filter,

  ArrowUpDown,

  ArrowUp,

  ArrowDown,

  X,

  Trash2

} from 'lucide-react';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Textarea } from '@/components/ui/textarea';

import {

  Card,

  CardContent,

  CardDescription,

  CardHeader,

  CardTitle,

} from '@/components/ui/card';

import {

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableHeader,

  TableRow,

} from '@/components/ui/table';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';

import { Label } from '@/components/ui/label';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Alert, AlertDescription } from '@/components/ui/alert';

import { Badge } from '@/components/ui/badge';

import { Slider } from '@/components/ui/slider';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { Separator } from '@/components/ui/separator';



const generateUniqueCode = async () => {

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let code = '';

  let isUnique = false;

  let attempts = 0;

  const maxAttempts = 10;



  while (!isUnique && attempts < maxAttempts) {

    // Generate 8-letter code

    code = '';

    for (let i = 0; i < 8; i++) {

      code += letters.charAt(Math.floor(Math.random() * letters.length));

    }



    try {

      // Check if code exists using ChatUser.get

      const existingUser = await ChatUser.get(code);

      // If no user found, code is unique

      if (!existingUser) {

        isUnique = true;

      }

    } catch (error) {

      // If error (user not found), code is unique

      isUnique = true;

    }



    attempts++;

  }



  return code;

};



export default function Clients() {

  const { translations, language } = useLanguage();

  const [clients, setClients] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);

  const [currentClient, setCurrentClient] = useState(null);

  const [loading, setLoading] = useState(false);

  const [deleteLoading, setDeleteLoading] = useState(null); // Track which client is being deleted

  const [error, setError] = useState(null);

  const [showAll, setShowAll] = useState(false);

  

  // Sorting and filtering state

  const [sortField, setSortField] = useState('created_at');

  const [sortDirection, setSortDirection] = useState('desc');

  const [filters, setFilters] = useState({

    goal: 'all',

    activity: 'all',

    gender: 'all',

    ageRange: { min: '', max: '' }

  });

  const [showFilters, setShowFilters] = useState(false);

  

  const getDefaultMealPlanStructure = (t) => ([

    { key: 'breakfast', meal: t.breakfast || 'Breakfast', calories_pct: 30, description: '', calories: 0, locked: false },

    { key: 'lunch',      meal: t.lunch || 'Lunch',         calories_pct: 30, description: '', calories: 0, locked: false },

    { key: 'dinner',     meal: t.dinner || 'Dinner',       calories_pct: 30, description: '', calories: 0, locked: false },

    { key: 'snacks',     meal: t.snacks || 'Snack',        calories_pct: 10, description: '', calories: 0, locked: false },

  ]);



  const [formData, setFormData] = useState({

    user_code: '',

    full_name: '',

    email: '',

    phone_number: '',

    city: '',

    age: '',

    date_of_birth: '',

    gender: '',

    weight_kg: '',

    height_cm: '',

    food_allergies: '',

    macros: {

      fat: '',

      carbs: '',

      protein: ''

    },

    dailyTotalCalories: '',

    food_limitations: '',

    Activity_level: '',

    goal: '',

    number_of_meals: '',

    client_preference: '',

    food_diary: '',

    region: 'israel',

    recommendations: '',

    meal_plan_structure: getDefaultMealPlanStructure(translations)

  });



  // Add macro slider state

  const [macroSliders, setMacroSliders] = useState({ protein: 0, carbs: 0, fat: 0 });



  // Enhanced macro calculation state

  const [macroInputs, setMacroInputs] = useState({

    protein: { percentage: 0, grams: 0, gramsPerKg: 0 },

    carbs: { percentage: 0, grams: 0, gramsPerKg: 0 },

    fat: { percentage: 0, grams: 0, gramsPerKg: 0 }

  });



  // Track previous macro distribution for smart rebalancing

  const [previousMacroDistribution, setPreviousMacroDistribution] = useState({

    protein: 30,

    carbs: 40,

    fat: 30

  });



  // Track which macros are locked (won't be rebalanced)

  const [lockedMacros, setLockedMacros] = useState({

    protein: false,

    carbs: false,

    fat: false

  });



  // Track which fields have been touched/visited

  const [touchedFields, setTouchedFields] = useState({});



  // Track if form has been submitted (to show validation errors)

  const [formSubmitted, setFormSubmitted] = useState(false);

  

  // State for food logs analysis

  const [foodLogsAnalysis, setFoodLogsAnalysis] = useState(null);

  const [analyzingFoodLogs, setAnalyzingFoodLogs] = useState(false);

  const [userCodeTimeout, setUserCodeTimeout] = useState(null);

  const [translatingPreferences, setTranslatingPreferences] = useState(false);

  const [analyzingFoodDiary, setAnalyzingFoodDiary] = useState(false);
  const [foodLimitationsFromOnboarding, setFoodLimitationsFromOnboarding] = useState(false);
  const [clientPreferencesFromOnboarding, setClientPreferencesFromOnboarding] = useState(false);



  // State for temporary calorie inputs (before Enter confirmation)

  const [tempCalorieInputs, setTempCalorieInputs] = useState({});

  const [calorieInputErrors, setCalorieInputErrors] = useState({});



  // Check if all required fields for Harris-Benedict calculation are filled

  const hasRequiredFieldsForCalculation = () => {

    return formData.age && formData.gender && formData.weight_kg && formData.height_cm && formData.Activity_level;

  };



  // Check if a field should show error styling

  const shouldShowError = (fieldName) => {

    return formSubmitted && (!formData[fieldName] || formData[fieldName].toString().trim() === '');

  };



  // Mark field as touched when user interacts with it

  const handleFieldBlur = (fieldName) => {

    setTouchedFields(prev => ({ ...prev, [fieldName]: true }));

  };



  // Calculate age from date of birth

  const calculateAgeFromBirthDate = (birthDate) => {

    if (!birthDate) return '';

    

    const today = new Date();

    const birth = new Date(birthDate);

    

    let age = today.getFullYear() - birth.getFullYear();

    const monthDiff = today.getMonth() - birth.getMonth();

    

    // Adjust age if birthday hasn't occurred this year

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {

      age--;

    }

    

    return age.toString();

  };



  // Check if locked macros prevent reaching 100% total

  const checkLockedMacrosConflict = () => {

    const lockedTotal = Object.entries(lockedMacros)

      .filter(([_, isLocked]) => isLocked)

      .reduce((sum, [macro, _]) => sum + macroInputs[macro].percentage, 0);

    

    return {

      hasConflict: lockedTotal > 100,

      lockedTotal: lockedTotal,

      message: lockedTotal > 100 

        ? `Locked macros total ${lockedTotal.toFixed(1)}%, which exceeds 100%. Unlock some macros to continue.`

        : null

    };

  };



  // Calculate macros based on different input methods

  const calculateMacrosFromInputs = (inputType, value, macroType) => {

    const calories = parseInt(formData.dailyTotalCalories) || 0;

    const weight = parseFloat(formData.weight_kg) || 0;

    

    if (calories <= 0) return;



    let newMacros = { ...macroInputs };

    let targetPercentage = 0;

    

    // Calculate target percentage based on input type

    if (inputType === 'percentage') {

      targetPercentage = Math.max(0, Math.min(100, value));

    } else if (inputType === 'grams') {

      targetPercentage = calories > 0 ? (value * (macroType === 'fat' ? 9 : 4) / calories) * 100 : 0;

    } else if (inputType === 'gramsPerKg') {

      const grams = weight > 0 ? value * weight : 0;

      targetPercentage = calories > 0 ? (grams * (macroType === 'fat' ? 9 : 4) / calories) * 100 : 0;

    }

    

    // Update the target macro

    const grams = Math.round((targetPercentage / 100) * calories / (macroType === 'fat' ? 9 : 4));

    newMacros[macroType] = {

      percentage: Math.round(targetPercentage * 1000) / 1000, // Allow 3 decimal places

      grams: grams,

      gramsPerKg: weight > 0 ? Math.round((grams / weight) * 1000) / 1000 : 0 // Allow 3 decimal places

    };

    

    // Simple proportional rebalancing: distribute remaining percentage among other unlocked macros

    const otherMacros = ['protein', 'carbs', 'fat'].filter(key => key !== macroType);

    const unlockedOtherMacros = otherMacros.filter(key => !lockedMacros[key]);

    const lockedOtherMacros = otherMacros.filter(key => lockedMacros[key]);

    

    // Calculate locked percentage total

    const lockedTotal = lockedOtherMacros.reduce((sum, key) => sum + (newMacros[key]?.percentage || 0), 0);

    

    // Calculate available percentage for unlocked macros

    const availableForUnlocked = 100 - targetPercentage - lockedTotal;

    

    // Check if we have enough space

    if (availableForUnlocked < 0) {

      console.warn(`Cannot maintain 100% total. Locked: ${lockedTotal.toFixed(1)}%, Target: ${targetPercentage.toFixed(1)}%`);

      return;

    }

    

    // Distribute available percentage among unlocked macros proportionally

    if (unlockedOtherMacros.length > 0) {

      const currentUnlockedTotal = unlockedOtherMacros.reduce((sum, key) => sum + (newMacros[key]?.percentage || 0), 0);

      

      if (currentUnlockedTotal > 0) {

        // Scale proportionally

        const scaleFactor = availableForUnlocked / currentUnlockedTotal;

        

        unlockedOtherMacros.forEach(key => {

          const newPercentage = Math.max(0, (newMacros[key]?.percentage || 0) * scaleFactor);

          const newGrams = Math.round((newPercentage / 100) * calories / (key === 'fat' ? 9 : 4));

          

          newMacros[key] = {

            percentage: Math.round(newPercentage * 1000) / 1000, // Allow 3 decimal places

            grams: newGrams,

            gramsPerKg: weight > 0 ? Math.round((newGrams / weight) * 1000) / 1000 : 0 // Allow 3 decimal places

          };

        });

      } else {

        // All unlocked macros are at 0%, distribute equally

        const percentagePerMacro = availableForUnlocked / unlockedOtherMacros.length;

        

        unlockedOtherMacros.forEach(key => {

          const newGrams = Math.round((percentagePerMacro / 100) * calories / (key === 'fat' ? 9 : 4));

          

          newMacros[key] = {

            percentage: Math.round(percentagePerMacro * 1000) / 1000, // Allow 3 decimal places

            grams: newGrams,

            gramsPerKg: weight > 0 ? Math.round((newGrams / weight) * 1000) / 1000 : 0 // Allow 3 decimal places

          };

        });

      }

    }

    

    // Final adjustment to ensure total is exactly 100%

    const currentTotal = newMacros.protein.percentage + newMacros.carbs.percentage + newMacros.fat.percentage;

    const difference = 100 - currentTotal;

    

    if (Math.abs(difference) > 0.01 && unlockedOtherMacros.length > 0) {

      // Adjust the largest unlocked macro to fix rounding

      const largestUnlocked = unlockedOtherMacros.reduce((largest, current) => 

        (newMacros[current]?.percentage || 0) > (newMacros[largest]?.percentage || 0) ? current : largest

      );

      

      const adjustedPercentage = (newMacros[largestUnlocked]?.percentage || 0) + difference;

      const adjustedGrams = Math.round((adjustedPercentage / 100) * calories / (largestUnlocked === 'fat' ? 9 : 4));

      

      newMacros[largestUnlocked] = {

        percentage: Math.round(adjustedPercentage * 1000) / 1000, // Allow 3 decimal places

        grams: adjustedGrams,

        gramsPerKg: weight > 0 ? Math.round((adjustedGrams / weight) * 1000) / 1000 : 0 // Allow 3 decimal places

      };

    }



    setMacroInputs(newMacros);

    

    // Update macro sliders for compatibility

    setMacroSliders({

      protein: newMacros.protein.grams,

      carbs: newMacros.carbs.grams,

      fat: newMacros.fat.grams

    });

    

    // Update previous distribution for smart rebalancing

    const totalPercentage = newMacros.protein.percentage + newMacros.carbs.percentage + newMacros.fat.percentage;

    if (Math.abs(totalPercentage - 100) < 0.5) {

      setPreviousMacroDistribution({

        protein: newMacros.protein.percentage,

        carbs: newMacros.carbs.percentage,

        fat: newMacros.fat.percentage

      });

    }

  };



  // Calculate total percentages and calories

  const calculateTotals = () => {

    const totalPercentage = macroInputs.protein.percentage + macroInputs.carbs.percentage + macroInputs.fat.percentage;

    const totalCalories = (macroInputs.protein.grams * 4) + (macroInputs.carbs.grams * 4) + (macroInputs.fat.grams * 9);

    return { totalPercentage, totalCalories };

  };



  // Validate macro percentages

  const validateMacroPercentages = () => {

    const total = calculateTotals().totalPercentage;

    const dailyCalories = parseInt(formData.dailyTotalCalories) || 0;

    

    // If daily calories haven't been set yet, don't show red warning for 0% macros

    if (dailyCalories === 0) {

      return { 

        isValid: true, 

        warning: null, 

        total,

        isCaloriesNotSet: true 

      };

    }

    

    const isValid = Math.abs(total - 100) < 0.1; // Allow small rounding differences

    const warning = !isValid ? `Macro percentages should add up to 100%. Current total: ${total.toFixed(1)}%` : null;

    return { isValid, warning, total, isCaloriesNotSet: false };

  };



  // Auto-calculate initial macros when calories change

  useEffect(() => {

    const calories = parseInt(formData.dailyTotalCalories) || 0;

    if (calories > 0 && (!macroInputs.protein.grams && !macroInputs.carbs.grams && !macroInputs.fat.grams)) {

      // Default distribution: 30% protein, 40% carbs, 30% fat (total: 100%)

      const defaultMacros = {

        protein: { 

          percentage: 30, 

          grams: Math.round((0.30 * calories) / 4), 

          gramsPerKg: 0 

        },

        carbs: { 

          percentage: 40, 

          grams: Math.round((0.40 * calories) / 4), 

          gramsPerKg: 0 

        },

        fat: { 

          percentage: 30, 

          grams: Math.round((0.30 * calories) / 9), 

          gramsPerKg: 0 

        }

      };

      

      // Calculate grams per kg if weight is available

      const weight = parseFloat(formData.weight_kg) || 0;

      if (weight > 0) {

        defaultMacros.protein.gramsPerKg = Math.round((defaultMacros.protein.grams / weight) * 1000) / 1000;

        defaultMacros.carbs.gramsPerKg = Math.round((defaultMacros.carbs.grams / weight) * 1000) / 1000;

        defaultMacros.fat.gramsPerKg = Math.round((defaultMacros.fat.grams / weight) * 1000) / 1000;

      }

      

      setMacroInputs(defaultMacros);

      setMacroSliders({

        protein: defaultMacros.protein.grams,

        carbs: defaultMacros.carbs.grams,

        fat: defaultMacros.fat.grams

      });

      

      // Set previous distribution for smart rebalancing

      setPreviousMacroDistribution({

        protein: defaultMacros.protein.percentage,

        carbs: defaultMacros.carbs.percentage,

        fat: defaultMacros.fat.percentage

      });

    }

  }, [formData.dailyTotalCalories, formData.weight_kg]);



  // Update grams per kg when weight changes

  useEffect(() => {

    const weight = parseFloat(formData.weight_kg) || 0;

    if (weight > 0) {

      const updatedMacros = { ...macroInputs };

      Object.keys(updatedMacros).forEach(macro => {

        if (updatedMacros[macro].grams > 0) {

          updatedMacros[macro].gramsPerKg = Math.round((updatedMacros[macro].grams / weight) * 1000) / 1000;

        }

      });

      setMacroInputs(updatedMacros);

    }

  }, [formData.weight_kg]);



  // Harris-Benedict calculation function (original formula)

  const calculateHarrisBenedict = (age, gender, weight, height, activityLevel, goal) => {

    if (!age || !gender || !weight || !height || !activityLevel) {

      return null;

    }



    // Convert height to cm if it's in meters

    let heightInCm = parseFloat(height);

    if (heightInCm > 0 && heightInCm < 10) {

      heightInCm = heightInCm * 100;

    }



    // Calculate BMR using Harris-Benedict equation

    let bmr = 0;

    if (gender === 'male') {

      bmr = 88.362 + (13.397 * parseFloat(weight)) + (4.799 * heightInCm) - (5.677 * parseFloat(age));

    } else {

      bmr = 447.593 + (9.247 * parseFloat(weight)) + (3.098 * heightInCm) - (4.330 * parseFloat(age));

    }



    // Apply activity multiplier

    let activityMultiplier = 1.2; // Sedentary as default

    switch (activityLevel) {

      case 'sedentary': activityMultiplier = 1.2; break;

      case 'light': activityMultiplier = 1.375; break;

      case 'moderate': activityMultiplier = 1.55; break;

      case 'very': activityMultiplier = 1.725; break;

      case 'extra': activityMultiplier = 1.9; break;

    }



    // Calculate TDEE (Total Daily Energy Expenditure)

    let tdee = bmr * activityMultiplier;



    // Adjust for goal

    switch (goal) {

      case 'lose': tdee -= 500; break;

      case 'gain': tdee += 500; break;

      case 'muscle': tdee += 300; break;

      // 'maintain' and 'health' don't change the calculation

    }



    return Math.round(tdee);

  };



  // Auto-calculate calories when relevant fields change

  useEffect(() => {

    const calculatedCalories = calculateHarrisBenedict(

      formData.age,

      formData.gender,

      formData.weight_kg,

      formData.height_cm,

      formData.Activity_level,

      formData.goal

    );



    if (calculatedCalories && calculatedCalories > 0) {

      setFormData(prev => ({ ...prev, dailyTotalCalories: calculatedCalories.toString() }));

      

      // Update macros to match the new calorie total

      const currentPercentages = {

        protein: macroInputs.protein.percentage,

        carbs: macroInputs.carbs.percentage,

        fat: macroInputs.fat.percentage

      };

      

      // If we have existing percentages, recalculate grams based on new calories

      if (currentPercentages.protein > 0 || currentPercentages.carbs > 0 || currentPercentages.fat > 0) {

        const weight = parseFloat(formData.weight_kg) || 0;

        const updatedMacros = {

          protein: {

            percentage: currentPercentages.protein,

            grams: Math.round(((currentPercentages.protein / 100) * calculatedCalories) / 4),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.protein / 100) * calculatedCalories) / 4) / weight * 1000) / 1000 : 0

          },

          carbs: {

            percentage: currentPercentages.carbs,

            grams: Math.round(((currentPercentages.carbs / 100) * calculatedCalories) / 4),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.carbs / 100) * calculatedCalories) / 4) / weight * 1000) / 1000 : 0

          },

          fat: {

            percentage: currentPercentages.fat,

            grams: Math.round(((currentPercentages.fat / 100) * calculatedCalories) / 9),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.fat / 100) * calculatedCalories) / 9) / weight * 1000) / 1000 : 0

          }

        };

        

        setMacroInputs(updatedMacros);

        setMacroSliders({

          protein: updatedMacros.protein.grams,

          carbs: updatedMacros.carbs.grams,

          fat: updatedMacros.fat.grams

        });

      }

    } else if (formData.age || formData.gender || formData.weight_kg || formData.height_cm || formData.Activity_level || formData.goal) {

      // Clear calories if we have some data but calculation failed

      setFormData(prev => ({ ...prev, dailyTotalCalories: '' }));

    }

  }, [formData.age, formData.gender, formData.weight_kg, formData.height_cm, formData.Activity_level, formData.goal]);



  // Handle manual calorie changes and recalculate macros

  useEffect(() => {

    const calories = parseInt(formData.dailyTotalCalories) || 0;

    if (calories > 0) {

      // Get current percentages

      const currentPercentages = {

        protein: macroInputs.protein.percentage,

        carbs: macroInputs.carbs.percentage,

        fat: macroInputs.fat.percentage

      };

      

      // If we have existing percentages, recalculate grams based on new calories

      if (currentPercentages.protein > 0 || currentPercentages.carbs > 0 || currentPercentages.fat > 0) {

        const weight = parseFloat(formData.weight_kg) || 0;

        const updatedMacros = {

          protein: {

            percentage: currentPercentages.protein,

            grams: Math.round(((currentPercentages.protein / 100) * calories) / 4),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.protein / 100) * calories) / 4) / weight * 1000) / 1000 : 0

          },

          carbs: {

            percentage: currentPercentages.carbs,

            grams: Math.round(((currentPercentages.carbs / 100) * calories) / 4),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.carbs / 100) * calories) / 4) / weight * 1000) / 1000 : 0

          },

          fat: {

            percentage: currentPercentages.fat,

            grams: Math.round(((currentPercentages.fat / 100) * calories) / 9),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.fat / 100) * calories) / 9) / weight * 1000) / 1000 : 0

          }

        };

        

        setMacroInputs(updatedMacros);

        setMacroSliders({

          protein: updatedMacros.protein.grams,

          carbs: updatedMacros.carbs.grams,

          fat: updatedMacros.fat.grams

        });

      }

    }

  }, [formData.dailyTotalCalories]);



  useEffect(() => {

    loadClients();

  }, []);







  // Sorting function

  const sortClients = (clients) => {

    return [...clients].sort((a, b) => {

      // First, prioritize users with names over those without names

      const aHasName = a.full_name && a.full_name.trim() !== '';

      const bHasName = b.full_name && b.full_name.trim() !== '';

      

      if (aHasName && !bHasName) return -1; // a has name, b doesn't - a comes first

      if (!aHasName && bHasName) return 1;  // b has name, a doesn't - b comes first

      

      // If both have names or both don't have names, apply normal sorting

      let aValue = a[sortField];

      let bValue = b[sortField];

      

      // Handle nested properties

      if (sortField === 'macros.protein') {

        aValue = a.macros?.protein || 0;

        bValue = b.macros?.protein || 0;

      } else if (sortField === 'macros.carbs') {

        aValue = a.macros?.carbs || 0;

        bValue = b.macros?.carbs || 0;

      } else if (sortField === 'macros.fat') {

        aValue = a.macros?.fat || 0;

        bValue = b.macros?.fat || 0;

      }

      

      // Convert to numbers for numeric fields

      if (['age', 'weight_kg', 'height_cm', 'dailyTotalCalories'].includes(sortField)) {

        aValue = parseFloat(aValue) || 0;

        bValue = parseFloat(bValue) || 0;

      }

      

      // Handle date fields

      if (sortField === 'created_at') {

        aValue = a.created_at ? new Date(a.created_at) : new Date(0);

        bValue = b.created_at ? new Date(b.created_at) : new Date(0);

      }

      

      // Handle string comparison

      if (typeof aValue === 'string' && typeof bValue === 'string') {

        aValue = aValue.toLowerCase();

        bValue = bValue.toLowerCase();

      }

      

      if (sortDirection === 'asc') {

        return aValue > bValue ? 1 : -1;

      } else {

        return aValue < bValue ? 1 : -1;

      }

    });

  };



  // Filtering function

  const filterClients = (clients) => {

    return clients.filter(client => {

      // Goal filter

      if (filters.goal && filters.goal !== 'all' && client.goal !== filters.goal) return false;

      

      // Activity filter

      if (filters.activity && filters.activity !== 'all' && client.Activity_level !== filters.activity) return false;

      

      // Gender filter

      if (filters.gender && filters.gender !== 'all' && client.gender !== filters.gender) return false;

      

      // Age range filter

      if (filters.ageRange.min && client.age < parseInt(filters.ageRange.min)) return false;

      if (filters.ageRange.max && client.age > parseInt(filters.ageRange.max)) return false;

      

      return true;

    });

  };



  // Handle sort column click

  const handleSort = (field) => {

    if (sortField === field) {

      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');

    } else {

      setSortField(field);

      setSortDirection('asc');

    }

  };



  // Clear all filters

  const clearFilters = () => {

    setFilters({

      goal: 'all',

      activity: 'all',

      gender: 'all',

      ageRange: { min: '', max: '' }

    });

  };



  // Get sort icon

  const getSortIcon = (field) => {

    if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;

    return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;

  };



  // Function to translate text using the backend API

  const translateText = async (text, targetLang = 'he') => {

    try {

      const response = await fetch('https://dietitian-be.azurewebsites.net/api/translate-text', {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          text: text,

          targetLang: targetLang

        }),

      });



      if (!response.ok) {

        throw new Error('Translation failed');

      }



      const result = await response.json();

      return result.translatedText || text;

    } catch (error) {

      console.error('Error translating text:', error);

      return text; // Return original text if translation fails

    }

  };



  // Function to check for existing food logs and populate preferences

  const checkForFoodLogs = async (userCode) => {

    if (!userCode || userCode.trim() === '') {

      setFoodLogsAnalysis(null);

      return;

    }



    setAnalyzingFoodLogs(true);

    setFoodLogsAnalysis(null);



    try {

      // Call the new eating habits analysis API

      const response = await fetch('https://dietitian-be.azurewebsites.net/api/analyze-eating-habits', {

      // const response = await fetch('http://127.0.0.1:8000/api/analyze-eating-habits', {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          user_code: userCode

        }),

      });



      if (!response.ok) {

        if (response.status === 404) {

          console.log('No food logs found for this user');

          setFoodLogsAnalysis(null);

          return;

        }

        throw new Error(`HTTP error! status: ${response.status}`);

      }



      const analysisResult = await response.json();

      

      if (analysisResult.analysis) {

        // Store the analysis data

        const analysisData = analysisResult.analysis_data || {};

        setFoodLogsAnalysis({

          ...analysisData,

          analysis: analysisResult.analysis

        });

        

        console.log('Setting foodLogsAnalysis:', {

          ...analysisData,

          analysis: analysisResult.analysis

        });

        

        // Put the LLM analysis directly in the food diary textbox

        let analysisText = analysisResult.analysis;

        

        // Translate to Hebrew if the site is in Hebrew mode

        if (language === 'he') {

          try {

            analysisText = await translateText(analysisText, 'he');

          } catch (translationError) {

            console.error('Failed to translate analysis:', translationError);

            // Keep original text if translation fails

          }

        }

        

        setFormData(prev => ({

          ...prev,

          client_preference: analysisText

        }));

        

        // Show a notification to the user

        alert(`${translations.foodLogsFound || 'Food logs found'}: ${analysisData.total_logs || 0} ${translations.entriesFound || 'entries found'}. ${translations.preferencesAutoPopulated || 'Analysis completed'}.`);

      } else {

        setFoodLogsAnalysis(null);

      }

    } catch (error) {

      console.log('No existing food logs found or error occurred:', error.message);

      setFoodLogsAnalysis(null);

      // This is expected if no food logs exist, so we don't show an error

    } finally {

      setAnalyzingFoodLogs(false);

    }

  };



  const analyzeFoodDiary = async () => {

    if (!formData.user_code || formData.user_code.trim() === '') {

      alert('Please enter a client code first to analyze food logs');

      return;

    }



    try {

      console.log('🔍 Starting food diary analysis...');

      setAnalyzingFoodDiary(true);

      console.log('🔍 Analyzing food logs for food diary...');

      

      const response = await fetch('https://dietitian-be.azurewebsites.net/api/analyze-eating-habits', {

        // const response = await fetch('http://127.0.0.1:8000/api/analyze-eating-habits', {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          user_code: formData.user_code

        }),

      });



      if (!response.ok) {

        if (response.status === 404) {

          console.log('No food logs found for this user');

          alert('No food logs found for this user');

          return;

        }

        throw new Error(`HTTP error! status: ${response.status}`);

      }



      const analysisResult = await response.json();

      

      if (analysisResult.analysis) {

        // Put the LLM analysis directly in the food diary textbox

        let analysisText = analysisResult.analysis;

        

        // Translate to Hebrew if the site is in Hebrew mode

        if (language === 'he') {

          try {

            analysisText = await translateText(analysisText, 'he');

          } catch (translationError) {

            console.error('Failed to translate analysis:', translationError);

            // Keep original text if translation fails

          }

        }

        

        setFormData(prev => ({

          ...prev,

          food_diary: analysisText

        }));

        

        // Show a notification to the user

        alert(`${translations.foodLogsFound || 'Food logs found'}: ${analysisResult.analysis_data?.total_logs || 0} ${translations.entriesFound || 'entries found'}. ${translations.foodDiaryPopulated || 'Food diary populated'}.`);

      } else {

        alert('No analysis available for this user');

      }

    } catch (error) {

      console.log('No existing food logs found or error occurred:', error.message);

      alert('Error analyzing food logs: ' + error.message);

    } finally {

      setAnalyzingFoodDiary(false);

    }

  };







  // When macroInputs change, update formData.macros

  useEffect(() => {

    setFormData(fd => ({ 

      ...fd, 

      macros: {

        protein: macroInputs.protein.grams,

        carbs: macroInputs.carbs.grams,

        fat: macroInputs.fat.grams

      }

    }));

  }, [macroInputs]);



  // Reset macro inputs when dialog opens for new user

  useEffect(() => {

    if (dialogOpen && !currentClient) {

      setMacroInputs({

        protein: { percentage: 0, grams: 0, gramsPerKg: 0 },

        carbs: { percentage: 0, grams: 0, gramsPerKg: 0 },

        fat: { percentage: 0, grams: 0, gramsPerKg: 0 }

      });

      setMacroSliders({ protein: 0, carbs: 0, fat: 0 });

    }

  }, [dialogOpen, currentClient]);



  // Cleanup timeout on unmount

  useEffect(() => {

    return () => {

      if (userCodeTimeout) {

        clearTimeout(userCodeTimeout);

      }

    };

  }, [userCodeTimeout]);



  const loadClients = async () => {

    setLoading(true);

    try {

      const clientData = await ChatUser.list();

      setClients(clientData || []);

      setError(null);

    } catch (error) {

      console.error('Error loading clients:', error);

      setError(translations.failedToLoadClients);

      setClients([]);

    } finally {

      setLoading(false);

    }

  };



  const filteredClients = clients.filter(client => 

    client.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||

    client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||

    client.user_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||

    client.phone_number?.includes(searchTerm)

  );



  // Apply filters and sorting

  const processedClients = sortClients(filterClients(filteredClients));



  // Limit displayed clients to 5 unless "Show All" is clicked or searching

  const displayedClients = searchTerm || showAll ? processedClients : processedClients.slice(0, 5);

  const hasMoreClients = !searchTerm && !showAll && processedClients.length > 5;



  const resetForm = async () => {

    const newUserCode = await generateUniqueCode();

    setFormData({

      user_code: newUserCode,

      full_name: '',

      email: '',

      phone_number: '',

      city: '',

      age: '',

      date_of_birth: '',

      gender: '',

      weight_kg: '',

      height_cm: '',

      food_allergies: '',

      macros: {

        fat: '',

        carbs: '',

        protein: ''

      },

      dailyTotalCalories: '', // Will be calculated automatically when required fields are filled

      food_limitations: '',

      Activity_level: '',

      goal: '',

      number_of_meals: '4',

      client_preference: '',

      food_diary: '',

      region: 'israel',

      recommendations: '',

      meal_plan_structure: getDefaultMealPlanStructure(translations)

    });

    // Reset macro inputs and sliders to 0 when adding new user

    setMacroInputs({

      protein: { percentage: 0, grams: 0, gramsPerKg: 0 },

      carbs: { percentage: 0, grams: 0, gramsPerKg: 0 },

      fat: { percentage: 0, grams: 0, gramsPerKg: 0 }

    });

    setMacroSliders({ protein: 0, carbs: 0, fat: 0 });

    // Reset food logs analysis

    setFoodLogsAnalysis(null);

    setAnalyzingFoodLogs(false);
    
    setFoodLimitationsFromOnboarding(false);
    
    setClientPreferencesFromOnboarding(false);

    if (userCodeTimeout) {

      clearTimeout(userCodeTimeout);

      setUserCodeTimeout(null);

    }

    setTranslatingPreferences(false);

  };



  const handleAdd = async () => {

    setCurrentClient(null);

    await resetForm();

    setFormSubmitted(false);

    setTouchedFields({});

    setDialogOpen(true);

  };



  const handleEdit = async (client) => {

    setCurrentClient(client);

    

    // Parse macros for sliders

    const proteinValue = client.macros?.protein ? parseInt(client.macros.protein.toString().replace('g', '')) || 0 : 0;

    const carbsValue = client.macros?.carbs ? parseInt(client.macros.carbs.toString().replace('g', '')) || 0 : 0;

    const fatValue = client.macros?.fat ? parseInt(client.macros.fat.toString().replace('g', '')) || 0 : 0;

    

    // Calculate age from date of birth if available, otherwise use stored age

    const calculatedAge = client.date_of_birth ? calculateAgeFromBirthDate(client.date_of_birth) : (client.age?.toString() || '');

    

    const formDataToSet = {

      user_code: client.user_code || await generateUniqueCode(),

      full_name: client.full_name || '',

      email: client.email || '',

      phone_number: client.phone_number || '',

      city: client.city || '',

      age: calculatedAge,

      date_of_birth: client.date_of_birth || '',

      gender: client.gender || '',

      weight_kg: client.weight_kg?.toString() || '',

      height_cm: client.height_cm?.toString() || '',

      food_allergies: Array.isArray(client.food_allergies) ? client.food_allergies.join(', ') : client.food_allergies || '',

      macros: {

        fat: client.macros?.fat ? client.macros.fat.toString().replace('g', '') : '',

        carbs: client.macros?.carbs ? client.macros.carbs.toString().replace('g', '') : '',

        protein: client.macros?.protein ? client.macros.protein.toString().replace('g', '') : ''

      },

      dailyTotalCalories: client.dailyTotalCalories?.toString() || '',

      food_limitations: (() => {
        // First check if food_limitations exists and has content
        if (client.food_limitations) {
          if (Array.isArray(client.food_limitations)) {
            return client.food_limitations.join(', ');
          } else if (typeof client.food_limitations === 'object') {
            return JSON.stringify(client.food_limitations, null, 2);
          } else {
            return client.food_limitations;
          }
        }
        
        // If food_limitations is null/empty, try to get from onboarding_data
        try {
          if (client.onboarding_data && typeof client.onboarding_data === 'object') {
            const onboardingData = client.onboarding_data;
            if (onboardingData.food_restrictions) {
              console.log('📋 Found food_restrictions in onboarding_data:', onboardingData.food_restrictions);
              setFoodLimitationsFromOnboarding(true);
              return onboardingData.food_restrictions;
            } else if (onboardingData.dietary_preferences) {
              console.log('📋 Found dietary_preferences in onboarding_data as fallback:', onboardingData.dietary_preferences);
              setFoodLimitationsFromOnboarding(true);
              return onboardingData.dietary_preferences;
            }
          } else if (client.onboarding_data && typeof client.onboarding_data === 'string') {
            // Parse JSON string if needed
            const parsedOnboarding = JSON.parse(client.onboarding_data);
            if (parsedOnboarding.food_restrictions) {
              console.log('📋 Found food_restrictions in parsed onboarding_data:', parsedOnboarding.food_restrictions);
              setFoodLimitationsFromOnboarding(true);
              return parsedOnboarding.food_restrictions;
            } else if (parsedOnboarding.dietary_preferences) {
              console.log('📋 Found dietary_preferences in parsed onboarding_data as fallback:', parsedOnboarding.dietary_preferences);
              setFoodLimitationsFromOnboarding(true);
              return parsedOnboarding.dietary_preferences;
            }
          }
        } catch (error) {
          console.warn('Error parsing onboarding_data for food_restrictions:', error);
        }
        
        setFoodLimitationsFromOnboarding(false);
        return '';
      })(),

      Activity_level: client.Activity_level || '',

      goal: client.goal || '',

              number_of_meals: client.number_of_meals?.toString() || '4',

      client_preference: (() => {
        // First check if client_preference exists and has content
        if (client.client_preference) {
          if (typeof client.client_preference === 'object') {
            return JSON.stringify(client.client_preference, null, 2);
          } else {
            return client.client_preference;
          }
        }
        
        // If client_preference is null/empty, try to get from onboarding_data
        try {
          if (client.onboarding_data && typeof client.onboarding_data === 'object') {
            const onboardingData = client.onboarding_data;
            if (onboardingData.food_likes) {
              console.log('📋 Found food_likes in onboarding_data:', onboardingData.food_likes);
              setClientPreferencesFromOnboarding(true);
              return onboardingData.food_likes;
            }
          } else if (client.onboarding_data && typeof client.onboarding_data === 'string') {
            // Parse JSON string if needed
            const parsedOnboarding = JSON.parse(client.onboarding_data);
            if (parsedOnboarding.food_likes) {
              console.log('📋 Found food_likes in parsed onboarding_data:', parsedOnboarding.food_likes);
              setClientPreferencesFromOnboarding(true);
              return parsedOnboarding.food_likes;
            }
          }
        } catch (error) {
          console.warn('Error parsing onboarding_data for food_likes:', error);
        }
        
        setClientPreferencesFromOnboarding(false);
        return '';
      })(),

      food_diary: client.food_diary || '',

      region: client.region || 'israel',

      recommendations: client.recommendations || '',

      meal_plan_structure: client.meal_plan_structure || getDefaultMealPlanStructure(translations)

    };

    

    setFormData(formDataToSet);

    

    // Set macro inputs to match the client's macros

    const calories = client.dailyTotalCalories ? parseInt(client.dailyTotalCalories) : 0;

    const weight = client.weight_kg ? parseFloat(client.weight_kg) : 0;

    

    const macroInputsData = {

      protein: {

        percentage: calories > 0 ? Math.round(((proteinValue * 4) / calories) * 100) : 0,

        grams: proteinValue,

        gramsPerKg: weight > 0 ? Math.round((proteinValue / weight) * 1000) / 1000 : 0

      },

      carbs: {

        percentage: calories > 0 ? Math.round(((carbsValue * 4) / calories) * 100) : 0,

        grams: carbsValue,

        gramsPerKg: weight > 0 ? Math.round((carbsValue / weight) * 1000) / 1000 : 0

      },

      fat: {

        percentage: calories > 0 ? Math.round(((fatValue * 9) / calories) * 100) : 0,

        grams: fatValue,

        gramsPerKg: weight > 0 ? Math.round((fatValue / weight) * 1000) / 1000 : 0

      }

    };

    

    setMacroInputs(macroInputsData);

    setMacroSliders({ protein: proteinValue, carbs: carbsValue, fat: fatValue });

    setFormSubmitted(false);

    setTouchedFields({});

    setDialogOpen(true);

    

    // Recalculate calories after a short delay to ensure form data is set

    setTimeout(() => {

      const calculatedCalories = calculateHarrisBenedict(

        formData.age,

        formData.gender,

        formData.weight_kg,

        formData.height_cm,

        formData.Activity_level,

        formData.goal

      );

      

      if (calculatedCalories && calculatedCalories > 0) {

        setFormData(prev => ({ ...prev, dailyTotalCalories: calculatedCalories.toString() }));

        

        // Update macros to match the new calorie total

        const currentPercentages = {

          protein: macroInputsData.protein.percentage,

          carbs: macroInputsData.carbs.percentage,

          fat: macroInputsData.fat.percentage

        };

        

        const weight = parseFloat(formData.weight_kg) || 0;

        const updatedMacros = {

          protein: {

            percentage: currentPercentages.protein,

            grams: Math.round(((currentPercentages.protein / 100) * calculatedCalories) / 4),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.protein / 100) * calculatedCalories) / 4) / weight * 1000) / 1000 : 0

          },

          carbs: {

            percentage: currentPercentages.carbs,

            grams: Math.round(((currentPercentages.carbs / 100) * calculatedCalories) / 4),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.carbs / 100) * calculatedCalories) / 4) / weight * 1000) / 1000 : 0

          },

          fat: {

            percentage: currentPercentages.fat,

            grams: Math.round(((currentPercentages.fat / 100) * calculatedCalories) / 9),

            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.fat / 100) * calculatedCalories) / 9) / weight * 1000) / 1000 : 0

          }

        };

        

        setMacroInputs(updatedMacros);

        setMacroSliders({

          protein: updatedMacros.protein.grams,

          carbs: updatedMacros.carbs.grams,

          fat: updatedMacros.fat.grams

        });

      }

    }, 100);

  };



  const handleDelete = async (client) => {

    const clientName = client.full_name || client.user_code || 'this client';

    const clientId = client.user_code || client.id;

    

    if (!clientId) {

      setError('Cannot delete client without a valid identifier');

      return;

    }

    

    if (!window.confirm(`${translations.confirmDelete} "${clientName}"? ${translations.deleteWarning}`)) {

      return;

    }

    

    setDeleteLoading(clientId);

    setError(null);

    

    try {

      // First, check if client has associated meal plans

      const { Menu } = await import('@/api/entities');

      const clientMenus = await Menu.filter({ user_code: clientId });

      

      if (clientMenus && clientMenus.length > 0) {

        const confirmDeleteAll = window.confirm(

          `This client has ${clientMenus.length} meal plan(s) associated with them. Do you want to delete the client and ALL their meal plans? This action cannot be undone.`

        );

        

        if (!confirmDeleteAll) {

          setDeleteLoading(null);

          return;

        }

        

        // Delete all meal plans first

        console.log(`Deleting ${clientMenus.length} meal plans for client ${clientId}`);

        for (const menu of clientMenus) {

          try {

            await Menu.delete(menu.id);

            console.log(`✅ Deleted meal plan: ${menu.meal_plan_name || menu.id}`);

          } catch (menuError) {

            console.error(`❌ Failed to delete meal plan ${menu.id}:`, menuError);

            // Continue with other meal plans even if one fails

          }

        }

      }

      

      // Now delete the client

      await ChatUser.delete(clientId);

      await loadClients(); // Reload the clients list

      

      // Show success message

      const message = clientMenus && clientMenus.length > 0 

        ? `${translations.clientDeleted}: ${clientName} (and ${clientMenus.length} meal plan(s))`

        : `${translations.clientDeleted}: ${clientName}`;

      alert(message);

      

    } catch (error) {

      console.error('Error deleting client:', error);

      setError(`${translations.failedToDeleteClient}: ${error.message}`);

    } finally {

      setDeleteLoading(null);

    }

  };



  const parseJsonField = (value, fieldType = 'object') => {

    if (!value || typeof value !== 'string' || value.trim() === '') return null;

    

    // Try to parse as JSON first

    try {

      return JSON.parse(value);

    } catch (e) {

      // If JSON parsing fails, convert text to appropriate structure

      const trimmedValue = value.trim();

      

      if (fieldType === 'array') {

        // Convert to array format

        if (trimmedValue.includes(',')) {

          return trimmedValue.split(',').map(item => item.trim()).filter(item => item);

        }

        return [trimmedValue];

      }

      

      // Default: return as string

      return trimmedValue;

    }

  };



  const parseArrayField = (value) => {

    if (!value || typeof value !== 'string' || value.trim() === '') return [];

    

    // Try JSON parsing first

    try {

      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) return parsed;

      return [parsed.toString()];

    } catch (e) {

      // Convert text to array

      if (value.includes(',')) {

        return value.split(',').map(item => item.trim()).filter(item => item);

      }

      return [value.trim()];

    }

  };



  const parseMacrosField = (protein, carbs, fat) => {

    const result = {};

    

    // Handle protein

    if (protein) {

      if (typeof protein === 'number' && protein > 0) {

        result.protein = `${protein}g`;

      } else if (typeof protein === 'string' && protein.trim()) {

        const p = protein.trim();

        result.protein = p.endsWith('g') ? p : `${p}g`;

      }

    }

    

    // Handle carbs

    if (carbs) {

      if (typeof carbs === 'number' && carbs > 0) {

        result.carbs = `${carbs}g`;

      } else if (typeof carbs === 'string' && carbs.trim()) {

        const c = carbs.trim();

        result.carbs = c.endsWith('g') ? c : `${c}g`;

      }

    }

    

    // Handle fat

    if (fat) {

      if (typeof fat === 'number' && fat > 0) {

        result.fat = `${fat}g`;

      } else if (typeof fat === 'string' && fat.trim()) {

        const f = fat.trim();

        result.fat = f.endsWith('g') ? f : `${f}g`;

      }

    }

    

    return Object.keys(result).length > 0 ? result : null;

  };



  // Check if all required fields are filled

  const validateRequiredFields = () => {

    const requiredFields = [

      { field: 'full_name', label: translations.fullName },

      { field: 'email', label: translations.email },

      { field: 'phone_number', label: translations.phoneNumber },

      { field: 'gender', label: translations.gender },

      { field: 'weight_kg', label: translations.weightKg },

      { field: 'height_cm', label: translations.heightCm },

      { field: 'Activity_level', label: translations.activityLevel },

      { field: 'goal', label: translations.goal }

    ];



    for (const requiredField of requiredFields) {

      if (!formData[requiredField.field] || formData[requiredField.field].toString().trim() === '') {

        return `${requiredField.label} ${translations.isRequired}`;

      }

    }



    // Check if either age or date of birth is provided

    if (!formData.age && !formData.date_of_birth) {

      return `${translations.dateOfBirth} ${translations.isRequired} (${translations.ageWillBeCalculatedAutomatically || 'Age will be calculated automatically'})`;

    }



    return null;

  };



  const handleSubmit = async (e) => {

    e.preventDefault();

    setFormSubmitted(true); // Mark form as submitted to show validation errors

    setLoading(true);

    setError(null);



    try {

      // Validate required fields

      const validationError = validateRequiredFields();

      if (validationError) {

        throw new Error(validationError);

      }



      const submitData = {

        ...formData,

        full_name: formData.full_name.trim(),

        email: formData.email ? formData.email.trim() : '',

        phone_number: formData.phone_number ? formData.phone_number.trim() : '',

        city: formData.city ? formData.city.trim() : '',

        age: formData.age ? parseInt(formData.age) : null,

        weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,

        height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,

        dailyTotalCalories: formData.dailyTotalCalories ? parseInt(formData.dailyTotalCalories) : null,

        number_of_meals: formData.number_of_meals ? parseInt(formData.number_of_meals) : 4,

        date_of_birth: formData.date_of_birth && formData.date_of_birth.trim() !== '' ? formData.date_of_birth : null,

        food_allergies: parseArrayField(formData.food_allergies),

        food_limitations: parseJsonField(formData.food_limitations, 'array'),

        macros: parseMacrosField(macroInputs.protein.grams, macroInputs.carbs.grams, macroInputs.fat.grams),

        client_preference: parseJsonField(formData.client_preference, 'array'),

        food_diary: formData.food_diary ? formData.food_diary.trim() : '',

        recommendations: formData.recommendations ? formData.recommendations.trim() : '',

        meal_plan_structure: formData.meal_plan_structure.map(meal => ({

          meal: meal.meal,

          description: meal.description,

          calories: meal.calories,

          calories_pct: meal.calories_pct

        }))

      };



      console.log('Submitting macros:', {

        macroSliders,

        parsedMacros: parseMacrosField(macroSliders.protein, macroSliders.carbs, macroSliders.fat),

        submitDataMacros: submitData.macros

      });



      if (currentClient) {

        await ChatUser.update(currentClient.user_code, submitData);

      } else {

        await ChatUser.create(submitData);

      }



      // Notify other parts of the app (e.g., header client selector) to refresh the clients list

      if (typeof window !== 'undefined') {

        try {

          const { EventBus } = await import('@/utils/EventBus');

          EventBus.emit('refreshClients');

        } catch (e) {

          console.warn('EventBus refreshClients emit failed:', e);

        }

      }



      setDialogOpen(false);

      setFormSubmitted(false);

      setTouchedFields({});

      loadClients();

      resetForm();

    } catch (error) {

      console.error('Error saving client:', error);

      const errorMessage = currentClient ? translations.failedToUpdateClient : translations.failedToCreateClient;

      setError(`${errorMessage} ${error.message}`);

    } finally {

      setLoading(false);

    }

  };



  const calculateBMI = (weight, height) => {

    // Handle different field names and formats

    let weightValue = weight || 0;

    let heightValue = height || 0;

    

    if (!weightValue || !heightValue) return null;

    

    // Convert to numbers and validate

    let weightNum = parseFloat(weightValue);

    let heightNum = parseFloat(heightValue);

    

    // Validate reasonable ranges

    if (isNaN(weightNum) || isNaN(heightNum)) return null;

    if (weightNum <= 0 || weightNum > 1000) return null; // Weight should be between 0-1000kg

    

    // Handle height in different formats

    if (heightNum <= 0) return null;

    

    // If height is very small (like 1.82), assume it's in meters, convert to cm

    if (heightNum > 0 && heightNum < 10) {

      heightNum = heightNum * 100; // Convert meters to centimeters

    }

    

    // Height should be reasonable (between 50cm and 300cm)

    if (heightNum < 50 || heightNum > 300) return null;

    

    const heightInM = heightNum / 100;

    const bmi = weightNum / (heightInM * heightInM);

    

    // Validate BMI is in reasonable range

    if (bmi < 5 || bmi > 100) return null; // BMI should be between 5-100

    

    return bmi.toFixed(1);

  };



  const getBMIStatus = (bmi) => {

    if (!bmi) return '';

    const bmiNum = parseFloat(bmi);

    if (bmiNum < 18.5) return translations.underweight;

    if (bmiNum < 25) return translations.normal;

    if (bmiNum < 30) return translations.overweight;

    return translations.obese;

  };



  // Calculate meal calories when total calories change

  const calculateMealCalories = (mealPlanStructure, totalCalories) => {

    const total = parseInt(totalCalories) || 0;

    return mealPlanStructure.map(meal => ({

      ...meal,

      calories: Math.round((meal.calories_pct / 100) * total)

    }));

  };



  // Recalculate percentages when a meal's absolute calories change

  const recalculatePercentages = (mealPlanStructure, totalCalories, changedMealIndex = -1) => {

    const total = parseInt(totalCalories) || 0;

    if (total === 0) return mealPlanStructure;



    // If a specific meal was changed, treat it as temporarily locked for this calculation

    if (changedMealIndex >= 0) {

      // Step 1: Calculate L = locked meals + the edited meal

      const lockedMealsCalories = mealPlanStructure

        .filter((meal, index) => meal.locked)

        .reduce((sum, meal) => sum + (meal.calories || 0), 0);

      

      const editedMealCalories = mealPlanStructure[changedMealIndex].calories || 0;

      const totalFixedCalories = lockedMealsCalories + editedMealCalories; // L

      

      // Step 2: Calculate remaining budget for other unlocked meals

      const remainingBudget = total - totalFixedCalories;

      

      // Step 3: Calculate U = sum of other unlocked meals (excluding edited meal and locked meals)

      const otherUnlockedTotal = mealPlanStructure

        .filter((meal, index) => !meal.locked && index !== changedMealIndex)

        .reduce((sum, meal) => sum + (meal.calories || 0), 0);

      

      // Step 4: Calculate scaling factor for other unlocked meals

      const scalingFactor = otherUnlockedTotal > 0 ? remainingBudget / otherUnlockedTotal : 0;

      

      // Step 5: Apply scaling only to other unlocked meals

      return mealPlanStructure.map((meal, index) => {

        if (meal.locked) {

          // Locked meals: keep calories, recalculate percentage

          return {

            ...meal,

            calories_pct: total > 0 ? Math.round(((meal.calories || 0) / total) * 100 * 1000) / 1000 : 0

          };

        } else if (index === changedMealIndex) {

          // Edited meal: keep exact calories entered, recalculate percentage

          return {

            ...meal,

            calories_pct: total > 0 ? Math.round(((meal.calories || 0) / total) * 100 * 1000) / 1000 : 0

          };

        } else {

          // Other unlocked meals: scale calories, recalculate percentage

          const scaledCalories = Math.round((meal.calories || 0) * scalingFactor);

          return {

            ...meal,

            calories: Math.max(0, scaledCalories),

            calories_pct: total > 0 ? Math.round((scaledCalories / total) * 100 * 1000) / 1000 : 0

          };

        }

      });

    }

    

    // If no specific meal changed, just recalculate percentages based on current calories

    return mealPlanStructure.map(meal => ({

      ...meal,

      calories_pct: total > 0 ? Math.round(((meal.calories || 0) / total) * 100 * 1000) / 1000 : 0

    }));

  };



  // Add new meal to meal plan structure

  const addMealToPlan = () => {

    const newMeal = {

      meal: `Meal ${formData.meal_plan_structure.length + 1}`,

      calories_pct: 0,

      description: "",

      calories: 0,

      locked: false

    };

    

    const updatedStructure = [...formData.meal_plan_structure, newMeal];

    setFormData({

      ...formData,

      meal_plan_structure: updatedStructure

    });

  };



  // Remove meal from meal plan structure

  const removeMealFromPlan = (index) => {

    // Step 1: Remove the selected meal

    const updatedStructure = formData.meal_plan_structure.filter((_, i) => i !== index);

    const totalCalories = parseInt(formData.dailyTotalCalories) || 0;

    

    // Update the number_of_meals to match the new structure length

    const newNumberOfMeals = updatedStructure.length;

    

    if (totalCalories === 0) {

      setFormData({

        ...formData,

        meal_plan_structure: updatedStructure,

        number_of_meals: newNumberOfMeals.toString()

      });

      return;

    }

    

    // Step 2: Calculate totals after deletion

    const lockedMealsCalories = updatedStructure

      .filter(meal => meal.locked)

      .reduce((sum, meal) => sum + (meal.calories || 0), 0);

    

    const unlockedMealsCalories = updatedStructure

      .filter(meal => !meal.locked)

      .reduce((sum, meal) => sum + (meal.calories || 0), 0);

    

    // Step 3: Compute space to fill

    const remainingBudget = totalCalories - lockedMealsCalories;

    

    // Check if locked calories exceed target

    if (remainingBudget <= 0) {

      // Warning: locked calories exceed target - set all unlocked to 0

      const rebalancedStructure = updatedStructure.map(meal => {

        if (meal.locked) {

          return {

            ...meal,

            calories_pct: totalCalories > 0 ? Math.round(((meal.calories || 0) / totalCalories) * 100 * 1000) / 1000 : 0

          };

        } else {

          return {

            ...meal,

            calories: 0,

            calories_pct: 0

          };

        }

      });

      

      setFormData({

        ...formData,

        meal_plan_structure: rebalancedStructure,

        number_of_meals: newNumberOfMeals.toString()

      });

      

      // Show warning

      alert(translations.lockedCaloriesExceedTarget || 'Warning: Locked meals exceed daily target. Unlocked meals set to 0 calories.');

      return;

    }

    

    // Step 4: Rescale only the unlocked meals

    const scalingFactor = unlockedMealsCalories > 0 ? remainingBudget / unlockedMealsCalories : 0;

    

    let rebalancedStructure = updatedStructure.map(meal => {

      if (meal.locked) {

        // Locked meals: keep calories, recalculate percentage

        return {

          ...meal,

          calories_pct: totalCalories > 0 ? Math.round(((meal.calories || 0) / totalCalories) * 100 * 1000) / 1000 : 0

        };

      } else {

        // Unlocked meals: scale calories

        const scaledCalories = Math.round((meal.calories || 0) * scalingFactor);

        return {

          ...meal,

          calories: scaledCalories,

          calories_pct: totalCalories > 0 ? Math.round((scaledCalories / totalCalories) * 100 * 1000) / 1000 : 0

        };

      }

    });

    

    // Step 5: Rounding adjustment to ensure exact total

    const currentTotal = rebalancedStructure.reduce((sum, meal) => sum + (meal.calories || 0), 0);

    const difference = totalCalories - currentTotal;

    

    if (difference !== 0) {

      // Find the largest unlocked meal to adjust

      const unlockedMeals = rebalancedStructure

        .map((meal, idx) => ({ meal, idx }))

        .filter(({ meal }) => !meal.locked)

        .sort(({ meal: a }, { meal: b }) => (b.calories || 0) - (a.calories || 0));

      

      if (unlockedMeals.length > 0) {

        const largestUnlockedIndex = unlockedMeals[0].idx;

        rebalancedStructure[largestUnlockedIndex] = {

          ...rebalancedStructure[largestUnlockedIndex],

          calories: Math.max(0, (rebalancedStructure[largestUnlockedIndex].calories || 0) + difference),

          calories_pct: totalCalories > 0 ? Math.round((((rebalancedStructure[largestUnlockedIndex].calories || 0) + difference) / totalCalories) * 100 * 1000) / 1000 : 0

        };

      }

    }

    

    setFormData({

      ...formData,

      meal_plan_structure: rebalancedStructure,

      number_of_meals: newNumberOfMeals.toString()

    });

  };



  // Move meal up or down in the list

  const moveMealInPlan = (index, direction) => {

    const updatedStructure = [...formData.meal_plan_structure];

    const newIndex = direction === 'up' ? index - 1 : index + 1;

    

    if (newIndex < 0 || newIndex >= updatedStructure.length) return;

    

    [updatedStructure[index], updatedStructure[newIndex]] = [updatedStructure[newIndex], updatedStructure[index]];

    

    setFormData({

      ...formData,

      meal_plan_structure: updatedStructure

    });

  };



  // Auto-calculate meal calories when total calories change

  useEffect(() => {

    if (formData.dailyTotalCalories) {

      const updatedMealStructure = calculateMealCalories(formData.meal_plan_structure, formData.dailyTotalCalories);

      setFormData(prev => ({

        ...prev,

        meal_plan_structure: updatedMealStructure

      }));

    }

  }, [formData.dailyTotalCalories]);



  // Auto-resize textarea function

  const autoResizeTextarea = (element) => {

    if (element) {

      element.style.height = 'auto';

      element.style.height = Math.min(element.scrollHeight, 80) + 'px';

    }

  };



  // Update meal in meal plan structure

  const updateMealInPlan = (index, field, value) => {

    const updatedStructure = [...formData.meal_plan_structure];

    updatedStructure[index] = {

      ...updatedStructure[index],

      [field]: value

    };



    // If calories were changed, recalculate percentages for all meals

    if (field === 'calories') {

      const totalCalories = parseInt(formData.dailyTotalCalories) || 0;

      updatedStructure[index].calories = parseInt(value) || 0;

      const recalculatedStructure = recalculatePercentages(updatedStructure, totalCalories, index);

      setFormData({

        ...formData,

        meal_plan_structure: recalculatedStructure

      });

    } else {

      setFormData({

        ...formData,

        meal_plan_structure: updatedStructure

      });

    }



    // Auto-resize textarea if description was updated

    if (field === 'description') {

      setTimeout(() => {

        const textarea = document.querySelector(`textarea[data-meal-index="${index}"]`);

        if (textarea) {

          autoResizeTextarea(textarea);

        }

      }, 0);

    }

  };



  // Handle temporary calorie input (without immediate update)

  const handleTempCalorieInput = (mealIndex, value) => {

    const numericValue = parseInt(value) || 0;

    const dailyTotal = parseInt(formData.dailyTotalCalories) || 0;

    

    // Calculate current locked calories and other unlocked calories

    const lockedCalories = formData.meal_plan_structure

      .filter((meal, index) => meal.locked && index !== mealIndex)

      .reduce((sum, meal) => sum + (meal.calories || 0), 0);

    

    const otherUnlockedCalories = formData.meal_plan_structure

      .filter((meal, index) => !meal.locked && index !== mealIndex)

      .reduce((sum, meal) => sum + (meal.calories || 0), 0);

    

    const maxAllowedCalories = dailyTotal - lockedCalories;

    

    // Store temporary input

    setTempCalorieInputs(prev => ({

      ...prev,

      [mealIndex]: value

    }));

    

    // Validate input

    if (numericValue > maxAllowedCalories) {

      setCalorieInputErrors(prev => ({

        ...prev,

        [mealIndex]: `Cannot exceed ${maxAllowedCalories} calories (${dailyTotal} total - ${lockedCalories} locked)`

      }));

    } else {

      setCalorieInputErrors(prev => {

        const newErrors = { ...prev };

        delete newErrors[mealIndex];

        return newErrors;

      });

    }

  };



  // Confirm calorie input (on Enter or blur)

  const confirmCalorieInput = (mealIndex) => {

    const tempValue = tempCalorieInputs[mealIndex];

    if (tempValue === undefined) return; // No temporary value

    

    const numericValue = parseInt(tempValue) || 0;

    const dailyTotal = parseInt(formData.dailyTotalCalories) || 0;

    

    // Calculate current locked calories

    const lockedCalories = formData.meal_plan_structure

      .filter((meal, index) => meal.locked && index !== mealIndex)

      .reduce((sum, meal) => sum + (meal.calories || 0), 0);

    

    const maxAllowedCalories = dailyTotal - lockedCalories;

    

    // If exceeds limit, reset all unlocked meals

    if (numericValue > maxAllowedCalories) {

      const resetStructure = formData.meal_plan_structure.map((meal, index) => {

        if (meal.locked) {

          return meal; // Keep locked meals unchanged

        } else {

          return {

            ...meal,

            calories: 0,

            calories_pct: 0

          };

        }

      });

      

      setFormData({

        ...formData,

        meal_plan_structure: resetStructure

      });

      

      // Clear temporary inputs and errors

      setTempCalorieInputs({});

      setCalorieInputErrors({});

      

      alert(`Input exceeds daily limit! All unlocked meals have been reset to 0 calories.\nLimit: ${maxAllowedCalories} calories (${dailyTotal} total - ${lockedCalories} locked)`);

      return;

    }

    

    // Valid input - apply the change

    updateMealInPlan(mealIndex, 'calories', tempValue);

    

    // Clear temporary input and error for this meal

    setTempCalorieInputs(prev => {

      const newInputs = { ...prev };

      delete newInputs[mealIndex];

      return newInputs;

    });

    

    setCalorieInputErrors(prev => {

      const newErrors = { ...prev };

      delete newErrors[mealIndex];

      return newErrors;

    });

  };



  // Cancel temporary input (on Escape)

  const cancelCalorieInput = (mealIndex) => {

    setTempCalorieInputs(prev => {

      const newInputs = { ...prev };

      delete newInputs[mealIndex];

      return newInputs;

    });

    

    setCalorieInputErrors(prev => {

      const newErrors = { ...prev };

      delete newErrors[mealIndex];

      return newErrors;

    });

  };



  // Update default meal names when language changes, preserving edited custom names

  useEffect(() => {

    setFormData(prev => ({

      ...prev,

      meal_plan_structure: prev.meal_plan_structure.map(item => {

        if (!item.key) return item;

        const map = {

          breakfast: translations.breakfast || 'Breakfast',

          lunch: translations.lunch || 'Lunch',

          dinner: translations.dinner || 'Dinner',

          snacks: translations.snacks || translations.snack || 'Snack',

        };

        return { ...item, meal: map[item.key] || item.meal };

      })

    }));

  }, [translations, language]);



  // Update meal plan structure when number of meals changes

  useEffect(() => {

    const numberOfMeals = parseInt(formData.number_of_meals) || 4;

    const currentStructure = formData.meal_plan_structure;

    

    if (numberOfMeals !== currentStructure.length) {

      let newStructure = [];

      

      if (numberOfMeals > currentStructure.length) {

        // Add more meals

        newStructure = [...currentStructure];

        for (let i = currentStructure.length; i < numberOfMeals; i++) {

          newStructure.push({

            meal: `${translations.meal || 'Meal'} ${i + 1}`,

            calories_pct: Math.round((100 / numberOfMeals) * 10) / 10,

            description: '',

            calories: 0,

            locked: false

          });

        }

      } else {

        // Remove meals (keep the first ones)

        newStructure = currentStructure.slice(0, numberOfMeals);

      }

      

      // Recalculate percentages to ensure they add up to 100%

      const totalPercentage = newStructure.reduce((sum, meal) => sum + meal.calories_pct, 0);

      if (Math.abs(totalPercentage - 100) > 0.1) {

        newStructure = newStructure.map(meal => ({

          ...meal,

          calories_pct: Math.round((100 / numberOfMeals) * 10) / 10

        }));

      }

      

      // Recalculate calories based on new percentages

      const totalCalories = parseInt(formData.dailyTotalCalories) || 0;

      if (totalCalories > 0) {

        newStructure = newStructure.map(meal => ({

          ...meal,

          calories: Math.round((meal.calories_pct / 100) * totalCalories)

        }));

      }

      

      setFormData(prev => ({

        ...prev,

        meal_plan_structure: newStructure

      }));

    }

  }, [formData.number_of_meals, formData.dailyTotalCalories, translations]);



  // Toggle lock state for a specific macro

  const toggleMacroLock = (macroType) => {

    setLockedMacros(prev => ({

      ...prev,

      [macroType]: !prev[macroType]

    }));

  };



  return (

    <div className="space-y-6">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">

        <div>

          <h1 className="text-2xl font-bold text-gray-900">{translations.clientManagement}</h1>

          <p className="mt-1 text-sm text-gray-500">

            {translations.manageClientProfiles}

          </p>

        </div>

        <Button 

          onClick={handleAdd}

          className="bg-green-600 hover:bg-green-700"

        >

          <Plus className="h-4 w-4 mr-2" />

          {translations.addNewClient}

        </Button>

      </div>



      {error && (

        <Alert variant="destructive">

          <AlertDescription>{error}</AlertDescription>

        </Alert>

      )}



      <div className="flex items-center space-x-2">

        <Search className="w-5 h-5 text-gray-400" />

        <Input

          placeholder={translations.searchClients}

          value={searchTerm}

          onChange={(e) => {

            setSearchTerm(e.target.value);

            // Reset "Show All" when searching

            if (e.target.value && showAll) {

              setShowAll(false);

            }

          }}

          className="max-w-sm"

        />

        

        {/* Filter Button */}

        <Popover open={showFilters} onOpenChange={setShowFilters}>

          <PopoverTrigger asChild>

            <Button variant="outline" className="ml-2">

              <Filter className="h-4 w-4 mr-2" />

              {translations.filterBy}

            </Button>

          </PopoverTrigger>

          <PopoverContent className="w-80" align="start">

            <div className="space-y-4">

              <div className="flex items-center justify-between">

                <h4 className="font-medium">{translations.filterBy}</h4>

                <Button

                  variant="ghost"

                  size="sm"

                  onClick={clearFilters}

                  className="h-6 px-2 text-xs"

                >

                  <X className="h-3 w-3 mr-1" />

                  {translations.clearFilters}

                </Button>

              </div>

              

              <Separator />

              

              {/* Goal Filter */}

              <div className="space-y-2">

                <Label className="text-sm font-medium">{translations.filterByGoal}</Label>

                <Select

                  value={filters.goal}

                  onValueChange={(value) => setFilters({...filters, goal: value === 'all' ? '' : value})}

                >

                  <SelectTrigger>

                    <SelectValue placeholder={translations.allGoals} />

                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">{translations.allGoals}</SelectItem>

                    <SelectItem value="lose">{translations.loseWeight}</SelectItem>

                    <SelectItem value="maintain">{translations.maintainWeight}</SelectItem>

                    <SelectItem value="gain">{translations.gainWeight}</SelectItem>

                    <SelectItem value="muscle">{translations.buildMuscle}</SelectItem>

                    <SelectItem value="health">{translations.improveHealth}</SelectItem>

                  </SelectContent>

                </Select>

              </div>

              

              {/* Activity Filter */}

              <div className="space-y-2">

                <Label className="text-sm font-medium">{translations.filterByActivity}</Label>

                <Select

                  value={filters.activity}

                  onValueChange={(value) => setFilters({...filters, activity: value === 'all' ? '' : value})}

                >

                  <SelectTrigger>

                    <SelectValue placeholder={translations.allActivities} />

                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">{translations.allActivities}</SelectItem>

                    <SelectItem value="sedentary">{translations.sedentary}</SelectItem>

                    <SelectItem value="light">{translations.lightActivity}</SelectItem>

                    <SelectItem value="moderate">{translations.moderateActivity}</SelectItem>

                    <SelectItem value="very">{translations.veryActive}</SelectItem>

                    <SelectItem value="extra">{translations.extraActive}</SelectItem>

                    <SelectItem value="toning">{translations.toning}</SelectItem>

                  </SelectContent>

                </Select>

              </div>

              

              {/* Gender Filter */}

              <div className="space-y-2">

                <Label className="text-sm font-medium">{translations.filterByGender}</Label>

                <Select

                  value={filters.gender}

                  onValueChange={(value) => setFilters({...filters, gender: value === 'all' ? '' : value})}

                >

                  <SelectTrigger>

                    <SelectValue placeholder={translations.allGenders} />

                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">{translations.allGenders}</SelectItem>

                    <SelectItem value="male">{translations.male}</SelectItem>

                    <SelectItem value="female">{translations.female}</SelectItem>

                    <SelectItem value="other">{translations.other}</SelectItem>

                  </SelectContent>

                </Select>

              </div>

              

              {/* Age Range Filter */}

              <div className="space-y-2">

                <Label className="text-sm font-medium">{translations.filterByAge}</Label>

                <div className="grid grid-cols-2 gap-2">

                  <Input

                    placeholder="Min"

                    type="number"

                    value={filters.ageRange.min}

                    onChange={(e) => setFilters({

                      ...filters, 

                      ageRange: {...filters.ageRange, min: e.target.value}

                    })}

                  />

                  <Input

                    placeholder="Max"

                    type="number"

                    value={filters.ageRange.max}

                    onChange={(e) => setFilters({

                      ...filters, 

                      ageRange: {...filters.ageRange, max: e.target.value}

                    })}

                  />

                </div>

              </div>

            </div>

          </PopoverContent>

        </Popover>

      </div>



      {/* Filter Summary */}

      {(filters.goal !== 'all' || filters.activity !== 'all' || filters.gender !== 'all' || filters.ageRange.min || filters.ageRange.max) && (

        <div className="flex items-center gap-2 flex-wrap">

          <span className="text-sm text-gray-500">{translations.filterBy}:</span>

          {filters.goal && filters.goal !== 'all' && (

            <Badge variant="secondary" className="text-xs">

              {translations.goal}: {translations[filters.goal] || filters.goal}

              <X 

                className="h-3 w-3 ml-1 cursor-pointer" 

                onClick={() => setFilters({...filters, goal: 'all'})}

              />

            </Badge>

          )}

          {filters.activity && filters.activity !== 'all' && (

            <Badge variant="secondary" className="text-xs">

              {translations.activityLevel}: {translations[filters.activity] || filters.activity}

              <X 

                className="h-3 w-3 ml-1 cursor-pointer" 

                onClick={() => setFilters({...filters, activity: 'all'})}

              />

            </Badge>

          )}

          {filters.gender && filters.gender !== 'all' && (

            <Badge variant="secondary" className="text-xs">

              {translations.gender}: {translations[filters.gender] || filters.gender}

              <X 

                className="h-3 w-3 ml-1 cursor-pointer" 

                onClick={() => setFilters({...filters, gender: 'all'})}

              />

            </Badge>

          )}

          {(filters.ageRange.min || filters.ageRange.max) && (

            <Badge variant="secondary" className="text-xs">

              {translations.age}: {filters.ageRange.min || '0'} - {filters.ageRange.max || '∞'}

              <X 

                className="h-3 w-3 ml-1 cursor-pointer" 

                onClick={() => setFilters({...filters, ageRange: { min: '', max: '' }})}

              />

            </Badge>

          )}

        </div>

      )}



      <Card>

        <CardHeader>

          <div className="flex justify-between items-center">

            <div>

              <CardTitle>

                {translations.clients} ({displayedClients.length}{showAll || searchTerm ? '' : ` ${translations.of} ${processedClients.length}`})

              </CardTitle>

              <CardDescription>

                {translations.viewAndManageClients}

              </CardDescription>

            </div>

            {hasMoreClients && (

              <Button 

                variant="outline" 

                onClick={() => setShowAll(true)}

                className="text-green-600 border-green-600 hover:bg-green-50"

              >

                {translations.showAll} ({processedClients.length})

              </Button>

            )}

            {showAll && !searchTerm && processedClients.length > 5 && (

              <Button 

                variant="outline" 

                onClick={() => setShowAll(false)}

                className="text-gray-600 border-gray-600 hover:bg-gray-50"

              >

                {translations.showLess}

              </Button>

            )}

          </div>

        </CardHeader>

        <CardContent>

          {loading ? (

            <div className="flex items-center justify-center py-8">

              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />

            </div>

          ) : (

            <div className="rounded-md border">

              <Table>

                <TableHeader>

                  <TableRow>

                    <TableHead 

                      className="cursor-pointer hover:bg-gray-50"

                      onClick={() => handleSort('full_name')}

                    >

                      <div className="flex items-center gap-1">

                        {translations.name}

                        {getSortIcon('full_name')}

                      </div>

                    </TableHead>

                    <TableHead>{translations.contact}</TableHead>

                    <TableHead 

                      className="cursor-pointer hover:bg-gray-50"

                      onClick={() => handleSort('user_code')}

                    >

                      <div className="flex items-center gap-1">

                        {translations.clientCode}

                        {getSortIcon('user_code')}

                      </div>

                    </TableHead>

                    <TableHead 

                      className="cursor-pointer hover:bg-gray-50"

                      onClick={() => handleSort('age')}

                    >

                      <div className="flex items-center gap-1">

                        {translations.physical}

                        {getSortIcon('age')}

                      </div>

                    </TableHead>

                    <TableHead 

                      className="cursor-pointer hover:bg-gray-50"

                      onClick={() => handleSort('goal')}

                    >

                      <div className="flex items-center gap-1">

                        {translations.goals}

                        {getSortIcon('goal')}

                      </div>

                    </TableHead>

                    <TableHead 

                      className="cursor-pointer hover:bg-gray-50"

                      onClick={() => handleSort('dailyTotalCalories')}

                    >

                      <div className="flex items-center gap-1">

                        {translations.macros}

                        {getSortIcon('dailyTotalCalories')}

                      </div>

                    </TableHead>

                    <TableHead>{translations.region}</TableHead>

                    <TableHead>{translations.meals}</TableHead>

                    <TableHead 

                      className="cursor-pointer hover:bg-gray-50"

                      onClick={() => handleSort('created_at')}

                    >

                      <div className="flex items-center gap-1">

                        {translations.createdAt || 'Created'}

                        {getSortIcon('created_at')}

                      </div>

                    </TableHead>

                    <TableHead className="text-right">{translations.actions}</TableHead>

                  </TableRow>

                </TableHeader>

                <TableBody>

                  {displayedClients.length > 0 ? (

                    displayedClients.map((client) => {

                      // Handle different field name formats

                      const weight = client.weight_kg || client.weight || client.Weight;

                      let height = client.height_cm || client.height || client.Height;

                      

                      // Convert height to cm for display if it's in meters

                      let displayHeight = height;

                      if (height && parseFloat(height) > 0 && parseFloat(height) < 10) {

                        displayHeight = (parseFloat(height) * 100).toFixed(0);

                      }

                      

                      const bmi = calculateBMI(weight, height);

                      return (

                        <TableRow key={client.user_code || client.id}>

                          <TableCell className="font-medium">

                            <div>

                              <div>{client.full_name}</div>

                              {client.age && (

                                <div className="text-sm text-gray-500">

                                  {client.age} {translations.yearsOld}

                                </div>

                              )}

                            </div>

                          </TableCell>

                          <TableCell>

                            <div className="space-y-1">

                              {client.email && (

                                <div className="flex items-center gap-1 text-sm">

                                  <Mail className="h-3 w-3" />

                                  {client.email}

                                </div>

                              )}

                              {client.phone_number && (

                                <div className="flex items-center gap-1 text-sm">

                                  <Phone className="h-3 w-3" />

                                  {client.phone_number}

                                </div>

                              )}

                              {client.city && (

                                <div className="text-sm text-gray-500">{client.city}</div>

                              )}

                            </div>

                          </TableCell>

                          <TableCell>

                            <Badge variant="outline" className="font-mono">

                              {client.user_code || '—'}

                            </Badge>

                          </TableCell>

                          <TableCell>

                            <div className="text-sm">

                              {height && weight ? (

                                <div>

                                  <div>{displayHeight}cm, {weight}kg</div>

                                  {bmi ? (

                                    <div className="text-gray-500">

                                      BMI: {bmi} ({getBMIStatus(bmi)})

                                    </div>

                                  ) : (

                                    <div className="text-red-400 text-xs">

                                      {translations.invalidBmiData}

                                    </div>

                                  )}

                                </div>

                              ) : (

                                <span className="text-gray-400">{translations.noDataAvailable}</span>

                              )}

                            </div>

                          </TableCell>

                          <TableCell>

                            <div className="text-sm">

                              {client.goal && (

                                <Badge variant="secondary" className="mb-1">

                                  {client.goal}

                                </Badge>

                              )}

                              {client.Activity_level && (

                                <div className="text-gray-500">{client.Activity_level} {translations.activity}</div>

                              )}

                              {client.dailyTotalCalories && (

                                <div className="text-gray-500">{client.dailyTotalCalories} {translations.kcalPerDay}</div>

                              )}

                            </div>

                          </TableCell>

                          <TableCell>

                            {client.macros && (client.macros.protein || client.macros.carbs || client.macros.fat) ? (

                              <div className="text-sm space-y-1">

                                {client.macros.protein && (

                                  <div className="text-blue-600">

                                    P: {typeof client.macros.protein === 'string' && client.macros.protein.includes('g') ? 

                                         client.macros.protein : `${client.macros.protein}g`}

                                  </div>

                                )}

                                {client.macros.carbs && (

                                  <div className="text-orange-600">

                                    C: {typeof client.macros.carbs === 'string' && client.macros.carbs.includes('g') ? 

                                         client.macros.carbs : `${client.macros.carbs}g`}

                                  </div>

                                )}

                                {client.macros.fat && (

                                  <div className="text-purple-600">

                                    F: {typeof client.macros.fat === 'string' && client.macros.fat.includes('g') ? 

                                         client.macros.fat : `${client.macros.fat}g`}

                                  </div>

                                )}

                              </div>

                            ) : (

                              <span className="text-gray-400 text-sm">{translations.noMacrosSet}</span>

                            )}

                          </TableCell>

                          <TableCell>

                            <div className="text-sm text-gray-600">

                              {client.region || '—'}

                            </div>

                          </TableCell>

                          <TableCell>

                            <Badge variant="secondary" className="text-xs">

                              {client.number_of_meals || '—'} {translations.meals}

                            </Badge>

                          </TableCell>

                          <TableCell>

                            <div className="text-sm text-gray-600">

                              {client.created_at ? (

                                <div>

                                  <div>{new Date(client.created_at).toLocaleDateString()}</div>

                                  <div className="text-xs text-gray-400">

                                    {new Date(client.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}

                                  </div>

                                </div>

                              ) : (

                                <span className="text-gray-400">—</span>

                              )}

                            </div>

                          </TableCell>

                          <TableCell className="text-right">

                            <div className="flex flex-col items-end gap-2">

                              <Button

                                variant="outline"

                                size="sm"

                                onClick={() => handleEdit(client)}

                                className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200 hover:border-green-300 transition-colors duration-200"

                              >

                                <Edit className="h-4 w-4 mr-2" />

                                {translations.editClient || 'Edit Client'}

                              </Button>

                              {(client.user_code || client.id) && (

                                <Button

                                  variant="outline"

                                  size="sm"

                                  onClick={() => handleDelete(client)}

                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300 transition-colors duration-200"

                                  disabled={deleteLoading === (client.user_code || client.id)}

                                >

                                  {deleteLoading === (client.user_code || client.id) ? (

                                    <div className="animate-spin h-4 w-4 mr-2" />

                                  ) : (

                                    <Trash2 className="h-4 w-4 mr-2" />

                                  )}

                                  {translations.deleteClient || 'Delete Client'}

                                </Button>

                              )}

                            </div>

                          </TableCell>

                        </TableRow>

                      );

                    })

                  ) : (

                    <TableRow>

                      <TableCell colSpan={11} className="text-center py-6 text-gray-500">

                        {searchTerm ? translations.noClientsFound : translations.noClientsFoundGeneral}

                      </TableCell>

                    </TableRow>

                  )}

                </TableBody>

              </Table>

            </div>

          )}

        </CardContent>

      </Card>



      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>

        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">

          <DialogHeader>

            <DialogTitle className={language === 'he' ? 'text-right' : 'text-left'}>

              {currentClient ? translations.editUserInformation : translations.addNewClient}

            </DialogTitle>

            <DialogDescription className={language === 'he' ? 'text-right' : 'text-left'}>

              {currentClient ? translations.editUserDescription : translations.addUserDescription}

            </DialogDescription>

          </DialogHeader>

          <form onSubmit={handleSubmit}>

            <div className="grid gap-6 py-4">

              

              {/* Basic Information */}

              <div className="space-y-6">

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 shadow-sm">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-sm">

                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />

                      </svg>

                    </div>

                    <div>

                      <h3 className="text-xl font-bold text-gray-800">{translations.basicInformation}</h3>

                      <p className="text-gray-600 text-sm">{translations.basicInformationDescription || 'Let\'s start with the essential details about your client'}</p>

                    </div>

                  </div>

                </div>

                

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 bg-white rounded-lg border border-gray-100 shadow-sm">

                  <div className="space-y-2">

                    <Label htmlFor="user_code" className="text-sm font-medium text-gray-700">

                      {translations.clientCode}

                    </Label>

                    <div className="flex gap-2">

                      <Input

                        id="user_code"

                        value={formData.user_code}

                        onChange={(e) => {

                          const newUserCode = e.target.value;

                          setFormData({...formData, user_code: newUserCode});

                          

                          // Clear previous timeout

                          if (userCodeTimeout) {

                            clearTimeout(userCodeTimeout);

                          }

                          

                          // Set new timeout for debounced food logs check

                          if (newUserCode && newUserCode.trim() !== '') {

                            const timeout = setTimeout(() => {

                              checkForFoodLogs(newUserCode);

                            }, 1000); // 1 second delay

                            setUserCodeTimeout(timeout);

                          } else {

                            setFoodLogsAnalysis(null);

                          }

                        }}

                        placeholder={translations.autoGenerated || 'Auto-generated'}

                        required

                        readOnly

                        className="bg-gray-50 cursor-not-allowed text-gray-600"

                      />

                      <Button

                        type="button"

                        variant="outline"

                        onClick={() => checkForFoodLogs(formData.user_code)}

                        disabled={analyzingFoodLogs || !formData.user_code}

                        className="whitespace-nowrap border-blue-200 text-blue-700 hover:bg-blue-50"

                      >

                        {analyzingFoodLogs ? (

                          <div className="animate-spin h-4 w-4" />

                        ) : (

                          <Search className="h-4 w-4" />

                        )}

                      </Button>

                    </div>

                    <p className="text-xs text-gray-500">{translations.clientCodeDescription || 'Unique identifier for your client'}</p>

                    {foodLogsAnalysis && (

                      <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">

                        <p className="text-sm text-green-800 font-medium">

                          ✨ {translations.foodLogsFound || 'Food logs found'}: {foodLogsAnalysis.total_logs} {translations.entriesFound || 'entries'}

                        </p>

                        <p className="text-xs text-green-600 mt-1">

                          {translations.preferencesAutoPopulated || 'Preferences auto-populated based on frequently consumed foods'}

                        </p>

                      </div>

                    )}

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="full_name" className="text-sm font-medium text-gray-700">

                      {translations.fullName}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        📝 {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Input

                      id="full_name"

                      value={formData.full_name}

                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}

                      onBlur={() => handleFieldBlur('full_name')}

                      required

                      placeholder={translations.enterClientFullName || 'Enter client\'s full name'}

                      className={`${shouldShowError('full_name') ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`}

                    />

                    {shouldShowError('full_name') && (

                      <p className="text-xs text-red-600">{translations.pleaseEnterFullName || 'Please enter the client\'s full name'}</p>

                    )}

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">

                      {translations.email}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        📧 {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Input

                      id="email"

                      type="email"

                      value={formData.email}

                      onChange={(e) => setFormData({...formData, email: e.target.value})}

                      onBlur={() => handleFieldBlur('email')}

                      required

                      placeholder={translations.emailPlaceholder || 'client@example.com'}

                      className={`${shouldShowError('email') ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`}

                    />

                    {shouldShowError('email') && (

                      <p className="text-xs text-red-600">{translations.pleaseEnterValidEmail || 'Please enter a valid email address'}</p>

                    )}

                    <p className="text-xs text-gray-500">{translations.emailDescription || 'We\'ll use this for important communications'}</p>

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="phone_number" className="text-sm font-medium text-gray-700">

                      {translations.phoneNumber}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        📱 {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Input

                      id="phone_number"

                      value={formData.phone_number}

                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}

                      onBlur={() => handleFieldBlur('phone_number')}

                      required

                      placeholder={translations.phonePlaceholder || '+1 (555) 123-4567'}

                      className={`${shouldShowError('phone_number') ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`}

                    />

                    {shouldShowError('phone_number') && (

                      <p className="text-xs text-red-600">{translations.pleaseEnterPhone || 'Please enter a phone number'}</p>

                    )}

                    <p className="text-xs text-gray-500">{translations.phoneDescription || 'For urgent communications and reminders'}</p>

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="city" className="text-sm font-medium text-gray-700">

                      {translations.city}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full`}>

                        🌍 {translations.optional || 'Optional'}

                      </span>

                    </Label>

                    <Input

                      id="city"

                      value={formData.city}

                      onChange={(e) => setFormData({...formData, city: e.target.value})}

                      placeholder={translations.cityPlaceholder || 'City name'}

                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-200"

                    />

                    <p className="text-xs text-gray-500">{translations.cityDescription || 'Optional: Helps with local recommendations'}</p>

                  </div>

                  
                  <div className="space-y-2">
                    <Label htmlFor="region" className="text-sm font-medium text-gray-700">
                      {translations.region}
                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full`}>
                        🌍 {translations.optional || 'Optional'}
                      </span>
                    </Label>
                    <Input
                      id="region"
                      value={formData.region}
                      onChange={(e) => setFormData({...formData, region: e.target.value})}
                      placeholder={translations.regionPlaceholder || 'israel'}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-200"
                    />
                    <p className="text-xs text-gray-500">{translations.regionDescription || 'Region for local food recommendations'}</p>
                  </div>
                  

                  <div className="space-y-2">

                    <Label htmlFor="date_of_birth" className="text-sm font-medium text-gray-700">

                      {translations.dateOfBirth}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        🎂 {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Input

                      id="date_of_birth"

                      type="date"

                      value={formData.date_of_birth}

                      onChange={(e) => {

                        const birthDate = e.target.value;

                        const calculatedAge = calculateAgeFromBirthDate(birthDate);

                        setFormData({

                          ...formData, 

                          date_of_birth: birthDate,

                          age: calculatedAge

                        });

                      }}

                      onBlur={() => handleFieldBlur('date_of_birth')}

                      required

                      className={`${shouldShowError('date_of_birth') ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`}

                    />

                    {shouldShowError('date_of_birth') && (

                      <p className="text-xs text-red-600">{translations.pleaseSelectDateOfBirth || 'Please select the date of birth'}</p>

                    )}

                    <p className="text-xs text-gray-500">{translations.dateOfBirthDescription || 'We\'ll automatically calculate the age for you'}</p>

                  </div>

                </div>

              </div>



              {/* Physical Information */}

              <div className="space-y-6">

                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 shadow-sm">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center shadow-sm">

                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />

                      </svg>

                    </div>

                    <div>

                      <h3 className="text-xl font-bold text-gray-800">{translations.physicalInformation}</h3>

                      <p className="text-gray-600 text-sm">{translations.physicalInformationDescription || 'Physical details help us create personalized nutrition plans'}</p>

                    </div>

                  </div>

                </div>

                

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-white rounded-lg border border-gray-100 shadow-sm">

                  <div className="space-y-2">

                    <Label htmlFor="age" className="text-sm font-medium text-gray-700">

                      {translations.age}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full`}>

                        🔒 {translations.autoCalculated || 'Auto-calculated'}

                      </span>

                    </Label>

                    <div className="relative">

                      <Input

                        id="age"

                        type="number"

                        value={formData.age}

                        className={`${shouldShowError('age') ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50'} cursor-not-allowed pr-10 text-gray-600`}

                        readOnly

                        required

                        placeholder={formData.date_of_birth ? translations.ageCalculatedFromBirthDate : translations.enterDateOfBirthToCalculateAge}

                      />

                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">

                        <span className="text-blue-500 text-sm">🔒</span>

                      </div>

                    </div>

                    {formData.date_of_birth ? (

                      <p className="text-xs text-green-600 font-medium">

                        ✓ {translations.ageCalculatedAutomatically || 'Age calculated automatically'}: {formData.age} {translations.yearsOld || 'years old'}

                      </p>

                    ) : (

                      <p className="text-xs text-amber-600">

                        ⚠️ {translations.pleaseEnterDateOfBirthToCalculateAge || 'Please enter date of birth above to calculate age'}

                      </p>

                    )}

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="gender" className="text-sm font-medium text-gray-700">

                      {translations.gender}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        👤 {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Select 

                      value={formData.gender} 

                      onValueChange={(value) => setFormData({...formData, gender: value})}

                    >

                      <SelectTrigger className={`${shouldShowError('gender') ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:border-blue-500 focus:ring-blue-200`}>

                        <SelectValue placeholder={translations.selectGender || 'Select gender'} />

                      </SelectTrigger>

                      <SelectContent>

                        <SelectItem value="male">{translations.male}</SelectItem>

                        <SelectItem value="female">{translations.female}</SelectItem>

                        <SelectItem value="other">{translations.other}</SelectItem>

                      </SelectContent>

                    </Select>

                    {shouldShowError('gender') && (

                      <p className="text-xs text-red-600">{translations.pleaseSelectGender || 'Please select a gender'}</p>

                    )}

                    <p className="text-xs text-gray-500">{translations.genderDescription || 'Helps with accurate calorie calculations'}</p>

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="weight_kg" className="text-sm font-medium text-gray-700">

                      {translations.weightKg}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        ⚖️ {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Input

                      id="weight_kg"

                      type="number"

                      step="0.1"

                      value={formData.weight_kg}

                      onChange={(e) => setFormData({...formData, weight_kg: e.target.value})}

                      onBlur={() => handleFieldBlur('weight_kg')}

                      required

                      placeholder={translations.weightPlaceholder || '70.5'}

                      className={`${shouldShowError('weight_kg') ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`}

                    />

                    {shouldShowError('weight_kg') && (

                      <p className="text-xs text-red-600">{translations.pleaseEnterWeight || 'Please enter the current weight'}</p>

                    )}

                    <p className="text-xs text-gray-500">{translations.weightDescription || 'Current weight in kilograms'}</p>

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="height_cm" className="text-sm font-medium text-gray-700">

                      {translations.heightCm}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        📏 {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Input

                      id="height_cm"

                      type="number"

                      value={formData.height_cm}

                      onChange={(e) => setFormData({...formData, height_cm: e.target.value})}

                      onBlur={() => handleFieldBlur('height_cm')}

                      required

                      placeholder={translations.heightPlaceholder || '175'}

                      className={`${shouldShowError('height_cm') ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`}

                    />

                    {shouldShowError('height_cm') && (

                      <p className="text-xs text-red-600">{translations.pleaseEnterHeight || 'Please enter the height'}</p>

                    )}

                    <p className="text-xs text-gray-500">{translations.heightDescription || 'Height in centimeters'}</p>

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="Activity_level" className="text-sm font-medium text-gray-700">

                      {translations.activityLevel}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        🏃 {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Select 

                      value={formData.Activity_level} 

                      onValueChange={(value) => setFormData({...formData, Activity_level: value})}

                    >

                      <SelectTrigger className={`${shouldShowError('Activity_level') ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:border-blue-500 focus:ring-blue-200`}>

                        <SelectValue placeholder={translations.selectActivityLevel || 'Select activity level'} />

                      </SelectTrigger>

                      <SelectContent>

                        <SelectItem value="sedentary">{translations.sedentary}</SelectItem>

                        <SelectItem value="light">{translations.lightActivity}</SelectItem>

                        <SelectItem value="moderate">{translations.moderateActivity}</SelectItem>

                        <SelectItem value="very">{translations.veryActive} </SelectItem>

                        <SelectItem value="extra">{translations.extraActive}</SelectItem>

                      </SelectContent>

                    </Select>

                    {shouldShowError('Activity_level') && (

                      <p className="text-xs text-red-600">{translations.pleaseSelectActivityLevel || 'Please select an activity level'}</p>

                    )}

                    <p className="text-xs text-gray-500">{translations.activityLevelDescription || 'How active is your client on a daily basis?'}</p>

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="goal" className="text-sm font-medium text-gray-700">

                      {translations.goal}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full`}>

                        🎯 {translations.required || 'Required'}

                      </span>

                    </Label>

                    <Select 

                      value={formData.goal} 

                      onValueChange={(value) => setFormData({...formData, goal: value})}

                    >

                      <SelectTrigger className={`${shouldShowError('goal') ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:border-blue-500 focus:ring-blue-200`}>

                        <SelectValue placeholder={translations.selectGoal || 'Select health goal'} />

                      </SelectTrigger>

                      <SelectContent>

                        <SelectItem value="lose">{translations.loseWeight}</SelectItem>

                        <SelectItem value="maintain">{translations.maintainWeight}</SelectItem>

                        <SelectItem value="gain">{translations.gainWeight}</SelectItem>

                        <SelectItem value="muscle">{translations.buildMuscle}</SelectItem>

                        <SelectItem value="health">{translations.improveHealth}</SelectItem>

                      </SelectContent>

                    </Select>

                    {shouldShowError('goal') && (

                      <p className="text-xs text-red-600">{translations.pleaseSelectGoal || 'Please select a health goal'}</p>

                    )}

                    <p className="text-xs text-gray-500">{translations.goalDescription || 'What does your client want to achieve?'}</p>

                  </div>

                </div>

              </div>



              {/* Nutrition Information */}

              <div className="space-y-6">

                <div className="bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200 rounded-lg p-4 shadow-sm">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center shadow-sm">

                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />

                      </svg>

                    </div>

                    <div>

                      <h3 className="text-xl font-bold text-gray-800">{translations.nutritionInformation}</h3>

                      <p className="text-gray-600 text-sm">{translations.nutritionInformationDescription || 'Nutritional targets and meal planning preferences'}</p>

                    </div>

                  </div>

                </div>

                

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-white rounded-lg border border-gray-100 shadow-sm">

                  <div className="space-y-2">

                    <Label htmlFor="dailyTotalCalories" className="text-sm font-medium text-gray-700">

                      {translations.dailyTotalCalories}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full`}>

                        🧮 {translations.autoCalculated || 'Auto-calculated'}

                      </span>

                    </Label>

                    <div className="relative">

                      <Input

                        id="dailyTotalCalories"

                        type="number"

                        value={formData.dailyTotalCalories}

                        onChange={(e) => setFormData({...formData, dailyTotalCalories: e.target.value})}

                        className={`${hasRequiredFieldsForCalculation() ? 'border-green-300 bg-green-50 focus:border-green-500 focus:ring-green-200' : 'border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-amber-200'}`}

                        placeholder={hasRequiredFieldsForCalculation() ? translations.autoCalculated : translations.fillRequiredFieldsToCalculate}

                      />

                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">

                        {hasRequiredFieldsForCalculation() ? (

                          <span className="text-green-500 text-sm">✓</span>

                        ) : (

                          <span className="text-amber-500 text-sm">⚠️</span>

                        )}

                      </div>

                    </div>

                    <p className="text-xs text-gray-500">

                      {hasRequiredFieldsForCalculation() 

                        ? translations.harrisBenedictInfo || 'Calculated using Harris-Benedict equation'

                        : translations.fillRequiredFieldsToCalculate || 'Fill in age, gender, weight, height, and activity level to calculate'

                      }

                    </p>

                  </div>

                  

                  <div className="space-y-2">

                    <Label htmlFor="number_of_meals" className="text-sm font-medium text-gray-700">

                      {translations.numberOfMeals}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full`}>

                        🍽️ {translations.optional || 'Optional'}

                      </span>

                    </Label>

                    <Input

                      id="number_of_meals"

                      type="number"

                      min="1"

                      max="10"

                      value={formData.number_of_meals}

                      onChange={(e) => setFormData({...formData, number_of_meals: e.target.value})}

                      placeholder={translations.mealsPlaceholder || '4'}

                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-200"

                    />

                    <p className="text-xs text-gray-500">{translations.mealsDescription || 'How many meals per day does your client prefer?'}</p>

                  </div>

                  

                </div>

                

                <div className="space-y-4">

                  <div className="flex items-center justify-between">

                    <div>

                      <Label className="text-base font-medium text-gray-800">{translations.macrosGrams}</Label>

                      <p className="text-sm text-gray-600 mt-1">{translations.macrosDescription || 'Set your client\'s macronutrient targets'}</p>

                    </div>

                    <div className="flex gap-2">

                      <Button

                        type="button"

                        variant="outline"

                        size="sm"

                        onClick={() => {

                          setLockedMacros({

                            protein: true,

                            carbs: true,

                            fat: true

                          });

                        }}

                        className="text-orange-600 border-orange-300 hover:bg-orange-50 text-xs"

                        title={translations.lockAllMacrosTooltip || 'Lock all macros - none will be automatically rebalanced'}

                      >

                        🔒 {translations.lockAll || 'Lock All'}

                      </Button>

                      <Button

                        type="button"

                        variant="outline"

                        size="sm"

                        onClick={() => {

                          setLockedMacros({

                            protein: false,

                            carbs: false,

                            fat: false

                          });

                        }}

                        className="text-green-600 border-green-300 hover:bg-green-50 text-xs"

                        title={translations.unlockAllMacrosTooltip || 'Unlock all macros - all will be automatically rebalanced'}

                      >

                        🔓 {translations.unlockAll || 'Unlock All'}

                      </Button>

                      <Button

                        type="button"

                        variant="outline"

                        size="sm"

                        onClick={() => {

                          const calories = parseInt(formData.dailyTotalCalories) || 0;

                          if (calories > 0) {

                            const weight = parseFloat(formData.weight_kg) || 0;

                            const defaultMacros = {

                              protein: { 

                                percentage: 30, 

                                grams: Math.round((0.30 * calories) / 4), 

                                gramsPerKg: weight > 0 ? Math.round((Math.round((0.30 * calories) / 4) / weight) * 1000) / 1000 : 0

                              },

                              carbs: { 

                                percentage: 40, 

                                grams: Math.round((0.40 * calories) / 4), 

                                gramsPerKg: weight > 0 ? Math.round((Math.round((0.40 * calories) / 4) / weight) * 1000) / 1000 : 0

                              },

                              fat: { 

                                percentage: 30, 

                                grams: Math.round((0.30 * calories) / 9), 

                                gramsPerKg: weight > 0 ? Math.round((Math.round((0.30 * calories) / 9) / weight) * 1000) / 1000 : 0

                              }

                            };

                            setMacroInputs(defaultMacros);

                            setMacroSliders({

                              protein: defaultMacros.protein.grams,

                              carbs: defaultMacros.carbs.grams,

                              fat: defaultMacros.fat.grams

                            });

                            

                            // Update previous distribution for smart rebalancing

                            setPreviousMacroDistribution({

                              protein: defaultMacros.protein.percentage,

                              carbs: defaultMacros.carbs.percentage,

                              fat: defaultMacros.fat.percentage

                            });

                          }

                        }}

                        className="text-blue-600 border-blue-300 hover:bg-blue-50 text-xs"

                        disabled={!formData.dailyTotalCalories}

                      >

                        🔄 {translations.resetToDefault || 'Reset to Default (30/40/30)'}

                      </Button>

                    </div>

                  </div>

                  

                  {/* Macro Input Rows */}

                  <div className="space-y-3">

                    {(() => {

                      // Dynamic macro configuration based on daily calories

                      const dailyCalories = parseInt(formData.dailyTotalCalories) || 0;

                      

                      // Calculate maximum possible grams for each macro based on calories

                      // Using extreme ratios: 100% protein (4 cal/g), 100% carbs (4 cal/g), 100% fat (9 cal/g)

                      const maxProteinGrams = dailyCalories > 0 ? Math.ceil(dailyCalories / 4) : 300;

                      const maxCarbsGrams = dailyCalories > 0 ? Math.ceil(dailyCalories / 4) : 400;

                      const maxFatGrams = dailyCalories > 0 ? Math.ceil(dailyCalories / 9) : 150;

                      

                      // Set reasonable upper limits to prevent unrealistic values

                      const maxProtein = Math.min(maxProteinGrams, 500);

                      const maxCarbs = Math.min(maxCarbsGrams, 800);

                      const maxFat = Math.min(maxFatGrams, 200);

                      

                      const macroConfig = [

                        { key: 'protein', label: translations.protein, color: 'blue', maxGrams: maxProtein, icon: '💪' },

                        { key: 'carbs', label: translations.carbs, color: 'purple', maxGrams: maxCarbs, icon: '🍞' },

                        { key: 'fat', label: translations.fat, color: 'teal', maxGrams: maxFat, icon: '🥑' }

                      ];

                      

                      return macroConfig.map(macro => (

                      <div key={macro.key} className="border border-gray-200 rounded-lg p-4 bg-gradient-to-r from-gray-50 to-white hover:shadow-sm transition-shadow">

                        <div className="flex items-center justify-between mb-3">

                          <div className="flex items-center gap-2">

                            <span className="text-lg">{macro.icon}</span>

                            <Label className="text-sm font-medium text-gray-700 capitalize">{macro.label}</Label>

                          </div>

                          <div className="flex items-center gap-2">

                            <div className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">

                              {macroInputs[macro.key].grams}g

                            </div>

                            <Button

                              type="button"

                              variant="ghost"

                              size="sm"

                              onClick={() => toggleMacroLock(macro.key)}

                              className={`p-1 h-6 w-6 transition-colors ${

                                lockedMacros[macro.key] 

                                  ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-100' 

                                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'

                              }`}

                              title={lockedMacros[macro.key] ? 'Unlock macro (will be rebalanced)' : 'Lock macro (won\'t be rebalanced)'}

                            >

                              {lockedMacros[macro.key] ? '🔒' : '🔓'}

                            </Button>

                          </div>

                        </div>

                        

                        <div className="grid grid-cols-4 gap-3 items-center">

                          {/* Percentage Input */}

                          <div className="space-y-1">

                            <Label className="text-xs text-gray-600 flex items-center gap-1">

                              % {lockedMacros[macro.key] && <span className="text-blue-600">🔒</span>}

                            </Label>

                            <Input

                              type="number"

                              value={macroInputs[macro.key].percentage}

                              onChange={(e) => calculateMacrosFromInputs('percentage', parseFloat(e.target.value) || 0, macro.key)}

                              className={`text-xs h-8 ${

                                macroInputs[macro.key].percentage < 0 || macroInputs[macro.key].percentage > 100

                                  ? 'border-red-300 bg-red-50' 

                                  : lockedMacros[macro.key]

                                  ? 'border-blue-300 bg-blue-50 cursor-not-allowed'

                                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'

                              }`}

                              min="0"

                              max="100"

                              step="0.001"

                              placeholder="0"

                              disabled={lockedMacros[macro.key]}

                            />

                            {macroInputs[macro.key].percentage < 0 && (

                              <div className="text-xs text-red-500">Min: 0%</div>

                            )}

                            {macroInputs[macro.key].percentage > 100 && (

                              <div className="text-xs text-red-500">Max: 100%</div>

                            )}

                          </div>

                          

                          {/* Grams Input */}

                          <div className="space-y-1">

                            <Label className="text-xs text-gray-600">{translations.grams}</Label>

                            <Input

                              type="number"

                              value={macroInputs[macro.key].grams}

                              onChange={(e) => calculateMacrosFromInputs('grams', parseFloat(e.target.value) || 0, macro.key)}

                              className="text-xs h-8 border-gray-300 focus:border-blue-500 focus:ring-blue-200"

                              min="0"

                              max={macro.maxGrams}

                            />

                          </div>

                          

                          {/* Grams per Kg Input */}

                          <div className="space-y-1">

                            <Label className="text-xs text-gray-600">g/kg</Label>

                            <Input

                              type="number"

                              value={macroInputs[macro.key].gramsPerKg}

                              onChange={(e) => calculateMacrosFromInputs('gramsPerKg', parseFloat(e.target.value) || 0, macro.key)}

                              className="text-xs h-8 border-gray-300 focus:border-blue-500 focus:ring-blue-200"

                              min="0"

                              step="0.001"

                            />

                          </div>

                          

                          {/* Slider */}

                          <div className="flex-1 space-y-1">

                            <Slider

                              min={0}

                              max={macro.maxGrams}

                              step={1}

                              value={[macroInputs[macro.key].grams]}

                              onValueChange={([val]) => calculateMacrosFromInputs('grams', val, macro.key)}

                              className={`[&>span]:bg-${macro.color}-500`}

                            />

                            <div className="text-xs text-gray-500 text-center">

                              0 - {macro.maxGrams}g

                            </div>

                          </div>

                        </div>

                      </div>

                    ));

                    })()}

                  </div>

                  

                  {/* Macro Summary */}

                  <div className={`border-2 rounded-xl p-6 ${

                    validateMacroPercentages().isCaloriesNotSet

                      ? 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200'

                      : validateMacroPercentages().isValid 

                        ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' 

                        : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-200'

                  }`}>

                    <div className="flex items-center gap-3 mb-4">

                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${

                        validateMacroPercentages().isCaloriesNotSet

                          ? 'bg-gray-500 text-white' 

                          : validateMacroPercentages().isValid 

                            ? 'bg-green-500 text-white' 

                            : 'bg-red-500 text-white'

                      }`}>

                        {validateMacroPercentages().isCaloriesNotSet ? '⏳' : validateMacroPercentages().isValid ? '✓' : '⚠️'}

                      </div>

                      <div>

                        <h4 className={`font-semibold ${

                          validateMacroPercentages().isCaloriesNotSet

                            ? 'text-gray-800' 

                            : validateMacroPercentages().isValid ? 'text-green-800' : 'text-red-800'

                        }`}>

                          {validateMacroPercentages().isCaloriesNotSet 

                            ? translations.caloriesNotSet || 'Daily calories not set yet' 

                            : validateMacroPercentages().isValid 

                              ? translations.macrosPerfectlyBalanced || 'Macros are perfectly balanced!' 

                              : translations.macroBalanceNeedsAttention || 'Macro balance needs attention'

                          }

                        </h4>

                        <p className={`text-sm ${

                          validateMacroPercentages().isCaloriesNotSet

                            ? 'text-gray-600' 

                            : validateMacroPercentages().isValid ? 'text-green-600' : 'text-red-600'

                        }`}>

                          {validateMacroPercentages().isCaloriesNotSet 

                            ? translations.setCaloriesFirst || 'Set daily calories first to configure macro percentages' 

                            : validateMacroPercentages().isValid 

                              ? translations.macrosReadyToGo || 'Your client\'s nutrition targets are ready to go!' 

                              : validateMacroPercentages().warning

                          }

                        </p>

                      </div>

                    </div>

                    

                    <div className="grid grid-cols-2 gap-4 mb-4">

                      <div className="bg-white/60 rounded-lg p-3 border border-white/40">

                        <div className="text-sm text-gray-600">{translations.totalPercentages || 'Total Percentages'}</div>

                        <div className={`text-lg font-bold ${

                          validateMacroPercentages().isCaloriesNotSet

                            ? 'text-gray-700' 

                            : validateMacroPercentages().isValid ? 'text-green-700' : 'text-red-700'

                        }`}>

                          {validateMacroPercentages().total.toFixed(1)}%

                        </div>

                      </div>

                      <div className="bg-white/60 rounded-lg p-3 border border-white/40">

                        <div className="text-sm text-gray-600">{translations.totalCalories || 'Total Calories'}</div>

                        <div className="text-lg font-bold text-gray-800">

                          {calculateTotals().totalCalories} kcal

                        </div>

                      </div>

                    </div>

                    

                    {/* Lock Status */}

                    <div className="bg-white/60 rounded-lg p-4 border border-white/40 mb-4">

                      <div className="flex items-center gap-2 mb-3">

                        <span className="text-blue-600">🔒</span>

                        <span className="font-medium text-gray-800">{translations.macroLockStatus || 'Macro Lock Status'}</span>

                      </div>

                      <div className="flex flex-wrap gap-2">

                        {Object.entries(lockedMacros).map(([macro, isLocked]) => (

                          <span

                            key={macro}

                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${

                              isLocked 

                                ? 'bg-blue-100 text-blue-800 border border-blue-300' 

                                : 'bg-gray-100 text-gray-500 border border-gray-300'

                            }`}

                          >

                            {macro.charAt(0).toUpperCase() + macro.slice(1)}: {isLocked ? '🔒' : '🔓'}

                          </span>

                        ))}

                      </div>

                      <p className="text-xs text-gray-600 mt-2">

                        💡 {translations.lockedMacrosDescription || 'Locked macros won\'t be automatically rebalanced when you change other macros.'}

                      </p>

                    </div>

                    

                    {/* Lock Conflict Warning */}

                    {checkLockedMacrosConflict().hasConflict && (

                      <div className="bg-red-100 border border-red-300 rounded-lg p-4 mb-4">

                        <div className="flex items-center gap-2 mb-2">

                          <span className="text-red-600">⚠️</span>

                          <span className="font-medium text-red-800">{translations.lockConflictDetected || 'Lock Conflict Detected'}</span>

                        </div>

                        <p className="text-sm text-red-700 mb-2">

                          {checkLockedMacrosConflict().message}

                        </p>

                        <p className="text-xs text-red-600">

                          {translations.currentLockedTotal || 'Current locked total'}: {checkLockedMacrosConflict().lockedTotal.toFixed(1)}%

                        </p>

                      </div>

                    )}

                    

                    {/* Helpful Tips */}

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">

                      <div className="flex items-center gap-2 mb-2">

                        <span className="text-blue-600">💡</span>

                        <span className="font-medium text-blue-800">{translations.proTips || 'Pro Tips'}</span>

                      </div>

                      <ul className="text-sm text-blue-700 space-y-1">

                        <li>• {translations.proTip1 || 'Adjust one macro percentage and unlocked macros will automatically rebalance'}</li>

                        <li>• {translations.proTip2 || 'Use the lock buttons (🔒/🔓) to prevent specific macros from changing'}</li>

                        <li>• {translations.proTip3 || 'Aim for 100% total to ensure all calories are accounted for'}</li>

                      </ul>

                    </div>

                  </div>

                </div>

              </div>



              {/* Dietary Information */}

              <div className="space-y-6">

                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-4 shadow-sm">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm">

                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />

                    </svg>

                  </div>

                    <div>

                      <h3 className="text-xl font-bold text-gray-800">{translations.dietaryInformation}</h3>

                      <p className="text-gray-600 text-sm">Dietary restrictions, preferences, and personalized recommendations</p>

                    </div>

                  </div>

                </div>

                

                <div className="grid grid-cols-1 gap-6">

                  {/* Food Allergies Section */}

                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">

                    <Label htmlFor="food_allergies" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">

                      <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">

                        <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />

                        </svg>

                      </div>

                      {translations.foodAllergies}

                    </Label>

                    <Input

                      id="food_allergies"

                      value={formData.food_allergies}

                      onChange={(e) => setFormData({...formData, food_allergies: e.target.value})}

                      placeholder={translations.foodAllergiesPlaceholder}

                      className="border-gray-300 focus:border-red-500 focus:ring-red-500"

                    />

                  </div>



                  {/* Food Limitations Section */}

                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">

                    <Label htmlFor="food_limitations" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">

                      <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center">

                        <svg className="w-3 h-3 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />

                        </svg>

                      </div>

                      {translations.foodLimitations}

                    </Label>

                    <Textarea

                      id="food_limitations"

                      value={formData.food_limitations}

                      onChange={(e) => {
                        setFormData({...formData, food_limitations: e.target.value});
                        // Clear the onboarding flag when user manually edits
                        if (foodLimitationsFromOnboarding) {
                          setFoodLimitationsFromOnboarding(false);
                        }
                      }}

                      placeholder={translations.foodLimitationsPlaceholder}

                      rows={3}

                      className={`resize-none transition-all duration-200 ${
                        foodLimitationsFromOnboarding 
                          ? 'border-blue-500 bg-blue-50 text-blue-900 font-medium shadow-sm ring-1 ring-blue-300' 
                          : 'border-gray-300 focus:border-orange-500 focus:ring-orange-500'
                      }`}

                    />

                    {foodLimitationsFromOnboarding && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {translations.autoPopulatedFromOnboarding || 'Auto-populated from onboarding data'} - You can edit this as needed.
                      </div>
                    )}

                    {formData.food_limitations && !foodLimitationsFromOnboarding && (

                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">

                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />

                        </svg>

                        {formData.food_limitations.split(',').length} {translations.limitations || 'limitations'} specified

                      </div>

                    )}

                  </div>



                  {/* Food Diary Section */}

                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">

                    <Label htmlFor="food_diary" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">

                      <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center">

                        <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />

                        </svg>

                      </div>

                      {translations.foodDiary}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full`}>

                        📝 {translations.optional || 'Optional'}

                      </span>

                    </Label>

                    <div className="flex gap-2">

                      <Textarea

                        id="food_diary"

                        value={formData.food_diary}

                        onChange={(e) => setFormData({...formData, food_diary: e.target.value})}

                        placeholder={translations.foodDiaryPlaceholder || 'Log your daily food intake, meals, and eating patterns...'}

                        rows={4}

                        className="flex-1 border-gray-300 focus:border-blue-500 focus:ring-blue-500 resize-none"

                      />

                      <Button

                        type="button"

                        variant="outline"

                        onClick={() => {

                          console.log('Button clicked, analyzingFoodDiary:', analyzingFoodDiary);

                          analyzeFoodDiary();

                        }}

                        disabled={analyzingFoodDiary || !formData.user_code}

                        className="whitespace-nowrap border-blue-200 text-blue-700 hover:bg-blue-50 self-start min-w-[40px] h-[40px] flex items-center justify-center"

                      >

                        {console.log('Rendering button, analyzingFoodDiary:', analyzingFoodDiary)}

                        {analyzingFoodDiary ? (

                          <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />

                        ) : (

                          <Search className="h-4 w-4" />

                        )}

                      </Button>

                    </div>

                    <p className="text-xs text-gray-500 mt-1">{translations.foodDiaryDescription || 'Track daily food consumption and eating habits'}</p>

                  </div>



                  {/* Client Preferences Section */}

                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">

                    <Label htmlFor="client_preference" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">

                      <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">

                        <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />

                        </svg>

                      </div>

                      {translations.userPreferences} {translations.eatingHabitsAnalysis}

                      {foodLogsAnalysis && (

                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 ml-2">

                          {translations.autoPopulated || 'Auto-populated'} ({foodLogsAnalysis.total_logs} {translations.entriesFound || 'entries'})

                        </Badge>

                      )}

                    </Label>

                    <div className="flex gap-2">

                      {console.log('foodLogsAnalysis state:', foodLogsAnalysis)}

                      <Textarea

                        id="client_preference"

                        value={formData.client_preference}

                        onChange={(e) => {
                          setFormData({...formData, client_preference: e.target.value});
                          // Clear the onboarding flag when user manually edits
                          if (clientPreferencesFromOnboarding) {
                            setClientPreferencesFromOnboarding(false);
                          }
                        }}

                        placeholder={translations.clientPreferencesPlaceholder}

                        rows={3}

                        className={`flex-1 transition-all duration-200 resize-none ${
                          foodLogsAnalysis 
                            ? 'border-green-500 bg-green-50 text-green-900 font-medium shadow-sm ring-1 ring-green-300' 
                            : clientPreferencesFromOnboarding
                              ? 'border-blue-500 bg-blue-50 text-blue-900 font-medium shadow-sm ring-1 ring-blue-300'
                              : 'border-gray-300 focus:border-green-500 focus:ring-green-500'
                        }`}

                        style={{ 

                          borderColor: foodLogsAnalysis ? '#10b981' : clientPreferencesFromOnboarding ? '#3b82f6' : undefined,

                          backgroundColor: foodLogsAnalysis ? '#f0fdf4' : clientPreferencesFromOnboarding ? '#eff6ff' : undefined,

                          color: foodLogsAnalysis ? '#064e3b' : clientPreferencesFromOnboarding ? '#1e3a8a' : undefined

                        }}

                      />

                      {formData.client_preference && language === 'he' && (

                        <Button

                          type="button"

                          variant="outline"

                          onClick={async () => {

                            setTranslatingPreferences(true);

                            try {

                              const translatedText = await translateText(formData.client_preference, 'he');

                              setFormData(prev => ({

                                ...prev,

                                client_preference: translatedText

                              }));

                            } catch (error) {

                              console.error('Failed to translate preferences:', error);

                            } finally {

                              setTranslatingPreferences(false);

                            }

                          }}

                          disabled={translatingPreferences}

                          className="whitespace-nowrap h-fit border-green-300 text-green-700 hover:bg-green-50"

                        >

                          {translatingPreferences ? (

                            <div className="animate-spin h-4 w-4" />

                          ) : (

                            translations.translateToHebrew || 'Translate to Hebrew'

                          )}

                        </Button>

                      )}

                    </div>

                    {foodLogsAnalysis && (

                      <div className="mt-2 flex items-center gap-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">

                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />

                        </svg>

                        {translations.preferencesAutoPopulated || 'Eating habits analysis completed'} from {foodLogsAnalysis.total_logs} food log entries. You can edit this analysis as needed.

                      </div>

                    )}

                    {clientPreferencesFromOnboarding && !foodLogsAnalysis && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {translations.autoPopulatedFromOnboarding || 'Auto-populated from onboarding data'} - You can edit this as needed.
                      </div>
                    )}

                  </div>



                  {/* Recommendations Section */}

                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">

                    <Label htmlFor="recommendations" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">

                      <div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center">

                        <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />

                        </svg>

                      </div>

                      {translations.recommendations}

                      <span className={`${language === 'he' ? 'mr-2' : 'ml-2'} inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full`}>

                        💡 {translations.optional || 'Optional'}

                      </span>

                    </Label>

                    <Textarea

                      id="recommendations"

                      value={formData.recommendations}

                      onChange={(e) => setFormData({...formData, recommendations: e.target.value})}

                      placeholder={translations.recommendationsPlaceholder || 'Simple text: drink more water, take vitamin D, exercise 30min daily'}

                      className="border-gray-300 focus:border-purple-500 focus:ring-purple-500 min-h-[80px] resize-none"

                      rows={3}

                    />

                    <p className="text-xs text-gray-500 mt-1">{translations.recommendationsDescription || 'Add personalized recommendations for this client'}</p>

                  </div>



                </div>

              </div>



              {/* Meal Plan Structure */}

              <div className="space-y-6">

                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4 shadow-sm">

                  <div className="flex items-center gap-3">

                    <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-sm">

                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />

                      </svg>

                    </div>

                    <div>

                      <h3 className="text-xl font-bold text-gray-800">{translations.mealPlanStructure || 'Meal Plan Structure'}</h3>

                      <p className="text-gray-600 text-sm">Configure how daily calories are distributed across meals</p>

                    </div>

                  </div>

                </div>

                <div className="space-y-3">

                  <div className="flex items-center justify-between">

                    <p className="text-sm text-gray-600">

                      {translations.mealPlanDescription || 'Configure how daily calories are distributed across meals'}

                    </p>

                    <Button

                      type="button"

                      variant="outline"

                      size="sm"

                      onClick={addMealToPlan}

                      className="text-green-600 border-green-600 hover:bg-green-50"

                    >

                      <Plus className="h-4 w-4 mr-1" />

                      {translations.addMeal || 'Add Meal'}

                    </Button>

                  </div>



                  <div className="border rounded-lg overflow-hidden">

                    <div className="bg-gray-50 px-4 py-2 border-b">

                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">

                        <div className="col-span-2">{translations.mealName || 'Meal Name'}</div>

                        <div className="col-span-4">{translations.description || 'Description'}</div>

                        <div className="col-span-2">{translations.caloriesLabel || 'Calories'}</div>

                        <div className="col-span-2">{translations.percentage || 'Percentage'}</div>

                        <div className="col-span-1">{translations.lock || 'Lock'}</div>

                        <div className="col-span-1">{translations.actions || 'Actions'}</div>

                      </div>

                    </div>

                    

                    {formData.meal_plan_structure.map((meal, index) => (

                      <div key={index} className="px-4 py-3 border-b last:border-b-0 bg-white">

                        <div className="grid grid-cols-12 gap-2 items-center">

                          {/* Meal Name */}

                          <div className="col-span-2">

                            <Input

                              value={meal.meal}

                              onChange={(e) => updateMealInPlan(index, 'meal', e.target.value)}

                              className="text-sm"

                              placeholder={translations.mealName || 'Meal name'}

                            />

                          </div>

                          

                          {/* Description */}

                          <div className="col-span-4 relative">

                            <Textarea

                              value={meal.description}

                              onChange={(e) => updateMealInPlan(index, 'description', e.target.value)}

                              onInput={(e) => autoResizeTextarea(e.target)}

                              className="text-sm resize-none min-h-[32px] max-h-[80px] overflow-hidden"

                              placeholder={translations.mealDescriptionShort || translations.descriptionPlaceholder || 'What\'s in this meal...'}

                              rows={1}

                              title={meal.description || 'Enter meal description'}

                              data-meal-index={index}

                            />

                            {meal.description && meal.description.length > 50 && (

                              <div className="absolute top-0 right-0 mt-1 mr-1">

                                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">

                                  {meal.description.length} chars

                                </Badge>

                              </div>

                            )}

                          </div>

                          

                          {/* Calories */}

                          <div className="col-span-2">

                            <div className="relative">

                              <Input

                                type="number"

                                value={tempCalorieInputs[index] !== undefined ? tempCalorieInputs[index] : meal.calories}

                                onChange={(e) => handleTempCalorieInput(index, e.target.value)}

                                onKeyDown={(e) => {

                                  if (e.key === 'Enter') {

                                    e.preventDefault(); // Prevent form submission

                                    confirmCalorieInput(index);

                                  } else if (e.key === 'Escape') {

                                    e.preventDefault(); // Prevent any default behavior

                                    cancelCalorieInput(index);

                                  }

                                }}

                                onBlur={() => confirmCalorieInput(index)}

                                className={`text-sm ${meal.locked ? 'bg-gray-100 cursor-not-allowed' : ''} ${

                                  calorieInputErrors[index] ? 'border-red-500 bg-red-50' : 

                                  tempCalorieInputs[index] !== undefined ? 'border-yellow-500 bg-yellow-50' : ''

                                }`}

                                placeholder="0"

                                min="0"

                                disabled={meal.locked}

                                title={meal.locked ? `${translations.locked || 'Locked'} - ${translations.caloriesLabel || 'Calories'}` : 'Press Enter to confirm, Escape to cancel'}

                              />

                              {calorieInputErrors[index] && (

                                <div className="absolute z-10 mt-1 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700 shadow-lg max-w-xs">

                                  {calorieInputErrors[index]}

                                </div>

                              )}

                              {tempCalorieInputs[index] !== undefined && !calorieInputErrors[index] && (

                                <div className="absolute z-10 mt-1 p-1 bg-yellow-100 border border-yellow-300 rounded text-xs text-yellow-700 shadow">

                                  Press Enter to confirm

                                </div>

                              )}

                            </div>

                          </div>

                          

                          {/* Percentage */}

                          <div className="col-span-2">

                            <div className={`text-sm text-center ${meal.locked ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>

                              {meal.calories_pct.toFixed(1)}%

                              {meal.locked && <div className="text-xs text-blue-500">🔒</div>}

                            </div>

                          </div>

                          

                          {/* Lock Toggle */}

                          <div className="col-span-1 flex justify-center">

                            <Button

                              type="button"

                              variant="ghost"

                              size="icon"

                              onClick={() => updateMealInPlan(index, 'locked', !meal.locked)}

                              className={`h-8 w-8 ${meal.locked ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}

                              title={meal.locked ? 'Unlock meal' : 'Lock meal'}

                            >

                              {meal.locked ? '🔒' : '🔓'}

                            </Button>

                          </div>

                          

                          {/* Actions */}

                          <div className="col-span-1 flex items-center justify-center gap-1">

                            <Button

                              type="button"

                              variant="ghost"

                              size="icon"

                              onClick={() => moveMealInPlan(index, 'up')}

                              disabled={index === 0}

                              className="h-8 w-8"

                            >

                              <ArrowUp className="h-4 w-4" />

                            </Button>

                            <Button

                              type="button"

                              variant="ghost"

                              size="icon"

                              onClick={() => moveMealInPlan(index, 'down')}

                              disabled={index === formData.meal_plan_structure.length - 1}

                              className="h-8 w-8"

                            >

                              <ArrowDown className="h-4 w-4" />

                            </Button>

                            <Button

                              type="button"

                              variant="ghost"

                              size="icon"

                              onClick={() => removeMealFromPlan(index)}

                              disabled={formData.meal_plan_structure.length <= 1}

                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"

                            >

                              <X className="h-4 w-4" />

                            </Button>

                          </div>

                        </div>

                      </div>

                    ))}

                  </div>



                  {/* Summary */}

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">

                    <div className="grid grid-cols-2 gap-4 text-sm">

                      <div>

                        <span className="text-gray-600">{translations.totalMeals || 'Total Meals'}: </span>

                        <span className="font-medium">{formData.meal_plan_structure.length}</span>

                        <span className="text-xs text-gray-500 ml-2">

                          ({formData.meal_plan_structure.filter(meal => meal.locked).length} {translations.locked || 'locked'})

                        </span>

                      </div>

                      <div>

                        <span className="text-gray-600">{translations.totalCalories || 'Total Calories'}: </span>

                        <span className="font-medium">

                          {formData.meal_plan_structure.reduce((sum, meal) => sum + (meal.calories || 0), 0)} / {formData.dailyTotalCalories || 0}

                        </span>

                      </div>

                      <div>

                        <span className="text-gray-600">{translations.lockedCalories || 'Locked Calories'}: </span>

                        <span className="font-medium text-blue-600">

                          {formData.meal_plan_structure.filter(meal => meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0)}

                        </span>

                      </div>

                      <div>

                        <span className="text-gray-600">{translations.unlockedCalories || 'Unlocked Calories'}: </span>

                        <span className="font-medium text-green-600">

                          {formData.meal_plan_structure.filter(meal => !meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0)}

                        </span>

                      </div>

                      <div>

                        <span className="text-gray-600">{translations.availableBudget || 'Available Budget'}: </span>

                        <span className="font-medium text-purple-600">

                          {(parseInt(formData.dailyTotalCalories) || 0) - formData.meal_plan_structure.filter(meal => meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0)} kcal

                        </span>

                      </div>

                      <div>

                        <span className="text-gray-600">{translations.maxPerMeal || 'Max per Meal'}: </span>

                        <span className="font-medium text-orange-600">

                          {Math.max(0, (parseInt(formData.dailyTotalCalories) || 0) - formData.meal_plan_structure.filter(meal => meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0))} kcal

                        </span>

                      </div>

                      <div>

                        <span className="text-gray-600">{translations.totalPercentage || 'Total Percentage'}: </span>

                        <span className={`font-medium ${Math.abs(formData.meal_plan_structure.reduce((sum, meal) => sum + meal.calories_pct, 0) - 100) < 0.1 ? 'text-green-600' : 'text-red-600'}`}>

                          {formData.meal_plan_structure.reduce((sum, meal) => sum + meal.calories_pct, 0).toFixed(1)}%

                        </span>

                      </div>

                    </div>

                    <p className="text-xs text-gray-500 mt-2">

                      {translations.mealPlanLockNote || 'Note: 🔒 Locked meals maintain their calories. When you edit a meal, that meal keeps its exact value and other unlocked meals scale to fit the remaining budget.'}

                    </p>

                    <p className="text-xs text-blue-600 mt-1">

                      {translations.scalingFormula || 'Formula: Scaling Factor = (Daily Target - Locked Calories - Edited Meal) ÷ Other Unlocked Total'}

                    </p>

                    <p className="text-xs text-green-600 mt-1">

                      {translations.calorieInputHelp || '💡 Calorie Input: Type a value and press Enter to confirm. Values exceeding daily limits will reset all unlocked meals to 0.'}

                    </p>

                  </div>

                </div>

              </div>

            </div>



            <div className="flex justify-end gap-3">

              <Button 

                type="button" 

                variant="outline"

                onClick={() => {

                  setDialogOpen(false);

                  setFormSubmitted(false);

                  setTouchedFields({});

                  setFoodLogsAnalysis(null);

                  setAnalyzingFoodLogs(false);
                  
                  setFoodLimitationsFromOnboarding(false);
                  
                  setClientPreferencesFromOnboarding(false);

                  if (userCodeTimeout) {

                    clearTimeout(userCodeTimeout);

                    setUserCodeTimeout(null);

                  }

                }}

                disabled={loading}

              >

                {translations.cancel}

              </Button>

              <Button 

                type="submit"

                className="bg-green-600 hover:bg-green-700"

                disabled={loading}

              >

                {loading ? translations.saving : currentClient ? translations.updateClient : translations.addClient}

              </Button>

            </div>

          </form>

        </DialogContent>

      </Dialog>





    </div>

  );

}