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
  const [sortField, setSortField] = useState('full_name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filters, setFilters] = useState({
    goal: 'all',
    activity: 'all',
    gender: 'all',
    ageRange: { min: '', max: '' }
  });
  const [showFilters, setShowFilters] = useState(false);
  
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
    recommendations: '',
    food_limitations: '',
    Activity_level: '',
    goal: '',
    number_of_meals: '',
    client_preference: '',
    region: 'israel'
  });

  // Add macro slider state
  const [macroSliders, setMacroSliders] = useState({ protein: 0, carbs: 0, fat: 0 });

  // Enhanced macro calculation state
  const [macroInputs, setMacroInputs] = useState({
    protein: { percentage: 0, grams: 0, gramsPerKg: 0 },
    carbs: { percentage: 0, grams: 0, gramsPerKg: 0 },
    fat: { percentage: 0, grams: 0, gramsPerKg: 0 }
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

  // Calculate macros based on different input methods
  const calculateMacrosFromInputs = (inputType, value, macroType) => {
    const calories = parseInt(formData.dailyTotalCalories) || 0;
    const weight = parseFloat(formData.weight_kg) || 0;
    
    if (calories <= 0) return;

    let newMacros = { ...macroInputs };
    
    if (inputType === 'percentage') {
      // Calculate grams from percentage
      const grams = Math.round((value * calories) / (macroType === 'fat' ? 9 : 4));
      newMacros[macroType] = {
        percentage: value,
        grams: grams,
        gramsPerKg: weight > 0 ? Math.round((grams / weight) * 10) / 10 : 0
      };
    } else if (inputType === 'grams') {
      // Calculate percentage from grams
      const percentage = Math.round(((value * (macroType === 'fat' ? 9 : 4)) / calories) * 100);
      newMacros[macroType] = {
        percentage: percentage,
        grams: value,
        gramsPerKg: weight > 0 ? Math.round((value / weight) * 10) / 10 : 0
      };
    } else if (inputType === 'gramsPerKg') {
      // Calculate grams from grams per kg
      const grams = Math.round(value * weight);
      const percentage = Math.round(((grams * (macroType === 'fat' ? 9 : 4)) / calories) * 100);
      newMacros[macroType] = {
        percentage: percentage,
        grams: grams,
        gramsPerKg: value
      };
    }

    setMacroInputs(newMacros);
    
    // Update macro sliders for compatibility
    setMacroSliders({
      protein: newMacros.protein.grams,
      carbs: newMacros.carbs.grams,
      fat: newMacros.fat.grams
    });
  };

  // Calculate total percentages and calories
  const calculateTotals = () => {
    const totalPercentage = macroInputs.protein.percentage + macroInputs.carbs.percentage + macroInputs.fat.percentage;
    const totalCalories = (macroInputs.protein.grams * 4) + (macroInputs.carbs.grams * 4) + (macroInputs.fat.grams * 9);
    return { totalPercentage, totalCalories };
  };

  // Auto-calculate initial macros when calories change
  useEffect(() => {
    const calories = parseInt(formData.dailyTotalCalories) || 0;
    if (calories > 0 && (!macroInputs.protein.grams && !macroInputs.carbs.grams && !macroInputs.fat.grams)) {
      // Default distribution: 30% protein, 40% carbs, 30% fat
      const defaultMacros = {
        protein: { percentage: 30, grams: Math.round((0.3 * calories) / 4), gramsPerKg: 0 },
        carbs: { percentage: 40, grams: Math.round((0.4 * calories) / 4), gramsPerKg: 0 },
        fat: { percentage: 30, grams: Math.round((0.3 * calories) / 9), gramsPerKg: 0 }
      };
      
      // Calculate grams per kg if weight is available
      const weight = parseFloat(formData.weight_kg) || 0;
      if (weight > 0) {
        defaultMacros.protein.gramsPerKg = Math.round((defaultMacros.protein.grams / weight) * 10) / 10;
        defaultMacros.carbs.gramsPerKg = Math.round((defaultMacros.carbs.grams / weight) * 10) / 10;
        defaultMacros.fat.gramsPerKg = Math.round((defaultMacros.fat.grams / weight) * 10) / 10;
      }
      
      setMacroInputs(defaultMacros);
      setMacroSliders({
        protein: defaultMacros.protein.grams,
        carbs: defaultMacros.carbs.grams,
        fat: defaultMacros.fat.grams
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
          updatedMacros[macro].gramsPerKg = Math.round((updatedMacros[macro].grams / weight) * 10) / 10;
        }
      });
      setMacroInputs(updatedMacros);
    }
  }, [formData.weight_kg]);

  // Mifflin-St Jeor calculation function (more accurate than Harris-Benedict)
  const calculateMifflinStJeor = (age, gender, weight, height, activityLevel, goal) => {
    if (!age || !gender || !weight || !height || !activityLevel) {
      return null;
    }

    // Convert height to cm if it's in meters
    let heightInCm = parseFloat(height);
    if (heightInCm > 0 && heightInCm < 10) {
      heightInCm = heightInCm * 100;
    }

    // Calculate BMR using Mifflin-St Jeor equation (more accurate)
    let bmr = 0;
    if (gender === 'male') {
      bmr = (10 * parseFloat(weight)) + (6.25 * heightInCm) - (5 * parseFloat(age)) + 5;
    } else {
      bmr = (10 * parseFloat(weight)) + (6.25 * heightInCm) - (5 * parseFloat(age)) - 161;
    }

    // Apply activity multiplier (more conservative values)
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

    // Adjust for goal (more conservative adjustments)
    switch (goal) {
      case 'lose': tdee -= 300; break; // Reduced from 500 to 300
      case 'gain': tdee += 300; break; // Reduced from 500 to 300
      case 'muscle': tdee += 200; break; // Reduced from 300 to 200
      // 'maintain' and 'health' don't change the calculation
    }

    return Math.round(tdee);
  };

  // Auto-calculate calories when relevant fields change
  useEffect(() => {
    const calculatedCalories = calculateMifflinStJeor(
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
            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.protein / 100) * calculatedCalories) / 4) / weight * 10) / 10 : 0
          },
          carbs: {
            percentage: currentPercentages.carbs,
            grams: Math.round(((currentPercentages.carbs / 100) * calculatedCalories) / 4),
            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.carbs / 100) * calculatedCalories) / 4) / weight * 10) / 10 : 0
          },
          fat: {
            percentage: currentPercentages.fat,
            grams: Math.round(((currentPercentages.fat / 100) * calculatedCalories) / 9),
            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.fat / 100) * calculatedCalories) / 9) / weight * 10) / 10 : 0
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
      recommendations: '',
      food_limitations: '',
      Activity_level: '',
      goal: '',
      number_of_meals: '5',
      client_preference: '',
      region: 'israel'
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
      recommendations: typeof client.recommendations === 'object' ? JSON.stringify(client.recommendations, null, 2) : client.recommendations || '',
      food_limitations: Array.isArray(client.food_limitations) ? client.food_limitations.join(', ') : 
                       typeof client.food_limitations === 'object' ? JSON.stringify(client.food_limitations, null, 2) : 
                       client.food_limitations || '',
      Activity_level: client.Activity_level || '',
      goal: client.goal || '',
      number_of_meals: client.number_of_meals?.toString() || '5',
      client_preference: typeof client.client_preference === 'object' ? JSON.stringify(client.client_preference, null, 2) : client.client_preference || '',
      region: client.region || 'israel'
    };
    
    setFormData(formDataToSet);
    
    // Check for existing food logs and update preferences if found
    if (client.user_code) {
      try {
        // Call the new eating habits analysis API
        const response = await fetch('https://dietitian-be.azurewebsites.net/api/analyze-eating-habits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_code: client.user_code
          }),
        });

        if (response.ok) {
          const analysisResult = await response.json();
          
          if (analysisResult.analysis) {
            setFoodLogsAnalysis({
              ...analysisResult.analysis_data,
              analysis: analysisResult.analysis
            });
            
            // If the user doesn't have existing preferences, auto-populate them
            if (!client.client_preference || client.client_preference.trim() === '') {
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
            }
          }
        }
      } catch (error) {
        console.log('No existing food logs found or error occurred:', error.message);
      }
    }
    
    // Set macro inputs to match the client's macros
    const calories = client.dailyTotalCalories ? parseInt(client.dailyTotalCalories) : 0;
    const weight = client.weight_kg ? parseFloat(client.weight_kg) : 0;
    
    const macroInputsData = {
      protein: {
        percentage: calories > 0 ? Math.round(((proteinValue * 4) / calories) * 100) : 0,
        grams: proteinValue,
        gramsPerKg: weight > 0 ? Math.round((proteinValue / weight) * 10) / 10 : 0
      },
      carbs: {
        percentage: calories > 0 ? Math.round(((carbsValue * 4) / calories) * 100) : 0,
        grams: carbsValue,
        gramsPerKg: weight > 0 ? Math.round((carbsValue / weight) * 10) / 10 : 0
      },
      fat: {
        percentage: calories > 0 ? Math.round(((fatValue * 9) / calories) * 100) : 0,
        grams: fatValue,
        gramsPerKg: weight > 0 ? Math.round((fatValue / weight) * 10) / 10 : 0
      }
    };
    
    setMacroInputs(macroInputsData);
    setMacroSliders({ protein: proteinValue, carbs: carbsValue, fat: fatValue });
    setFormSubmitted(false);
    setTouchedFields({});
    setDialogOpen(true);
    
    // Recalculate calories after a short delay to ensure form data is set
    setTimeout(() => {
      const calculatedCalories = calculateMifflinStJeor(
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
            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.protein / 100) * calculatedCalories) / 4) / weight * 10) / 10 : 0
          },
          carbs: {
            percentage: currentPercentages.carbs,
            grams: Math.round(((currentPercentages.carbs / 100) * calculatedCalories) / 4),
            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.carbs / 100) * calculatedCalories) / 4) / weight * 10) / 10 : 0
          },
          fat: {
            percentage: currentPercentages.fat,
            grams: Math.round(((currentPercentages.fat / 100) * calculatedCalories) / 9),
            gramsPerKg: weight > 0 ? Math.round((((currentPercentages.fat / 100) * calculatedCalories) / 9) / weight * 10) / 10 : 0
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
      await ChatUser.delete(clientId);
      await loadClients(); // Reload the clients list
      
      // Show success message
      alert(`${translations.clientDeleted}: ${clientName}`);
      
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
      } else if (fieldType === 'recommendations') {
        // Convert to recommendations object format
        if (trimmedValue.includes(',')) {
          const items = trimmedValue.split(',').map(item => item.trim());
          const result = {};
          items.forEach((item, index) => {
            result[`recommendation_${index + 1}`] = item;
          });
          return result;
        }
        return { general: trimmedValue };
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
      { field: 'age', label: translations.age },
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
        number_of_meals: formData.number_of_meals ? parseInt(formData.number_of_meals) : 5,
        date_of_birth: formData.date_of_birth && formData.date_of_birth.trim() !== '' ? formData.date_of_birth : null,
        food_allergies: parseArrayField(formData.food_allergies),
        food_limitations: parseJsonField(formData.food_limitations, 'array'),
        macros: parseMacrosField(macroInputs.protein.grams, macroInputs.carbs.grams, macroInputs.fat.grams),
        recommendations: parseJsonField(formData.recommendations, 'recommendations'),
        client_preference: parseJsonField(formData.client_preference, 'array')
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
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(client)}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {(client.user_code || client.id) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(client)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  disabled={deleteLoading === (client.user_code || client.id)}
                                >
                                  {deleteLoading === (client.user_code || client.id) ? (
                                    <div className="animate-spin h-4 w-4" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-6 text-gray-500">
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
            <DialogTitle>
              {currentClient ? translations.editUserInformation : translations.addNewClient}
            </DialogTitle>
            <DialogDescription>
              {currentClient ? translations.editUserDescription : translations.addUserDescription}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6 py-4">
              
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">{translations.basicInformation}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="user_code">{translations.clientCode}</Label>
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
                        placeholder="Auto-generated"
                        required
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => checkForFoodLogs(formData.user_code)}
                        disabled={analyzingFoodLogs || !formData.user_code}
                        className="whitespace-nowrap"
                      >
                        {analyzingFoodLogs ? (
                          <div className="animate-spin h-4 w-4" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {foodLogsAnalysis && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-800">
                          <strong>Food logs found:</strong> {foodLogsAnalysis.total_logs} entries
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          Preferences auto-populated based on frequently consumed foods
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="full_name" className="text-red-600">{translations.fullName} *</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      onBlur={() => handleFieldBlur('full_name')}
                      required
                      className={shouldShowError('full_name') ? 'border-red-500' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">{translations.email} <span className="text-gray-400">(optional)</span></Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone_number">{translations.phoneNumber}</Label>
                    <Input
                      id="phone_number"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">{translations.city}</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date_of_birth">{translations.dateOfBirth}</Label>
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
                    />
                  </div>
                </div>
              </div>

              {/* Physical Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">{translations.physicalInformation}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="age" className="text-red-600">{translations.age} *</Label>
                    <Input
                      id="age"
                      type="number"
                      value={formData.age}
                      onChange={(e) => setFormData({...formData, age: e.target.value})}
                      onBlur={() => handleFieldBlur('age')}
                      required
                      className={`${shouldShowError('age') ? 'border-red-500' : ''} ${formData.date_of_birth ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                      readOnly={!!formData.date_of_birth}
                      placeholder={formData.date_of_birth ? translations.ageCalculatedFromBirthDate : translations.enterAgeOrBirthDate}
                    />
                    {formData.date_of_birth && (
                      <p className="text-xs text-gray-500 mt-1">
                        {translations.ageCalculatedFromBirthDate}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="gender" className="text-red-600">{translations.gender} *</Label>
                    <Select 
                      value={formData.gender} 
                      onValueChange={(value) => setFormData({...formData, gender: value})}
                    >
                      <SelectTrigger className={shouldShowError('gender') ? 'border-red-500' : ''}>
                        <SelectValue placeholder={translations.selectGender} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{translations.male}</SelectItem>
                        <SelectItem value="female">{translations.female}</SelectItem>
                        <SelectItem value="other">{translations.other}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="weight_kg" className="text-red-600">{translations.weightKg} *</Label>
                    <Input
                      id="weight_kg"
                      type="number"
                      step="0.1"
                      value={formData.weight_kg}
                      onChange={(e) => setFormData({...formData, weight_kg: e.target.value})}
                      onBlur={() => handleFieldBlur('weight_kg')}
                      required
                      className={shouldShowError('weight_kg') ? 'border-red-500' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="height_cm" className="text-red-600">{translations.heightCm} *</Label>
                    <Input
                      id="height_cm"
                      type="number"
                      value={formData.height_cm}
                      onChange={(e) => setFormData({...formData, height_cm: e.target.value})}
                      onBlur={() => handleFieldBlur('height_cm')}
                      required
                      className={shouldShowError('height_cm') ? 'border-red-500' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="Activity_level" className="text-red-600">{translations.activityLevel} *</Label>
                    <Select 
                      value={formData.Activity_level} 
                      onValueChange={(value) => setFormData({...formData, Activity_level: value})}
                    >
                      <SelectTrigger className={shouldShowError('Activity_level') ? 'border-red-500' : ''}>
                        <SelectValue placeholder={translations.selectActivityLevel} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sedentary">{translations.sedentary}</SelectItem>
                        <SelectItem value="light">{translations.lightActivity}</SelectItem>
                        <SelectItem value="moderate">{translations.moderateActivity}</SelectItem>
                        <SelectItem value="very">{translations.veryActive}</SelectItem>
                        <SelectItem value="extra">{translations.extraActive}</SelectItem>
                        <SelectItem value="toning">{translations.toning}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="goal" className="text-red-600">{translations.goal} *</Label>
                    <Select 
                      value={formData.goal} 
                      onValueChange={(value) => setFormData({...formData, goal: value})}
                    >
                      <SelectTrigger className={shouldShowError('goal') ? 'border-red-500' : ''}>
                        <SelectValue placeholder={translations.selectGoal} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lose">{translations.loseWeight}</SelectItem>
                        <SelectItem value="maintain">{translations.maintainWeight}</SelectItem>
                        <SelectItem value="gain">{translations.gainWeight}</SelectItem>
                        <SelectItem value="muscle">{translations.buildMuscle}</SelectItem>
                        <SelectItem value="health">{translations.improveHealth}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Nutrition Information */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium">{translations.nutritionInformation}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="dailyTotalCalories" className="flex items-center gap-2">
                      {translations.dailyTotalCalories}
                      <Badge variant="secondary" className="text-xs">{translations.autoCalculated}</Badge>
                    </Label>
                    <Input
                      id="dailyTotalCalories"
                      type="number"
                      value={formData.dailyTotalCalories}
                      readOnly
                      className={`${hasRequiredFieldsForCalculation() ? 'bg-gray-50' : 'bg-yellow-50'} cursor-not-allowed`}
                      placeholder={hasRequiredFieldsForCalculation() ? translations.autoCalculated : translations.fillRequiredFieldsToCalculate}
                    />
                    <p className="text-xs text-gray-500">
                      {translations.mifflinStJeorInfo}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number_of_meals">{translations.numberOfMeals}</Label>
                    <Input
                      id="number_of_meals"
                      type="number"
                      min="1"
                      max="10"
                      value={formData.number_of_meals}
                      onChange={(e) => setFormData({...formData, number_of_meals: e.target.value})}
                      placeholder="5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">{translations.region}</Label>
                    <Input
                      id="region"
                      value={formData.region}
                      onChange={(e) => setFormData({...formData, region: e.target.value})}
                      placeholder="israel"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-base font-medium">{translations.macrosGrams}</Label>
                  
                  {/* Macro Input Rows */}
                  <div className="space-y-2">
                    {[
                      { key: 'protein', label: translations.protein, color: 'blue', maxGrams: 300 },
                      { key: 'carbs', label: translations.carbs, color: 'purple', maxGrams: 400 },
                      { key: 'fat', label: translations.fat, color: 'teal', maxGrams: 150 }
                    ].map(macro => (
                      <div key={macro.key} className="border rounded-md p-2 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs font-medium capitalize">{macro.label}</Label>
                          <div className="text-xs text-gray-500">
                            {macroInputs[macro.key].grams}g
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2 items-center">
                          {/* Percentage Input */}
                          <div>
                            <Label className="text-xs text-gray-600">%</Label>
                            <Input
                              type="number"
                              value={macroInputs[macro.key].percentage}
                              onChange={(e) => calculateMacrosFromInputs('percentage', parseFloat(e.target.value) || 0, macro.key)}
                              className="text-xs h-8"
                              min="0"
                              max="100"
                            />
                          </div>
                          
                          {/* Grams Input */}
                          <div>
                            <Label className="text-xs text-gray-600">{translations.grams}</Label>
                            <Input
                              type="number"
                              value={macroInputs[macro.key].grams}
                              onChange={(e) => calculateMacrosFromInputs('grams', parseFloat(e.target.value) || 0, macro.key)}
                              className="text-xs h-8"
                              min="0"
                              max={macro.maxGrams}
                            />
                          </div>
                          
                          {/* Grams per Kg Input */}
                          <div>
                            <Label className="text-xs text-gray-600">g/kg</Label>
                            <Input
                              type="number"
                              value={macroInputs[macro.key].gramsPerKg}
                              onChange={(e) => calculateMacrosFromInputs('gramsPerKg', parseFloat(e.target.value) || 0, macro.key)}
                              className="text-xs h-8"
                              min="0"
                              step="0.1"
                            />
                          </div>
                          
                          {/* Slider */}
                          <div className="flex-1">
                            <Slider
                              min={0}
                              max={macro.maxGrams}
                              step={1}
                              value={[macroInputs[macro.key].grams]}
                              onValueChange={([val]) => calculateMacrosFromInputs('grams', val, macro.key)}
                              className={`[&>span]:bg-${macro.color}-500`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-600">{translations.totalPercentages}: </span>
                        <span className="font-medium">{calculateTotals().totalPercentage.toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-600">{translations.totalCaloriesInTargets}: </span>
                        <span className="font-medium">{calculateTotals().totalCalories}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {translations.macrosSumMatches} <br />
                      <span className="font-mono">{translations.caloriesFormula}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Dietary Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">{translations.dietaryInformation}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="food_allergies">{translations.foodAllergies}</Label>
                    <Input
                      id="food_allergies"
                      value={formData.food_allergies}
                      onChange={(e) => setFormData({...formData, food_allergies: e.target.value})}
                      placeholder={translations.foodAllergiesPlaceholder}
                    />
                  </div>
                  <div>
                    <Label htmlFor="food_limitations">{translations.foodLimitations}</Label>
                    <Textarea
                      id="food_limitations"
                      value={formData.food_limitations}
                      onChange={(e) => setFormData({...formData, food_limitations: e.target.value})}
                      placeholder={translations.foodLimitationsPlaceholder}
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {translations.foodLimitationsHelp}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="client_preference" className="flex items-center gap-2">
                      {translations.foodDiary} / {translations.eatingHabitsAnalysis}
                      {foodLogsAnalysis && (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                          {translations.autoPopulated || 'Auto-populated'} ({foodLogsAnalysis.total_logs} {translations.entriesFound || 'entries'})
                        </Badge>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      {console.log('foodLogsAnalysis state:', foodLogsAnalysis)}
                      <Textarea
                        id="client_preference"
                        value={formData.client_preference}
                        onChange={(e) => setFormData({...formData, client_preference: e.target.value})}
                        placeholder={translations.clientPreferencesPlaceholder}
                        rows={3}
                        className={`flex-1 transition-all duration-200 ${foodLogsAnalysis ? 'border-green-500 bg-green-100 text-green-900 font-semibold shadow-md ring-2 ring-green-300' : ''}`}
                        style={{ 
                          borderColor: foodLogsAnalysis ? '#10b981' : undefined,
                          backgroundColor: foodLogsAnalysis ? '#dcfce7' : undefined,
                          color: foodLogsAnalysis ? '#064e3b' : undefined
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
                          className="whitespace-nowrap h-fit"
                        >
                          {translatingPreferences ? (
                            <div className="animate-spin h-4 w-4" />
                          ) : (
                            translations.translateToHebrew || 'Translate to Hebrew'
                          )}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {foodLogsAnalysis ? (
                        <span className="text-green-600 font-medium">
                          ✨ {translations.preferencesAutoPopulated || 'Eating habits analysis completed'} from {foodLogsAnalysis.total_logs} food log entries. You can edit this analysis as needed.
                        </span>
                      ) : (
                        translations.clientPreferencesHelp
                      )}
                    </p>

                  </div>
                  <div>
                    <Label htmlFor="recommendations">{translations.recommendations}</Label>
                    <Textarea
                      id="recommendations"
                      value={formData.recommendations}
                      onChange={(e) => setFormData({...formData, recommendations: e.target.value})}
                      placeholder={translations.recommendationsPlaceholder}
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {translations.recommendationsHelp}
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