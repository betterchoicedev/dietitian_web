import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader, Save, Clock, Utensils, CalendarRange, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from '@/api/entities';
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";
import { useLanguage } from '@/contexts/LanguageContext';
import { EventBus } from '@/utils/EventBus';
import ReactToPdf from 'react-to-pdf';
import { supabase } from '@/lib/supabase';

// https://dietitian-web-backend.onrender.com

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

  const handleChange = (e) => {
    setEditValue(e.target.value);
  };

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

  const handleBlur = () => {
    handleSubmit();
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
      onChange={handleChange}
      onKeyDown={handleKeyPress}
      onBlur={handleBlur}
      className="font-medium text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  );
};

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
      const response = await fetch(`https://dietitian-web.onrender.com/api/suggestions?query=${encodeURIComponent(query)}`);
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
      const response = await fetch(`https://dietitian-web.onrender.com/api/ingredient-nutrition?name=${encodeURIComponent(suggestion.english)}`);
      if (!response.ok) throw new Error('Failed to fetch nutrition data');
      const nutritionData = await response.json();

      const updatedValues = {
        item: suggestion.hebrew || suggestion.english,
        household_measure: suggestion.household_measure || '',
          calories: nutritionData.Energy || 0,
        protein: nutritionData.Protein || 0,
        fat: nutritionData.Total_lipid__fat_ || 0,
        carbs: nutritionData.Carbohydrate || 0,
        'brand of pruduct': nutritionData.brand || ''
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
  
  // Load menu state from localStorage on initialization
  const [menu, setMenu] = useState(() => {
    try {
      const saved = localStorage.getItem('menuCreate_menu');
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.warn('Failed to load menu from localStorage:', err);
      return null;
    }
  });
  
  const [originalMenu, setOriginalMenu] = useState(() => {
    try {
      const saved = localStorage.getItem('menuCreate_originalMenu');
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.warn('Failed to load originalMenu from localStorage:', err);
      return null;
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [enrichingUPC, setEnrichingUPC] = useState(false);
  const [users, setUsers] = useState([]);
  
  const [selectedUser, setSelectedUser] = useState(() => {
    try {
      const saved = localStorage.getItem('menuCreate_selectedUser');
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.warn('Failed to load selectedUser from localStorage:', err);
      return null;
    }
  });
  
  const [loadingUsers, setLoadingUsers] = useState(true);
  const navigate = useNavigate();
  const { language, translations } = useLanguage();
  const [generatingAlt, setGeneratingAlt] = useState({});
  // UPC Cache to avoid duplicate lookups - persistent across sessions
  const [upcCache, setUpcCache] = useState(() => {
    try {
      const saved = localStorage.getItem('upc_cache');
      return saved ? new Map(JSON.parse(saved)) : new Map();
    } catch (err) {
      console.warn('Failed to load UPC cache from localStorage:', err);
      return new Map();
    }
  });

  // Save cache to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('upc_cache', JSON.stringify([...upcCache]));
    } catch (err) {
      console.warn('Failed to save UPC cache to localStorage:', err);
    }
  }, [upcCache]);

  // Save menu state to localStorage whenever it changes
  useEffect(() => {
    try {
      if (menu) {
        const menuWithTimestamp = {
          ...menu,
          _savedAt: new Date().toISOString(),
          _selectedUser: selectedUser
        };
        localStorage.setItem('menuCreate_menu', JSON.stringify(menuWithTimestamp));
      } else {
        localStorage.removeItem('menuCreate_menu');
      }
    } catch (err) {
      console.warn('Failed to save menu to localStorage:', err);
    }
  }, [menu, selectedUser]);

  // Save originalMenu state to localStorage whenever it changes
  useEffect(() => {
    try {
      if (originalMenu) {
        localStorage.setItem('menuCreate_originalMenu', JSON.stringify(originalMenu));
      } else {
        localStorage.removeItem('menuCreate_originalMenu');
      }
    } catch (err) {
      console.warn('Failed to save originalMenu to localStorage:', err);
    }
  }, [originalMenu]);

  // Save selectedUser state to localStorage whenever it changes
  useEffect(() => {
    try {
      if (selectedUser) {
        localStorage.setItem('menuCreate_selectedUser', JSON.stringify(selectedUser));
      } else {
        localStorage.removeItem('menuCreate_selectedUser');
      }
    } catch (err) {
      console.warn('Failed to save selectedUser to localStorage:', err);
    }
  }, [selectedUser]);




  async function downloadPdf(menu) {
    const response = await fetch('https://dietitian-web-backend.onrender.com/api/menu-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu })
    });
    const blob = await response.blob();
    // Create a link to download
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meal_plan.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }


  function calculateMainTotals(menu) {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalFat = 0;
    let totalCarbs = 0;
  
    if (!menu.meals) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
  
    menu.meals.forEach(meal => {
      const nutrition = meal?.main?.nutrition || {};
      totalCalories += Number(nutrition.calories) || 0;
      // Handle both string (like "25g") and number formats
      totalProtein += typeof nutrition.protein === 'string' 
        ? parseFloat(nutrition.protein) || 0 
        : Number(nutrition.protein) || 0;
      totalFat += typeof nutrition.fat === 'string' 
        ? parseFloat(nutrition.fat) || 0 
        : Number(nutrition.fat) || 0;
      totalCarbs += typeof nutrition.carbs === 'string' 
        ? parseFloat(nutrition.carbs) || 0 
        : Number(nutrition.carbs) || 0;
    });
  
    return {
      calories: Math.round(totalCalories),
      protein: Math.round(totalProtein),
      fat: Math.round(totalFat),
      carbs: Math.round(totalCarbs),
    };
  }
  
  const handleTitleChange = (newTitle, mealIndex, optionIndex) => {
    setMenu(prevMenu => {
      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));
      const meal = updatedMenu.meals[mealIndex];
      const option = optionIndex === 'main' ? meal.main : meal.alternative;
      
      option.meal_title = newTitle;
      
      return updatedMenu;
    });

    // Also update the original menu for consistency
    setOriginalMenu(prevOriginal => {
      if (!prevOriginal) return prevOriginal;
      
      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));
      const meal = updatedOriginal.meals[mealIndex];
      const option = optionIndex === 'main' ? meal.main : meal.alternative;
      
      option.meal_title = newTitle;
      
      return updatedOriginal;
    });
  };
  
  const handleIngredientChange = (newValues, mealIndex, optionIndex, ingredientIndex) => {
    setMenu(prevMenu => {
      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));
      const meal = updatedMenu.meals[mealIndex];
      const option = optionIndex === 'main' ? meal.main : meal.alternative;

      // Update the specific ingredient
      option.ingredients[ingredientIndex] = newValues;

      // Update meal name with a concise, appealing name (not listing every ingredient)
      const baseName = option.meal_title ? option.meal_title.split(' with ')[0] : meal.meal;
      // Keep the original meal name without listing all ingredients
      option.meal_title = baseName;

      // Recalculate nutrition totals from all ingredients
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
      updatedMenu.totals = calculateMainTotals(updatedMenu);
      
      return updatedMenu;
    });

    // Also update the original menu for consistency
    setOriginalMenu(prevOriginal => {
      if (!prevOriginal) return prevOriginal;
      
      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));
      const meal = updatedOriginal.meals[mealIndex];
      const option = optionIndex === 'main' ? meal.main : meal.alternative;

      option.ingredients[ingredientIndex] = newValues;

      const baseName = option.meal_title ? option.meal_title.split(' with ')[0] : meal.meal;
      option.meal_title = baseName;

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

      updatedOriginal.totals = calculateMainTotals(updatedOriginal);
      
      return updatedOriginal;
    });
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      console.log('🔍 Fetching users from chat_users table...');
      
      const { data, error } = await supabase
        .from('chat_users')
        .select('user_code, full_name')
        .order('full_name');
      
      if (error) {
        console.error('❌ Error fetching users:', error);
        setError('Failed to load users: ' + error.message);
        return;
      }
      
      console.log('✅ Fetched users:', data);
      setUsers(data || []);
      
    } catch (err) {
      console.error('❌ Error in fetchUsers:', err);
      setError('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const enrichMenuWithUPC = async (menuToEnrich) => {
    try {
      setEnrichingUPC(true);
      setProgress(90);
      setProgressStep('🛒 Collecting all ingredients...');

      // Step 1: Collect all unique ingredients across the menu
      const allIngredients = new Map(); // Use brand+name as key to avoid duplicates
      const ingredientPositions = []; // Track where each ingredient is used
      let cacheHits = 0;
      let totalIngredients = 0;

      menuToEnrich.meals.forEach((meal, mealIndex) => {
        ['main', 'alternative'].forEach(section => {
          if (meal[section]?.ingredients) {
            meal[section].ingredients.forEach((ingredient, ingredientIndex) => {
              const brand = ingredient['brand of pruduct'] || ingredient.brand || '';
              const name = ingredient.item || '';
              const key = `${brand}|${name}`.toLowerCase();
              totalIngredients++;
              
              // Check cache first
              if (upcCache.has(key)) {
                ingredient.UPC = upcCache.get(key);
                cacheHits++;
                return;
              }

              if (!allIngredients.has(key)) {
                allIngredients.set(key, { brand, name, upc: null });
              }
              
              // Track position for later update
              ingredientPositions.push({
                key,
                mealIndex,
                section,
                ingredientIndex,
                ingredient
              });
            });
          }
        });
      });

      const uniqueIngredients = Array.from(allIngredients.values());
      const cacheHitRate = totalIngredients > 0 ? Math.round((cacheHits / totalIngredients) * 100) : 0;
      
      if (uniqueIngredients.length === 0) {
        setProgress(100);
        setProgressStep(`✅ All ${totalIngredients} ingredients found in cache (${cacheHitRate}% cache hit rate)`);
        return menuToEnrich;
      }

      setProgress(92);
      setProgressStep(`🔍 Looking up ${uniqueIngredients.length} new ingredients (${cacheHits} found in cache, ${cacheHitRate}% hit rate)...`);

      // Step 2: Batch UPC lookup for all ingredients
      const batchResponse = await fetch("https://dietitian-web-backend.onrender.com/api/batch-upc-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: uniqueIngredients }),
      });

      if (!batchResponse.ok) {
        console.error("Batch UPC lookup failed, falling back to individual lookups");
        // Fallback to individual lookups if batch fails
        return await enrichMenuWithUPCFallback(menuToEnrich);
      }

      const batchData = await batchResponse.json();
      
      setProgress(96);
      setProgressStep('📋 Updating menu with product codes...');

      // Step 3: Update cache with new UPC codes
      const newCacheEntries = new Map(upcCache);
      batchData.results.forEach(result => {
        const key = `${result.brand}|${result.name}`.toLowerCase();
        newCacheEntries.set(key, result.upc);
      });
      setUpcCache(newCacheEntries);

      // Step 4: Apply UPC codes to all ingredient positions
      const enrichedMenu = JSON.parse(JSON.stringify(menuToEnrich));
      ingredientPositions.forEach(pos => {
        const upc = newCacheEntries.get(pos.key);
        enrichedMenu.meals[pos.mealIndex][pos.section].ingredients[pos.ingredientIndex].UPC = upc;
      });

      const finalCacheHitRate = totalIngredients > 0 ? Math.round((cacheHits / totalIngredients) * 100) : 0;
      const successfulLookups = batchData.summary?.successful || 0;
      
      setProgress(99);
      setProgressStep(`✅ Product codes added! ${successfulLookups} new codes found, ${finalCacheHitRate}% cache efficiency`);

      return enrichedMenu;

    } catch (err) {
      console.error("Error in streamlined UPC enrichment:", err);
      // Fallback to original method if streamlined fails
      return await enrichMenuWithUPCFallback(menuToEnrich);
    } finally {
      setEnrichingUPC(false);
    }
  };

  // Fallback to original method if optimized version fails
  const enrichMenuWithUPCFallback = async (menuToEnrich) => {
    try {
      setProgressStep('🔄 Using fallback UPC lookup...');
      
      const enrichRes = await fetch("https://dietitian-web-backend.onrender.com/api/enrich-menu-with-upc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu: menuToEnrich.meals }),
      });
      
      const enrichData = await enrichRes.json();
      if (enrichData.error) {
        console.error("UPC enrichment failed:", enrichData.error);
        return menuToEnrich;
      }
      
      return {
        ...menuToEnrich,
        meals: enrichData.menu
      };
    } catch (err) {
      console.error("Fallback UPC enrichment also failed:", err);
      return menuToEnrich;
    }
  };

  // Clear saved menu state when starting fresh
  const clearSavedMenuState = () => {
    try {
      localStorage.removeItem('menuCreate_menu');
      localStorage.removeItem('menuCreate_originalMenu');
      setMenu(null);
      setOriginalMenu(null);
    } catch (err) {
      console.warn('Failed to clear saved menu state:', err);
    }
  };

  const fetchMenu = async () => {
    if (!selectedUser) {
      setError('Please select a client before generating a menu.');
      return;
    }

    try {
      // Clear previous menu data when generating new menu
      clearSavedMenuState();
      
      setLoading(true);
      setError(null);
      setProgress(0);
      setProgressStep('Initializing...');

      console.log('🧠 Generating menu for user:', selectedUser.user_code);

      // Step 1: Get meal template (25% progress)
      setProgress(5);
      setProgressStep('🎯 Analyzing client preferences...');
      
      const templateRes = await fetch("https://dietitian-web-backend.onrender.com/api/template", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: selectedUser.user_code })
      });
      const templateData = await templateRes.json();
      if (templateData.error || !templateData.template) throw new Error("Template generation failed");
      const template = templateData.template;

      setProgress(25);
      setProgressStep('✅ Client analysis complete!');

      // Step 2: Build menu (50% progress)
      setProgress(30);
      setProgressStep('🍽️ Creating personalized meals...');
      
      const buildRes = await fetch("https://dietitian-web-backend.onrender.com/api/build-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, user_code: selectedUser.user_code }),
      });
      const buildData = await buildRes.json();
      if (buildData.error || !buildData.menu) throw new Error("Menu build failed");

      setProgress(60);
      setProgressStep('🔢 Calculating nutrition values...');

      const menuData = {
        meals: buildData.menu,
        totals: calculateMainTotals({ meals: buildData.menu }),
        note: buildData.note || ''
      };

      // Set the original English menu data ONCE. This is our source of truth.
      setOriginalMenu(menuData);

      setProgress(70);
      setProgressStep('🌐 Preparing menu display...');

      // Display the correct version based on the initial language
      if (language === 'he') {
        setProgressStep('🌐 Translating to Hebrew...');
        const translatedMenu = await translateMenu(menuData, 'he');
        setMenu(translatedMenu);
        setProgress(85);
      } else {
        setMenu(menuData); // Already in English
        setProgress(85);
        console.log(menuData);
      }

      // Step 3: Synchronously enrich with UPC codes (now with progress tracking)
      setProgress(90);
      setProgressStep('🛒 Adding product codes...');

      const enrichedMenu = await enrichMenuWithUPC(menuData);
        setOriginalMenu(enrichedMenu);
        
        // Update displayed menu as well
        if (language === 'he') {
        setProgressStep('🌐 Finalizing Hebrew translation...');
        const translatedEnriched = await translateMenu(enrichedMenu, 'he');
            setMenu(translatedEnriched);
        } else {
          setMenu(enrichedMenu);
        }

      setProgress(100);
      setProgressStep('🎉 Menu ready!');

      // Clear progress after a short delay to show completion
      setTimeout(() => {
        setProgress(0);
        setProgressStep('');
      }, 1500);

    } catch (err) {
      console.error("Error generating menu:", err);
      setError(err.message || "Something went wrong");
      setProgress(0);
      setProgressStep('');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    console.log('🔥 SAVE BUTTON CLICKED!');
    console.log('📋 Original Menu:', originalMenu);
    
    // Save both schema and meal plan from the same menu
    if (!originalMenu) {
      console.error('❌ No originalMenu found!');
      return;
    }

    try {
      console.log('⏳ Starting save process...');
      setSaving(true);
      setError(null);
      
      // Get the current authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('❌ Authentication error:', authError);
        setError('You must be logged in to save menus');
        return;
      }
      
      console.log('👤 Authenticated user:', user.id);
      
      console.log('📊 Original Menu structure:', {
        meals: originalMenu.meals?.length,
        totals: originalMenu.totals,
        hasNote: !!originalMenu.note
      });
      
      // Create schema template (like your example format)
      const schemaTemplate = {
        template: originalMenu.meals?.map(meal => {
          console.log('🍽️ Processing meal:', meal.meal);
          console.log('Main nutrition:', meal.main?.nutrition);
          console.log('Alt nutrition:', meal.alternative?.nutrition);
          
          return {
            meal: meal.meal,
            main: {
              name: meal.main?.meal_title || meal.main?.name,
              calories: meal.main?.nutrition?.calories || 0,
              protein: parseFloat(meal.main?.nutrition?.protein) || 0,
              fat: parseFloat(meal.main?.nutrition?.fat) || 0,
              carbs: parseFloat(meal.main?.nutrition?.carbs) || 0,
              main_protein_source: meal.main?.main_protein_source || "Unknown"
            },
            alternative: {
              name: meal.alternative?.meal_title || meal.alternative?.name,
              calories: meal.alternative?.nutrition?.calories || 0,
              protein: parseFloat(meal.alternative?.nutrition?.protein) || 0,
              fat: parseFloat(meal.alternative?.nutrition?.fat) || 0,
              carbs: parseFloat(meal.alternative?.nutrition?.carbs) || 0,
              main_protein_source: meal.alternative?.main_protein_source || "Unknown"
            }
          };
        }) || []
      };

      console.log('📋 Schema template created:', JSON.stringify(schemaTemplate, null, 2));

      // Save both schema AND meal plan in the SAME record
      console.log('💾 Saving combined schema + meal plan...');
      const combinedPayload = {
        record_type: 'meal_plan',
        meal_plan_name: `Meal Plan - ${selectedUser?.full_name || 'Unknown Client'}`,
        schema: schemaTemplate,        // Schema template in same row
        meal_plan: originalMenu,       // Full meal plan in same row
        status: 'draft',
        daily_total_calories: originalMenu.totals?.calories || 2000,
        macros_target: {
          protein: originalMenu.totals?.protein || 150,
          carbs: originalMenu.totals?.carbs || 250,
          fat: originalMenu.totals?.fat || 80,
        },
        recommendations: {},
        dietary_restrictions: {},
        user_code: selectedUser?.user_code || null, // Use selected user's code
        dietitian_id: user.id
      };
      
      console.log('📤 Combined payload:', JSON.stringify(combinedPayload, null, 2));
      
      const result = await Menu.create(combinedPayload);
      console.log('✅ Combined schema + menu saved successfully:', result);
      
      // Show success message
      setError(null);
      console.log('🎉 Schema and menu plan saved in single record!');
      alert('Schema and menu plan saved successfully!');
      
      // Clear saved state since it's now permanently saved
      clearSavedMenuState();
      
    } catch (err) {
      console.error('❌ Error during save process:', err);
      console.error('❌ Error stack:', err.stack);
      console.error('❌ Error message:', err.message);
      setError(err.message || 'Failed to save menu and schema');
    } finally {
      console.log('🏁 Save process completed, setting saving to false');
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
                            {Math.round(ingredient.calories || 0)} c
                          </span>
                          <span className="text-blue-600 font-medium">
                            {Math.round(ingredient.protein || 0)}g p
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
  

  async function generateAlternativeMeal(main, alternative) {
    const response = await fetch('https://dietitian-web-backend.onrender.com/api/generate-alternative-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        main, 
        alternative,
        user_code: selectedUser?.user_code 
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
      setMenu((prevMenu) => {
        const meal = prevMenu.meals[mealIdx];
        if (!meal || !meal.main || !meal.alternative) return prevMenu;
        return prevMenu;
      });
      const meal = menu.meals[mealIdx];
      const newAlt = await generateAlternativeMeal(meal.main, meal.alternative);
      setMenu((prevMenu) => {
        const updated = { ...prevMenu };
        if (!updated.meals[mealIdx].alternatives) updated.meals[mealIdx].alternatives = [];
        updated.meals[mealIdx].alternatives.push(newAlt);
        return { ...updated };
      });
    } catch (err) {
      alert(err.message || 'Failed to generate alternative meal');
    } finally {
      setGeneratingAlt((prev) => ({ ...prev, [mealIdx]: false }));
    }
  };

  // Helper for base ingredient extraction
  function extractBaseIngredient(item) {
    let str = item || '';
    // Remove anything in parentheses
    str = str.replace(/\([^)]*\)/g, "");
    // Remove descriptors like 'Low-fat', 'Non-fat', 'as sauce', etc.
    str = str.replace(/\b(low-fat|non-fat|as sauce|raw|sliced|fresh|cooked|steamed|roasted|grilled|baked|boiled|diced|chopped|shredded|whole|plain|unsweetened|sweetened|reduced-fat|skim|full-fat|fat-free|light|reduced sodium|no salt added|organic|large|small|medium)\b/gi, "");
    return str.trim().replace(/\s+/g, ' ');
  }

  // Helper for preparation extraction
  function extractPreparation(item) {
    let notes = [];
    // Parentheses content
    const paren = (item.match(/\(([^)]*)\)/) || [])[1];
    if (paren) notes.push(paren.trim());
    // Descriptors
    const desc = (item.match(/\b(low-fat|non-fat|as sauce|raw|sliced|fresh|cooked|steamed|roasted|grilled|baked|boiled|diced|chopped|shredded|whole|plain|unsweetened|sweetened|reduced-fat|skim|full-fat|fat-free|light|reduced sodium|no salt added|organic|large|small|medium)\b/gi) || []);
    notes = notes.concat(desc.map(d => d.trim()));
    return notes;
  }

  function generateShoppingList(menu) {
    if (!menu || !menu.meals) return [];
    const itemsMap = {};
    menu.meals.forEach(meal => {
      const options = [meal.main, meal.alternative, ...(meal.alternatives || [])];
      options.forEach(option => {
        if (option && option.ingredients) {
          option.ingredients.forEach(ing => {
            const base = extractBaseIngredient(ing.item).toLowerCase();
            const prep = extractPreparation(ing.item);
            const key = `${base}__${ing.household_measure}`;
            if (!itemsMap[key]) {
              itemsMap[key] = {
                base: extractBaseIngredient(ing.item),
                household_measure: ing.household_measure || '',
                preparations: prep.length ? [...new Set(prep)] : [],
              };
            } else {
              // Merge preparations if duplicate
              itemsMap[key].preparations = Array.from(new Set([...itemsMap[key].preparations, ...prep]));
            }
          });
        }
      });
    });
    // Sort alphabetically for a clean look
    return Object.values(itemsMap).sort((a, b) => a.base.localeCompare(b.base));
  }

  // Fetch users when component loads
  useEffect(() => {
    fetchUsers();
  }, []);

  // Whenever menu changes, update shopping list
  useEffect(() => {
    if (menu) {
      setShoppingList(generateShoppingList(menu));
    }
  }, [menu]);

  // Water Bar Loading Component with Real Progress
  const WaterBarLoading = () => {
    // Define the animations as a style object
    const animationStyles = `
      @keyframes waterWave {
        0%, 100% { transform: translateX(-100%); }
        50% { transform: translateX(100%); }
      }
      
      @keyframes waterWave1 {
        0%, 100% { transform: translateX(-100%) rotate(0deg); }
        50% { transform: translateX(100%) rotate(180deg); }
      }
      
      @keyframes waterWave2 {
        0%, 100% { transform: translateX(100%) rotate(180deg); }
        50% { transform: translateX(-100%) rotate(0deg); }
      }
      
      @keyframes waterBubble {
        0% { 
          transform: translateY(100%);
          opacity: 0;
        }
        10% {
          opacity: 1;
        }
        90% {
          opacity: 1;
        }
        100% { 
          transform: translateY(-100%);
          opacity: 0;
        }
      }
    `;

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
        <div className="w-full max-w-md mx-auto mt-6">
          <div className="text-center mb-4">
            <h3 className="text-lg font-semibold text-blue-600">
              {progressStep || translations.generating || 'Generating your menu...'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {Math.round(progress)}% Complete
            </p>
          </div>
          
          <div className="relative w-full h-16 bg-blue-100 rounded-lg overflow-hidden border-2 border-blue-200">
            {/* Water fill based on actual progress */}
            <div 
              className="absolute bottom-0 left-0 h-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 transition-all duration-500 ease-out"
              style={{
                width: `${progress}%`
              }}
            >
              {/* Water waves only on top of filled area */}
              <div className="absolute top-0 left-0 w-full h-2 overflow-hidden">
                <div 
                  className="absolute top-0 w-full h-4 bg-blue-300 opacity-50"
                  style={{
                    borderRadius: '50%',
                    animation: 'waterWave1 3s ease-in-out infinite'
                  }}
                />
                <div 
                  className="absolute top-0 w-full h-4 bg-blue-200 opacity-30"
                  style={{
                    borderRadius: '50%',
                    animation: 'waterWave2 3s ease-in-out infinite 0.5s'
                  }}
                />
              </div>
              
              {/* Floating bubbles only in filled area */}
              {progress > 20 && (
                <div className="absolute inset-0">
                  <div 
                    className="absolute w-2 h-2 bg-white rounded-full opacity-60"
                    style={{
                      left: '20%',
                      animation: 'waterBubble 4s ease-in-out infinite'
                    }}
                  />
                  {progress > 50 && (
                    <div 
                      className="absolute w-1.5 h-1.5 bg-white rounded-full opacity-40"
                      style={{
                        left: '60%',
                        animation: 'waterBubble 3s ease-in-out infinite 1s'
                      }}
                    />
                  )}
                  {progress > 80 && (
                    <div 
                      className="absolute w-1 h-1 bg-white rounded-full opacity-50"
                      style={{
                        left: '80%',
                        animation: 'waterBubble 5s ease-in-out infinite 2s'
                      }}
                    />
                  )}
                </div>
              )}
              
              {/* Shimmer effect on water surface */}
              <div 
                className="absolute top-0 left-0 w-full h-full opacity-40"
                style={{
                  background: `linear-gradient(90deg, 
                    transparent 0%, 
                    rgba(255,255,255,0.6) 50%, 
                    transparent 100%)`,
                  animation: 'waterWave 2s ease-in-out infinite'
                }}
              />
            </div>
            
            {/* Percentage text overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-blue-700 font-bold text-lg drop-shadow-lg">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
          
          {/* Progress step indicator */}
          <div className="mt-4 flex justify-center">
            <div className="text-xs text-gray-600 text-center">
              {progressStep && (
                <div className="flex items-center justify-center space-x-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>{progressStep}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {translations.generateMenu || 'Generate Menu Plan'}
            </h1>
          </div>
        </div>
        
        {/* Clear menu button when menu exists */}
        {menu && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:bg-red-50 border-red-300"
            onClick={() => {
              if (window.confirm('Are you sure you want to clear the current menu and start fresh? This action cannot be undone.')) {
                clearSavedMenuState();
                setError(null);
              }
            }}
          >
            Start Fresh
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{translations.error || 'Error'}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Saved Menu Restoration */}
      {!menu && !loading && (() => {
        try {
          const savedMenu = localStorage.getItem('menuCreate_menu');
          if (!savedMenu) return false;
          const parsed = JSON.parse(savedMenu);
          const savedAt = parsed._savedAt ? new Date(parsed._savedAt).toLocaleString() : 'Unknown time';
          const savedUser = parsed._selectedUser?.full_name || 'Unknown client';
          
          return (
            <Alert className="border-blue-200 bg-blue-50">
              <Clock className="h-4 w-4" />
              <AlertTitle className="text-blue-800">Previous Menu Found</AlertTitle>
              <AlertDescription className="text-blue-700">
                We found a previously generated menu for <strong>{savedUser}</strong> from <strong>{savedAt}</strong>. 
                Would you like to continue working on it or start fresh?
                <div className="flex gap-3 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white hover:bg-blue-100 border-blue-300 text-blue-700"
                    onClick={() => {
                      // Restore from localStorage - menu state is already loaded in useState
                      // We just need to trigger a re-render by setting loading briefly
                      setLoading(true);
                      setTimeout(() => setLoading(false), 100);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Continue Previous Menu
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hover:bg-red-50 border-red-300 text-red-700"
                    onClick={() => {
                      clearSavedMenuState();
                      setError(null);
                    }}
                  >
                    Start Fresh
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          );
        } catch (err) {
          return false;
        }
      })()}

      {/* User Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
          <CardDescription>
            Choose which client to generate a menu for
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader className="animate-spin h-4 w-4" />
              Loading clients...
            </div>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedUser?.user_code || ''}
                onChange={(e) => {
                  const userCode = e.target.value;
                  const user = users.find(u => u.user_code === userCode);
                  setSelectedUser(user);
                }}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Choose a client...</option>
                {users.map((user) => (
                  <option key={user.user_code} value={user.user_code}>
                    {user.full_name} ({user.user_code})
                  </option>
                ))}
              </select>
              {selectedUser && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                                     <div className="flex items-center gap-2 text-sm text-green-700">
                     <span>✓</span>
                     <span className="font-medium">Selected: {selectedUser.full_name}</span>
                     <span className="text-green-600">({selectedUser.user_code})</span>
                   </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
            disabled={loading || !selectedUser}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? (translations.generating || 'Generating...') : (translations.generateMenu || 'Generate Menu')}
          </Button>
          
          {/* Water Bar Loading Animation */}
          {loading && <WaterBarLoading />}
        </CardContent>
      </Card>

      {menu && menu.meals && menu.meals.length > 0 && (
        <>
          {enrichingUPC && (
            <Card className="bg-blue-50/30 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Loader className="animate-spin h-5 w-5 text-blue-600" />
                  <span className="text-blue-700">Adding product codes to ingredients...</span>
                </div>
              </CardContent>
            </Card>
          )}
          
          {menu.totals && (
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
                      {menu.totals.calories}
                      <span className="text-sm font-normal text-green-600 ml-1">kcal</span>
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg shadow-sm">
                    <p className="text-sm text-blue-600 font-medium">{translations.protein || 'Protein'}</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {menu.totals.protein}
                      <span className="text-sm font-normal text-blue-600 ml-1">g</span>
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg shadow-sm">
                    <p className="text-sm text-amber-600 font-medium">{translations.fat || 'Fat'}</p>
                    <p className="text-2xl font-bold text-amber-700">
                      {menu.totals.fat}
                      <span className="text-sm font-normal text-amber-600 ml-1">g</span>
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg shadow-sm">
                    <p className="text-sm text-orange-600 font-medium">{translations.carbs || 'Carbs'}</p>
                    <p className="text-2xl font-bold text-orange-700">
                      {menu.totals.carbs}
                      <span className="text-sm font-normal text-orange-600 ml-1">g</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="space-y-6">
            {menu.meals.map((meal, mealIdx) => (
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
                            {translations.alternative || 'Alternative'}
                          </Badge>
                        </div>
                        {renderMealOption({ ...meal.alternative, mealIndex: mealIdx }, true)}
                      </div>
                    )}

                    {/* Render additional alternatives if present */}
                    {meal.alternatives && meal.alternatives.length > 0 && (
                      <div className="mt-4">
                        <div className="font-semibold mb-2 text-blue-700">Other Alternatives:</div>
                        <div className="space-y-4">
                          {meal.alternatives.map((alt, altIdx) => (
                            <div key={altIdx} className="bg-blue-50 rounded-lg p-3">
                              {renderMealOption({ ...alt, mealIndex: mealIdx }, true)}
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
                        {generatingAlt[mealIdx] ? 'Generating...' : 'Add Alternative'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
  <Button onClick={() => downloadPdf(menu)}>Download as PDF</Button>

      {/* Save Button and Cache Management (not in PDF) */}
      {menu && menu.meals && menu.meals.length > 0 && (
        <div className="flex justify-between items-center">
          {/* Cache Statistics and Auto-save indicator */}
          <div className="text-sm text-gray-600 space-y-1">
            <div>
              <span className="font-medium">UPC Cache:</span> {upcCache.size} ingredients stored
              {upcCache.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUpcCache(new Map());
                    localStorage.removeItem('upc_cache');
                    alert('UPC cache cleared successfully!');
                  }}
                  className="ml-3 text-xs"
                >
                  Clear Cache
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
              <span className="text-xs text-green-600">Menu auto-saved locally</span>
            </div>
          </div>
          
          {/* Save Button */}
          <Button
            onClick={() => {
              console.log('🖱️ Save button clicked!');
              if (!selectedUser) {
                alert('Please select a client before saving the menu.');
                return;
              }
              handleSave();
            }}
            disabled={saving || !selectedUser}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
          >
            {saving ? (
              <Loader className="animate-spin h-4 w-4 mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? (translations.saving || 'Saving...') : 'Save Schema & Menu Plan'}
          </Button>
        </div>
      )}

      {/* Shopping List Button */}
      {menu && menu.meals && menu.meals.length > 0 && (
        <div className="flex justify-end mb-2">
          <Button
            variant="outline"
            className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border-yellow-300 shadow-sm font-semibold"
            onClick={() => setShowShoppingList((prev) => !prev)}
          >
            {showShoppingList ? 'Hide Shopping List' : '🛒 Show Shopping List'}
          </Button>
        </div>
      )}

      {/* Shopping List Section */}
      {showShoppingList && shoppingList.length > 0 && (
        <Card className="mb-4 border-yellow-400 bg-gradient-to-br from-yellow-50 to-orange-100 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-orange-700 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
                <span role="img" aria-label="cart">🛒</span> Shopping List
              </CardTitle>
              <CardDescription className="text-orange-600 font-medium">All ingredients needed for this menu, beautifully organized</CardDescription>
            </div>
            <Button
              variant="outline"
              className="border-orange-400 text-orange-700 hover:bg-orange-100 font-semibold"
              onClick={() => window.print()}
            >
              🖨️ Print
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-orange-200">
              <table className="min-w-full divide-y divide-orange-200">
                <thead className="bg-orange-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-extrabold text-orange-700 uppercase tracking-wider">Ingredient</th>
                    <th className="px-4 py-3 text-left text-xs font-extrabold text-orange-700 uppercase tracking-wider">Household Measure</th>
                    <th className="px-4 py-3 text-left text-xs font-extrabold text-orange-700 uppercase tracking-wider">Preparations</th>
                  </tr>
                </thead>
                <tbody>
                  {shoppingList.map((item, idx) => (
                    <tr
                      key={idx}
                      className={
                        `transition-all ${idx % 2 === 0 ? 'bg-yellow-50' : 'bg-orange-50'} hover:bg-orange-200/60`
                      }
                    >
                      <td className="px-4 py-3 font-semibold text-orange-900 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-orange-400 rounded-full"></span>
                        {item.base}
                      </td>
                      <td className="px-4 py-3 text-orange-800 font-bold">{item.household_measure}</td>
                      <td className="px-4 py-3">
                        {item.preparations.length > 0
                          ? item.preparations.join(', ')
                          : <span className="text-xs text-orange-300">—</span>}
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
  );
};




async function translateMenu(menu, targetLang = 'he') {
  const response = await fetch('https://dietitian-web-backend.onrender.com/api/translate', {
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


export default MenuCreate;

