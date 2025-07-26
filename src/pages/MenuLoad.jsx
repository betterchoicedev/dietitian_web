import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader, Save, Search, Filter, Utensils, Edit, CalendarRange, Download } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNavigate } from 'react-router-dom';
import { Menu } from '@/api/entities';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { EventBus } from '@/utils/EventBus';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      // Try MenuCreate API first, fallback to original API
      let response = await fetch(`https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/suggestions?query=${encodeURIComponent(query)}`);
      
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data || []);
      } else {
        // Fallback to original API
        response = await fetch('/api/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingredient_name: query, limit: 5 })
        });
        
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
        }
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
            carbs: nutritionData.Carbohydrate || 0,
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
          carbs: Math.round(suggestion.Carbohydrate || 0)
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
  const [generatingAlt, setGeneratingAlt] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { language, translations } = useLanguage();

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

      return result;
    });

    // Get totals from the saved menu
    const totals = savedMenu.meal_plan?.totals || savedMenu.totals || {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0
    };

    const result = {
      meals: convertedMeals,
      totals: {
        calories: typeof totals.calories === 'string' ? parseInt(totals.calories) || 0 : totals.calories,
        protein: typeof totals.protein === 'string' ? parseInt(totals.protein) || 0 : totals.protein,
        fat: typeof totals.fat === 'string' ? parseInt(totals.fat) || 0 : totals.fat,
        carbs: typeof totals.carbs === 'string' ? parseInt(totals.carbs) || 0 : totals.carbs
      },
      note: savedMenu.meal_plan?.note || savedMenu.note || '',
      id: savedMenu.id,
      meal_plan_name: savedMenu.meal_plan_name,
      user_code: savedMenu.user_code
    };
    
    console.log('Converted menu result:', result);
    return result;
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

  // Load saved menus
  const loadMenus = async () => {
    setLoadingMenus(true);
    setError(null);
    try {
      // First, check and update any expired menus
      await checkAndUpdateExpiredMenus();
      
      let loadedMenus = [];
      try {
        loadedMenus = await Menu.filter({ 
          record_type: 'meal_plan'
        }, '-created_at');
      } catch (fetchError) {
        console.error("Error loading menus:", fetchError);
        const allMenus = await Menu.list();
        loadedMenus = allMenus.filter(menu => 
          menu.record_type === 'meal_plan'
        );
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
  };

  useEffect(() => {
    loadMenus();
  }, []);

  const filteredMenus = menus.filter(menu => {
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
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleMenuSelect = (menu) => {
    const converted = convertToEditFormat(menu);
    if (converted) {
      setSelectedMenu(menu);
      setEditedMenu(converted);
      setIsEditing(true);
    } else {
      setError('This menu format is not supported for editing');
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
        meal_plan_name: editedMenu.meal_plan_name || 'Updated Menu Plan',
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

      const result = await Menu.update(selectedMenuForStatus.id, updateData);
      console.log('✅ Menu status updated successfully:', result);
      
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
  async function downloadPdf(menu) {
    try {
      // Create HTML content for the PDF
      const htmlContent = generateMenuHtml(menu);
      
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

  function generateMenuHtml(menu) {
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const totals = menu.totals || calculateMainTotals(menu);
    
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
    <title>BetterChoice - Meal Plan</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700&family=Inter:wght@400;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', 'Noto Sans Hebrew', sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background: white;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #059669;
        }
        
        .header h1 {
            color: #059669;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        .header p {
            color: #6b7280;
            font-size: 14px;
        }
        
        .totals-section {
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
        }
        
        .totals-section h3 {
            color: #059669;
            font-size: 18px;
            margin-bottom: 15px;
            font-weight: 600;
        }
        
        .macros-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
        }
        
        .macro-item {
            text-align: center;
            padding: 10px;
            border-radius: 8px;
            background: white;
        }
        
        .macro-value {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 5px;
        }
        
        .macro-label {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .calories { color: #059669; }
        .protein { color: #2563eb; }
        .carbs { color: #fb923c; }
        .fat { color: #facc15; }
        
        .meal-section {
            margin-bottom: 30px;
            page-break-inside: avoid;
        }
        
        .meal-title {
            color: #059669;
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid #d1fae5;
        }
        
        .meal-option {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 15px;
        }
        
        .option-title {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 10px;
        }
        
        .option-type {
            display: inline-block;
            background: #059669;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .option-type.alternative {
            background: #2563eb;
        }
        
        .nutrition-info {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }
        
        .nutrition-item {
            font-size: 14px;
            color: #6b7280;
        }
        
        .nutrition-item strong {
            color: #1f2937;
        }
        
        .ingredients-list {
            list-style: none;
        }
        
        .ingredients-list li {
            padding: 8px 0;
            border-bottom: 1px solid #f1f5f9;
            font-size: 14px;
        }
        
        .ingredients-list li:last-child {
            border-bottom: none;
        }
        
        .ingredient-item {
            font-weight: 500;
            color: #1f2937;
        }
        
        .ingredient-details {
            color: #6b7280;
            font-size: 13px;
            margin-top: 2px;
        }
        
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 12px;
        }
        
        @media print {
            body {
                padding: 0;
                max-width: none;
                margin: 0;
                font-size: 12px;
            }
            
            .header {
                margin-bottom: 20px;
                padding-bottom: 15px;
            }
            
            .header h1 {
                font-size: 24px;
                margin-bottom: 8px;
            }
            
            .header p {
                font-size: 12px;
            }
            
            .totals-section {
                margin-bottom: 20px;
                padding: 15px;
            }
            
            .totals-section h3 {
                font-size: 16px;
                margin-bottom: 12px;
            }
            
            .macro-value {
                font-size: 18px;
            }
            
            .macro-label {
                font-size: 10px;
            }
            
            .meal-section {
                page-break-inside: avoid;
                margin-bottom: 20px;
            }
            
            .meal-title {
                font-size: 18px;
                margin-bottom: 12px;
                padding-bottom: 6px;
            }
            
            .meal-option {
                page-break-inside: avoid;
                margin-bottom: 12px;
                padding: 15px;
            }
            
            .option-title {
                font-size: 14px;
                margin-bottom: 8px;
            }
            
            .option-type {
                font-size: 10px;
                padding: 3px 10px;
                margin-bottom: 8px;
            }
            
            .nutrition-info {
                gap: 12px;
                margin-bottom: 12px;
            }
            
            .nutrition-item {
                font-size: 12px;
            }
            
            .ingredients-list li {
                padding: 6px 0;
                font-size: 12px;
            }
            
            .ingredient-item {
                font-size: 12px;
            }
            
            .ingredient-details {
                font-size: 11px;
            }
            
            .footer {
                margin-top: 30px;
                padding-top: 15px;
                font-size: 10px;
            }
            
            /* Force page breaks at logical points */
            .meal-section:nth-child(3n) {
                page-break-before: auto;
            }
            
            /* Ensure headers don't break */
            .meal-title {
                page-break-after: avoid;
            }
            
            /* Keep nutrition info with meal titles */
            .nutrition-info {
                page-break-inside: avoid;
            }
            
            /* Keep ingredients with their meal options */
            .ingredients-list {
                page-break-inside: avoid;
            }
        }
        
        /* RTL Support */
        [dir="rtl"] {
            text-align: right;
        }
        
        [dir="rtl"] .macros-grid {
            direction: rtl;
        }
        
        [dir="rtl"] .nutrition-info {
            direction: rtl;
        }
        
        [dir="rtl"] .header {
            text-align: center;
        }
        
        [dir="rtl"] .footer {
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>BetterChoice - Meal Plan</h1>
        <p>Personalized Nutrition Menu • Generated on ${today}</p>
    </div>
    
    <div class="totals-section">
        <h3>Daily Nutritional Summary</h3>
        <div class="macros-grid">
            <div class="macro-item">
                <div class="macro-value calories">${totals.calories || 0}</div>
                <div class="macro-label">Calories</div>
            </div>
            <div class="macro-item">
                <div class="macro-value protein">${totals.protein || 0}g</div>
                <div class="macro-label">Protein</div>
            </div>
            <div class="macro-item">
                <div class="macro-value carbs">${totals.carbs || 0}g</div>
                <div class="macro-label">Carbs</div>
            </div>
            <div class="macro-item">
                <div class="macro-value fat">${totals.fat || 0}g</div>
                <div class="macro-label">Fat</div>
            </div>
        </div>
    </div>
    
    ${menu.meals ? menu.meals.map((meal, index) => `
        <div class="meal-section">
            <h2 class="meal-title">${meal.meal || `Meal ${index + 1}`}</h2>
            
            ${meal.main ? `
                <div class="meal-option">
                    <div class="option-type">Main Option</div>
                    <div class="option-title">${meal.main.meal_title || 'Main Meal'}</div>
                    ${meal.main.nutrition ? `
                        <div class="nutrition-info">
                            <span class="nutrition-item"><strong>${meal.main.nutrition.calories || 0}</strong> kcal</span>
                            <span class="nutrition-item"><strong>${meal.main.nutrition.protein || 0}g</strong> protein</span>
                            <span class="nutrition-item"><strong>${meal.main.nutrition.carbs || 0}g</strong> carbs</span>
                            <span class="nutrition-item"><strong>${meal.main.nutrition.fat || 0}g</strong> fat</span>
                        </div>
                    ` : ''}
                    ${meal.main.ingredients && meal.main.ingredients.length > 0 ? `
                        <ul class="ingredients-list">
                            ${meal.main.ingredients.map(ingredient => `
                                <li>
                                    <div class="ingredient-item">${ingredient.item || 'Ingredient'}</div>
                                    ${ingredient.quantity || ingredient.unit || ingredient.household_measure ? `
                                        <div class="ingredient-details">
                                            ${ingredient.quantity ? `${ingredient.quantity} ` : ''}${ingredient.unit ? `${ingredient.unit} ` : ''}${ingredient.household_measure ? `(${ingredient.household_measure})` : ''}
                                        </div>
                                    ` : ''}
                                </li>
                            `).join('')}
                        </ul>
                    ` : ''}
                </div>
            ` : ''}
            
            ${meal.alternative ? `
                <div class="meal-option">
                    <div class="option-type alternative">Alternative Option</div>
                    <div class="option-title">${meal.alternative.meal_title || 'Alternative Meal'}</div>
                    ${meal.alternative.nutrition ? `
                        <div class="nutrition-info">
                            <span class="nutrition-item"><strong>${meal.alternative.nutrition.calories || 0}</strong> kcal</span>
                            <span class="nutrition-item"><strong>${meal.alternative.nutrition.protein || 0}g</strong> protein</span>
                            <span class="nutrition-item"><strong>${meal.alternative.nutrition.carbs || 0}g</strong> carbs</span>
                            <span class="nutrition-item"><strong>${meal.alternative.nutrition.fat || 0}g</strong> fat</span>
                        </div>
                    ` : ''}
                    ${meal.alternative.ingredients && meal.alternative.ingredients.length > 0 ? `
                        <ul class="ingredients-list">
                            ${meal.alternative.ingredients.map(ingredient => `
                                <li>
                                    <div class="ingredient-item">${ingredient.item || 'Ingredient'}</div>
                                    ${ingredient.quantity || ingredient.unit || ingredient.household_measure ? `
                                        <div class="ingredient-details">
                                            ${ingredient.quantity ? `${ingredient.quantity} ` : ''}${ingredient.unit ? `${ingredient.unit} ` : ''}${ingredient.household_measure ? `(${ingredient.household_measure})` : ''}
                                        </div>
                                    ` : ''}
                                </li>
                            `).join('')}
                        </ul>
                    ` : ''}
                </div>
            ` : ''}
            
            ${meal.alternatives && meal.alternatives.length > 0 ? meal.alternatives.map((alt, altIndex) => `
                <div class="meal-option">
                    <div class="option-type alternative">Additional Alternative ${altIndex + 2}</div>
                    <div class="option-title">${alt.meal_title || 'Additional Alternative'}</div>
                    ${alt.nutrition ? `
                        <div class="nutrition-info">
                            <span class="nutrition-item"><strong>${alt.nutrition.calories || 0}</strong> kcal</span>
                            <span class="nutrition-item"><strong>${alt.nutrition.protein || 0}g</strong> protein</span>
                            <span class="nutrition-item"><strong>${alt.nutrition.carbs || 0}g</strong> carbs</span>
                            <span class="nutrition-item"><strong>${alt.nutrition.fat || 0}g</strong> fat</span>
                        </div>
                    ` : ''}
                    ${alt.ingredients && alt.ingredients.length > 0 ? `
                        <ul class="ingredients-list">
                            ${alt.ingredients.map(ingredient => `
                                <li>
                                    <div class="ingredient-item">${ingredient.item || 'Ingredient'}</div>
                                    ${ingredient.quantity || ingredient.unit || ingredient.household_measure ? `
                                        <div class="ingredient-details">
                                            ${ingredient.quantity ? `${ingredient.quantity} ` : ''}${ingredient.unit ? `${ingredient.unit} ` : ''}${ingredient.household_measure ? `(${ingredient.household_measure})` : ''}
                                        </div>
                                    ` : ''}
                                </li>
                            `).join('')}
                        </ul>
                    ` : ''}
                </div>
            `).join('') : ''}
        </div>
    `).join('') : ''}
    
    <div class="footer">
        <p>© BetterChoice 2025 • Personalized Nutrition Planning</p>
    </div>
</body>
</html>`;
  }

  // Handle language changes
  const handleLanguageChange = async (lang) => {
    if (!editedMenu || loading) return;

    if (lang === 'en') {
      // Load the original menu data (English)
      const originalMenu = menus.find(m => m.id === editedMenu.id);
      if (originalMenu) {
        const converted = convertToEditFormat(originalMenu);
        if (converted) {
          setEditedMenu(converted);
        }
      }
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const translated = await translateMenu(editedMenu, lang);
      setEditedMenu(translated);
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
                      {(ingredient.calories || ingredient.protein) && (
                        <>
                          <span className="text-orange-600 font-medium">
                            {Math.round(ingredient.calories || 0)} {translations.calories || 'cal'}
                          </span>
                          <span className="text-blue-600 font-medium">
                            {Math.round(ingredient.protein || 0)}g {translations.protein || 'protein'}
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

        <div className="flex justify-end gap-3">
          <Button
            onClick={() => downloadPdf(editedMenu)}
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <Download className="h-4 w-4 mr-2" />
            {translations.downloadAsPdf || 'Download as PDF'}
          </Button>
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
            {expiredCheckResult.found > 0 ? 'Expired Menus Found' : 'No Expired Menus'}
          </AlertTitle>
          <AlertDescription>
            {expiredCheckResult.found > 0 ? (
              <div className="space-y-2">
                <p>Found {expiredCheckResult.found} expired menu(s).</p>
                <p>Successfully updated {expiredCheckResult.updated} menu(s) to expired status.</p>
                {expiredCheckResult.errors > 0 && (
                  <p className="text-red-600">Failed to update {expiredCheckResult.errors} menu(s).</p>
                )}
                {expiredCheckResult.menus.length > 0 && (
                  <div>
                    <p className="font-medium">Updated menus:</p>
                    <ul className="list-disc list-inside text-sm">
                      {expiredCheckResult.menus.map((name, idx) => (
                        <li key={idx}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p>No expired menus found. All active menus are still within their active period.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Search className="w-5 h-5 text-gray-400" />
          <Input
            placeholder={translations.searchMenus || "Search by name or client code..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
        </div>
        
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-5 h-5 text-gray-400" />
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
                  
                  <Button 
                    variant="outline"
                    className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(menu);
                    }}
                  >
                    <span className="text-sm">⚙️</span>
                    {translations.manageStatus || 'Manage Status'}
                  </Button>
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
                    <SelectItem value="active">{translations.active || 'Active'}</SelectItem>
                    <SelectItem value="published">{translations.published || 'Published'}</SelectItem>
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