import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader, Save, Clock, Utensils, CalendarRange, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNavigate } from 'react-router-dom';
import { Menu } from '@/api/entities';
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";
import { useLanguage } from '@/contexts/LanguageContext';
import { EventBus } from '@/utils/EventBus';
import ReactToPdf from 'react-to-pdf';


const EditableIngredient = ({ value, onChange, mealIndex, optionIndex, ingredientIndex }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = React.useRef(null);
  const searchTimeoutRef = React.useRef(null);

  useEffect(() => {
    setEditValue(value);
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
      const response = await fetch(`http://localhost:3001/api/suggestions?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setSuggestions(data);
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

  const handleSelect = async (suggestion) => {
    try {
      const response = await fetch(`http://localhost:3001/api/ingredient-nutrition?name=${encodeURIComponent(suggestion.english)}`);
      if (!response.ok) throw new Error('Failed to fetch nutrition data');
      const nutritionData = await response.json();

      const updatedValues = {
        item: suggestion.hebrew || suggestion.english,
        quantity: '100',
        unit: 'g',
        nutrition: {
          calories: nutritionData.Energy || 0,
          protein: nutritionData.Protein ? `${nutritionData.Protein}g` : '0g',
          fat: nutritionData.Total_lipid__fat_ ? `${nutritionData.Total_lipid__fat_}g` : '0g',
          carbs: nutritionData.Carbohydrate__by_difference_ ? `${nutritionData.Carbohydrate__by_difference_}g` : '0g'
        }
      };

      onChange(updatedValues, mealIndex, optionIndex, ingredientIndex);
      setEditValue(suggestion.hebrew || suggestion.english);
      setShowSuggestions(false);
      setIsEditing(false);
    } catch (error) {
      console.error('Error fetching nutrition data:', error);
    }
  };

  if (!isEditing) {
    return (
      <div
        onClick={() => {
          setIsEditing(true);
          setSuggestions([]);
          setShowSuggestions(false);
        }}
        className="cursor-pointer hover:bg-gray-50 px-2 py-1 rounded text-right"
        dir="rtl"
      >
        {value}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={handleInputChange}
        onFocus={() => setShowSuggestions(true)}
        className="w-full px-2 py-1 border border-gray-300 rounded text-right"
        dir="rtl"
        autoFocus
      />

      {isLoading && (
        <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          <ul className="py-1 max-h-60 overflow-auto">
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                onClick={() => handleSelect(suggestion)}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-right"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{suggestion.hebrew}</span>
                  <span className="text-sm text-gray-500">{suggestion.english}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const MenuCreate = () => {
  const pdfRef = React.useRef();
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [shoppingList, setShoppingList] = useState([]);
  const [menu, setMenu] = useState(null);
  const [originalMenu, setOriginalMenu] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { language, translations } = useLanguage();

  function calculateMainTotals(menu) {
  let totalCalories = 0;
  let totalProtein = 0;
  let totalFat = 0;
  let totalCarbs = 0;

  if (!menu.meals) return { calories: 0, protein: 0, fat: 0, carbs: 0 };

  menu.meals.forEach(meal => {
    const nutrition = meal?.main?.nutrition || {};
    totalCalories += Number(nutrition.calories) || 0;
    totalProtein  += Number(nutrition.protein) || 0;
    totalFat      += Number(nutrition.fat) || 0;
    totalCarbs    += Number(nutrition.carbs) || 0;
  });

  return {
    calories: Math.round(totalCalories),
    protein: Math.round(totalProtein),
    fat: Math.round(totalFat),
    carbs: Math.round(totalCarbs),
  };
}

  
  
  function generateShoppingList(menu) {
    const list = {};
    menu.meals.forEach(meal => {
      ['main', 'alternative'].forEach(opt => {
        if (meal[opt] && meal[opt].ingredients) {
          meal[opt].ingredients.forEach(ing => {
            const itemName = ing.item_en || ing.item || ''; // Use item_en if exists, else fallback
            const unit = ing.unit || '';
            const quantity = Number(ing.quantity) || 0;
            const key = itemName + '_' + unit;
            if (!list[key]) {
              list[key] = { name: itemName, unit, quantity: 0 };
            }
            list[key].quantity += quantity;
          });
        }
      });
    });
    return Object.values(list);
  }
  
  const handleIngredientChange = (newValues, mealIndex, optionIndex, ingredientIndex) => {
    setMenu(prevMenu => {
      const updatedMenu = { ...prevMenu };
      const meal = updatedMenu.meals[mealIndex];
      const option = optionIndex === 'main' ? meal.main : meal.alternative;

      // Update the ingredient
      option.ingredients[ingredientIndex] = newValues;

      // Update meal name: keep the part before "with", then add the first 2-3 ingredient names
      const originalName = option.name;
      const baseName = originalName.includes(' with ')
        ? originalName.split(' with ')[0]
        : originalName;
      const ingredientNames = option.ingredients.map(ing => ing.item).filter(Boolean);
      if (ingredientNames.length > 0) {
        option.name = `${option.name.split(' with ')[0]} with ${ingredientNames.join(', ')}`;
      }

      // Recalculate meal nutrition by summing all ingredient values
      const nutrition = option.ingredients.reduce(
        (acc, ing) => ({
          calories: acc.calories + (Number(ing.calories) || 0),
          protein: acc.protein + (Number(ing.protein) || 0),
          fat: acc.fat + (Number(ing.fat) || 0),
          carbs: acc.carbs + (Number(ing.carbs) || 0),
        }),
        { calories: 0, protein: 0, fat: 0, carbs: 0 }
      );
      option.nutrition = nutrition;

      // Update menu totals as well
      return calculateMainTotals(updatedMenu);
    });
  };

  const fetchMenu = async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Get meal template
      const templateRes = await fetch("http://localhost:5000/api/template", { method: "POST" });
      const templateData = await templateRes.json();
      if (templateData.error || !templateData.template) throw new Error("Template generation failed");
      const template = templateData.template;

      // Step 2: Build menu (backend now does all meal-by-meal logic + validation)
      const buildRes = await fetch("http://localhost:5000/api/build-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const buildData = await buildRes.json();
      if (buildData.error || !buildData.menu) throw new Error("Menu build failed");

       const menuData = {
    meals: buildData.menu,
    totals: calculateMainTotals({ meals: buildData.menu }),
    note: buildData.note || ''
  };

  // Set the original English menu data ONCE. This is our source of truth.
  setOriginalMenu(menuData);

  // Display the correct version based on the initial language
  if (language === 'he') {
    const translatedMenu = await translateMenu(menuData, 'he');
    setMenu(translatedMenu);
  } else {
    setMenu(menuData); // Already in English
  }

    } catch (err) {
      console.error("Error generating menu:", err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMenu = async () => {
    // Always save the original, untranslated menu to ensure data integrity.
    if (!originalMenu) return;

    try {
      setSaving(true);
      setError(null);
      await Menu.create({
        programName: 'Generated Menu Plan',
        status: 'draft',
        meals: originalMenu.meals || [],
        dailyTotalCalories: originalMenu.totals?.calories || 2000,
        macros: {
          protein: originalMenu.totals?.protein || 30,
          carbs: originalMenu.totals?.carbs || 40,
          fat: originalMenu.totals?.fat || 30,
        },
      });
      // Navigate after successful save
      navigate(`/MenuEdit?id=${newMenu.id}`);
    } catch (err) {
      console.error('Error saving menu:', err);
      setError(err.message || 'Failed to save menu');
    } finally {
      setSaving(false);
    }
  };

  const renderMealOption = (option, isAlternative = false) => {
    if (!option) return null;

    return (
      <div className={`p-4 rounded-lg ${isAlternative ? 'bg-blue-50' : 'bg-green-50'}`}>
        <div className="flex justify-between items-start mb-3">
          <h4 className="font-medium text-gray-900">{option.meal_title}</h4>
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
                  <EditableIngredient
                    value={ingredient.item}
                    onChange={handleIngredientChange}
                    mealIndex={option.mealIndex}
                    optionIndex={isAlternative ? 'alternative' : 'main'}
                    ingredientIndex={idx}
                  />
                  <span className="text-gray-600">
                    {ingredient.quantity} {ingredient.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Create a stable function to handle language changes
  const handleLanguageChange = useCallback(async (lang) => {
    if (!originalMenu) return; // Nothing to translate

    // If switching to English, instantly use the original menu
    if (lang === 'en') {
      setMenu(originalMenu);
      return;
    }

    // For other languages, translate from the pristine original menu
    setLoading(true);
    setError(null);
    try {
      const translated = await translateMenu(originalMenu, lang);
      setMenu(translated);
    } catch (err) {
      setError('Failed to translate menu.');
      setMenu(originalMenu); // Fallback to original on error
    } finally {
      setLoading(false);
    }
  }, [originalMenu]); // This function is stable and only recreated if originalMenu changes

  useEffect(() => {
    // Subscribe the stable handler to the language change event
    EventBus.on('translateMenu', handleLanguageChange);
    return () => {
      // Unsubscribe on cleanup to prevent memory leaks
      if (EventBus.off) {
        EventBus.off('translateMenu', handleLanguageChange);
      }
    };
  }, [handleLanguageChange]);
  

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{translations.generateMenu || 'Generated Menu Plan'}</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{translations.error || 'Error'}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{translations.generateNewMenu || 'Generate a New Menu Plan'}</CardTitle>
          <CardDescription>
            {translations.generateMenuDescription || 'Click the button below to generate a personalized menu plan based on your preferences.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-6">
          <Button
            onClick={fetchMenu}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? <Loader className="animate-spin h-4 w-4 mr-2" /> : null}
            {loading ? (translations.generating || 'Generating...') : (translations.generateMenu || 'Generate Menu')}
          </Button>
        </CardContent>
      </Card>

     

      {/* Save Button (not in PDF) */}
      {menu && menu.meals && menu.meals.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={handleSaveMenu}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700"
          >
            {saving ? (
              <Loader className="animate-spin h-4 w-4 mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? (translations.saving || 'Saving...') : (translations.saveMenu || 'Save Menu')}
          </Button>
        </div>
      )}
    </div>
  );
};




async function translateMenu(menu, targetLang = 'he') {
  const response = await fetch('http://localhost:5000/api/translate-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu, targetLang }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to parse error from server.' }));
    console.error("Translation API error:", errorData);
    throw new Error(errorData.error || 'Translation request failed');
  }
  
  const translatedMenu = await response.json();
  return translatedMenu;


  
  
}

export default MenuCreate;

