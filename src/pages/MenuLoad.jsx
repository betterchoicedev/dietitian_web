import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader, Save, Search, Filter, Utensils, Edit, CalendarRange } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNavigate } from 'react-router-dom';
import { Menu } from '@/api/entities';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
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

const EditableIngredient = ({ value, onChange, mealIndex, optionIndex, ingredientIndex }) => {
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
      let response = await fetch(`http://127.0.0.1:5000/api/suggestions?query=${encodeURIComponent(query)}`);
      
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
        const response = await fetch(`http://127.0.0.1:5000/api/ingredient-nutrition?name=${encodeURIComponent(suggestion.english)}`);
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
                    {Math.round(suggestion.Energy || 0)} cal, {Math.round(suggestion.Protein || 0)}g protein
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
  const navigate = useNavigate();
  const { translations } = useLanguage();

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
      let loadedMenus = [];
      try {
        loadedMenus = await Menu.filter({ 
          record_type: 'meal_plan'
        }, '-created_date');
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
       menu.menu_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
              {typeof option.nutrition?.calories === 'number' ? option.nutrition.calories + 'kcal' : option.nutrition?.calories}
            </Badge>
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
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EditableIngredient
                        value={ingredient.item}
                        onChange={handleIngredientChange}
                        mealIndex={option.mealIndex}
                        optionIndex={isAlternative ? 'alternative' : 'main'}
                        ingredientIndex={idx}
                      />
                      <span className="text-gray-600">
                        {ingredient.household_measure}
                      </span>
                      {(ingredient.calories || ingredient.protein) && (
                        <>
                          <span className="text-orange-600 font-medium">
                            {Math.round(ingredient.calories || 0)} cal
                          </span>
                          <span className="text-blue-600 font-medium">
                            {Math.round(ingredient.protein || 0)}g protein
                          </span>
                        </>
                      )}
                    </div>
                  </div>
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
              Edit Menu: {editedMenu.meal_plan_name || 'Loaded Menu'}
            </h1>
            {editedMenu.user_code && (
              <p className="text-sm text-gray-500">User Code: {editedMenu.user_code}</p>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
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
                    <span className="text-sm font-normal text-green-600 ml-1">kcal</span>
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
                </div>
              </CardContent>
            </Card>
          ))}
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
            {saving ? 'Saving...' : 'Save Changes'}
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
        <h1 className="text-2xl font-bold">Load & Edit Menu</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Search className="w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search by name, menu code, or client code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
        </div>
        
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-5 h-5 text-gray-400" />
          <Select value={filterUserCode} onValueChange={setFilterUserCode}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {userCodes.map(code => (
                <SelectItem key={code} value={code}>{code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                    {menu.meal_plan_name || 'Untitled Menu'}
                  </CardTitle>
                  <CardDescription>
                    <span>User Code: {menu.user_code || 'N/A'}</span>
                  </CardDescription>
                </div>
                <Badge 
                  variant="secondary"
                  className={getStatusColor(menu.status)}
                >
                  {menu.status === 'published' ? 'Published' : 
                   menu.status === 'active' ? 'Active' : 'Draft'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Total Calories</p>
                    <p className="font-medium">{menu.daily_total_calories || 0} kcal</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Protein</p>
                    <p className="font-medium">{menu.macros_target?.protein || '0g'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Carbs</p>
                    <p className="font-medium">{menu.macros_target?.carbs || '0g'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Fat</p>
                    <p className="font-medium">{menu.macros_target?.fat || '0g'}</p>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Menu Code:</span>
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                      {menu.menu_code || 'N/A'}
                    </span>
                  </div>
                </div>
                
                <div className="pt-2">
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMenuSelect(menu);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Load & Edit Menu
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
                    No menus found
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    No menus match your search criteria
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MenuLoad; 