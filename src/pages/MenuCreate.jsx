import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader, Save, Clock, Utensils, CalendarRange, ArrowRight, RefreshCw, Plus, ArrowUp, ArrowDown, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from '@/api/entities';
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { EventBus } from '@/utils/EventBus';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { supabase } from '@/lib/supabase';

// https://dietitian-web-backend.onrender.com

// Translation caching system to save AI tokens
const CACHE_PREFIX = 'menu_translations';
const CACHE_EXPIRY_DAYS = 30;

// Function to create cache key for menu translations
const createMenuCacheKey = (menu, targetLang) => {
  try {
    // Create a hash of the menu content for consistent caching
    const menuContent = JSON.stringify({
      meals: menu.meals?.map(meal => ({
        main: meal.main?.ingredients?.map(ing => ing.item).filter(Boolean),
        alternative: meal.alternative?.ingredients?.map(ing => ing.item).filter(Boolean),
        alternatives: meal.alternatives?.map(alt => alt.ingredients?.map(ing => ing.item).filter(Boolean))
      }))
    });
    return `${CACHE_PREFIX}_${targetLang}_${btoa(menuContent).slice(0, 50)}`;
  } catch (error) {
    console.warn('Failed to create cache key:', error);
    return `${CACHE_PREFIX}_${targetLang}_${Date.now()}`;
  }
};

// Function to create cache key for text translations
const createTextCacheKey = (text, targetLang) => {
  try {
    return `${CACHE_PREFIX}_text_${targetLang}_${btoa(text).slice(0, 30)}`;
  } catch (error) {
    console.warn('Failed to create text cache key:', error);
    return `${CACHE_PREFIX}_text_${targetLang}_${Date.now()}`;
  }
};

// Function to get cached translation
const getCachedTranslation = (cacheKey) => {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    const now = Date.now();
    const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    // Check if cache is expired
    if (parsed._cachedAt && (now - parsed._cachedAt) > maxAge) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return parsed.data;
  } catch (error) {
    console.warn('Failed to read cache:', error);
    localStorage.removeItem(cacheKey);
    return null;
  }
};

// Function to cache translation
const cacheTranslation = (cacheKey, data) => {
  try {
    const cacheData = {
      data: data,
      _cachedAt: Date.now(),
      _version: '1.0'
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log('💾 Cached translation:', cacheKey);
  } catch (error) {
    console.warn('Failed to cache translation:', error);
  }
};

// Function to clear expired cache entries
const cleanExpiredCache = () => {
  try {
    const now = Date.now();
    const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value);
            if (parsed._cachedAt && (now - parsed._cachedAt) > maxAge) {
              localStorage.removeItem(key);
              cleanedCount++;
            }
          }
        } catch (parseError) {
          localStorage.removeItem(key);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired cache entries`);
    }
    
    return cleanedCount;
  } catch (error) {
    console.error('Failed to clean expired cache:', error);
    return 0;
  }
};

// Clean expired cache on module load
cleanExpiredCache();

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

const EditableIngredient = ({ value, onChange, mealIndex, optionIndex, ingredientIndex, translations, currentIngredient, onPortionDialog, autoFocus }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [originalValue, setOriginalValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestionSelected, setSuggestionSelected] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentQuery, setCurrentQuery] = useState('');
  const inputRef = React.useRef(null);
  const searchTimeoutRef = React.useRef(null);

  useEffect(() => {
    setEditValue(value);
    setOriginalValue(value);
  }, [value]);

  useEffect(() => {
    // Auto-focus if the prop is true
    if (autoFocus && !isEditing) {
      startEditing();
    }
  }, [autoFocus]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const fetchSuggestions = async (query, page = 1, append = false) => {
    if (query.length < 2) {
      setSuggestions([]);
      setHasMore(false);
      return;
    }

    setIsLoading(true);
    try {
      const url = `https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/suggestions?query=${encodeURIComponent(query)}`;
      // const url = `http://localhost:3001/api/suggestions?query=${encodeURIComponent(query)}&page=${page}&limit=10`;
      console.log('🔍 Fetching suggestions from:', url);
      
      const response = await fetch(url);
      console.log('📡 Suggestions response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Suggestions response not OK:', errorText);
        throw new Error(`Failed to fetch suggestions: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📋 Suggestions received:', data);
      
      if (append) {
        setSuggestions(prev => [...prev, ...data.suggestions]);
      } else {
        setSuggestions(data.suggestions);
      }
      
      setHasMore(data.hasMore || false);
      setCurrentPage(page);
      setCurrentQuery(query);
    } catch (error) {
      console.error('❌ Error fetching suggestions:', error);
      if (!append) {
        setSuggestions([]);
        setHasMore(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    console.log('📝 Input changed to:', newValue);
    setEditValue(newValue);
    setShowSuggestions(true);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      console.log('⏰ Timeout triggered, fetching suggestions for:', newValue);
      fetchSuggestions(newValue);
    }, 300);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Escape') {
      console.log('🚪 Escape pressed, canceling edit');
      // Cancel editing and revert to original value
      setEditValue(originalValue);
      setIsEditing(false);
      setShowSuggestions(false);
      setSuggestions([]);
    } else if (e.key === 'Enter') {
      console.log('↵ Enter pressed, saving direct edit');
      // Save the direct edit without selecting a suggestion
      handleDirectEdit();
    }
  };

  const handleBlur = () => {
    console.log('👋 Input blurred');
    // Only revert if no suggestion was selected and no direct edit was made
    if (!suggestionSelected) {
      console.log('👋 No suggestion selected, reverting to original value:', originalValue);
      setEditValue(originalValue);
    }
    setIsEditing(false);
    setShowSuggestions(false);
    setSuggestions([]);
    setSuggestionSelected(false);
  };

  const handleDirectEdit = () => {
    console.log('✏️ Saving direct edit:', editValue);
    // Update only the item name, preserving all existing nutritional values
    const updatedValues = {
      item: editValue,
      household_measure: currentIngredient?.household_measure || '',
      calories: currentIngredient?.calories || 0,
      protein: currentIngredient?.protein || 0,
      fat: currentIngredient?.fat || 0,
      carbs: currentIngredient?.carbs || 0,
      'brand of pruduct': currentIngredient?.['brand of pruduct'] || '',
      UPC: currentIngredient?.UPC || currentIngredient?.gtinUpc || null
    };
    
    onChange(updatedValues, mealIndex, optionIndex, ingredientIndex);
    setSuggestionSelected(true);
    setIsEditing(false);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const loadMore = () => {
    if (hasMore && !isLoading) {
      fetchSuggestions(currentQuery, currentPage + 1, true);
    }
  };

  const handleSelect = async (suggestion) => {
    console.log('🔍 handleSelect called with suggestion:', suggestion);
    try {
      const url = `https://sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-nutrition?name=${encodeURIComponent(suggestion.english)}`;
      // const url = `http://localhost:3001/api/ingredient-nutrition?name=${encodeURIComponent(suggestion.english)}`;
      console.log('🌐 Fetching from URL:', url);
      
      const response = await fetch(url);
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response not OK:', errorText);
        throw new Error(`Failed to fetch nutrition data: ${response.status} ${errorText}`);
      }
      
      const nutritionData = await response.json();
      console.log('📊 Nutrition data received:', nutritionData);
      console.log('🔍 Suggestion data:', suggestion);
      console.log('🔍 UPC values - suggestion.gtinUpc:', suggestion.gtinUpc, 'nutritionData.gtinUpc:', nutritionData.gtinUpc);

      const updatedValues = {
        item: suggestion.hebrew || suggestion.english,
        household_measure: suggestion.household_measure || '',
        calories: nutritionData.Energy || 0,
        protein: nutritionData.Protein || 0,
        fat: nutritionData.Total_lipid__fat_ || 0,
        carbs: nutritionData.Carbohydrate || 0,
        'brand of pruduct': nutritionData.brand || '',
        UPC: suggestion.gtinUpc || nutritionData.gtinUpc || null
      };
      
      console.log('✅ Updated values:', updatedValues);
      console.log('🔍 Final UPC value:', updatedValues.UPC);

      // First update the ingredient with the basic data
      onChange(updatedValues, mealIndex, optionIndex, ingredientIndex);
      setEditValue(suggestion.hebrew || suggestion.english);
      setSuggestionSelected(true);
      setShowSuggestions(false);
      setIsEditing(false);

      // Then trigger the portion dialog
      if (onPortionDialog) {
        onPortionDialog(updatedValues, mealIndex, optionIndex, ingredientIndex);
      }
    } catch (error) {
      console.error('❌ Error in handleSelect:', error);
      console.error('❌ Error stack:', error.stack);
    }
  };

  const startEditing = () => {
    console.log('✏️ Starting edit mode for value:', value);
    setOriginalValue(value); // Store the current value as original
    setEditValue(value);
    setIsEditing(true);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  if (!isEditing) {
    return (
      <div
        onClick={startEditing}
        className="cursor-pointer hover:bg-gray-50 px-2 py-1 rounded text-right border border-transparent hover:border-gray-300"
        dir="rtl"
        title="Click to edit ingredient"
      >
        <div className="flex items-center gap-1">
          <span>{value}</span>
          {currentIngredient && currentIngredient["brand of pruduct"] && (
            <span className="text-xs text-gray-500 font-medium">
              ({currentIngredient["brand of pruduct"]})
            </span>
          )}
        </div>
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
        onKeyDown={handleKeyPress}
        onBlur={handleBlur}
        onFocus={() => {
          console.log('🎯 Input focused, showing suggestions');
          setShowSuggestions(true);
        }}
        className="w-full px-2 py-1 border border-gray-300 rounded text-right"
        dir="rtl"
        autoFocus={autoFocus}
      />

      {isLoading && (
        <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
      )}

            {console.log('🔍 Rendering suggestions:', { showSuggestions, suggestionsCount: suggestions.length, suggestions, isLoading })}
      {showSuggestions && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden animate-fade-in min-w-max max-w-[420px] w-auto" style={{minWidth: 220}}>
          {isLoading ? (
            <div className="px-4 py-3 text-gray-500 text-center">Loading...</div>
          ) : suggestions.length > 0 ? (
            <ul className="py-1 max-h-72 overflow-auto divide-y divide-gray-100">
              <li className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                Click a suggestion to replace with nutritional data, or press Enter to keep current macros
              </li>
              {suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  onMouseDown={e => {
                    e.preventDefault();
                    console.log('🖱️ Suggestion clicked:', suggestion);
                    handleSelect(suggestion);
                  }}
                  className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors duration-150 hover:bg-blue-50 group"
                  style={{ userSelect: 'none' }}
                >
                  {/* Icon or bullet */}
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-400 group-hover:bg-blue-600 transition-colors"></span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 whitespace-normal leading-snug">{suggestion.hebrew || suggestion.english}</span>
                    <span className="text-xs text-gray-500 whitespace-normal leading-snug flex flex-row gap-2 mt-0.5">
                      <span>{(suggestion.protein ?? suggestion.Protein ?? 0)}g {translations?.protein || 'protein'}</span>
                      <span className="text-gray-300">·</span>
                      <span>{(suggestion.calories ?? suggestion.Energy ?? 0)} {translations?.calories || 'kcal'}</span>
                      <span className="text-gray-300">·</span>
                      <span>{(suggestion.fat ?? suggestion.Total_lipid__fat_ ?? 0)}g {translations?.fat || 'fat'}</span>
                      <span className="text-gray-300">·</span>
                      <span>{(suggestion.carbs ?? suggestion.Carbohydrate ?? 0)}g {translations?.carbs || 'carbs'}</span>
                    </span>
                  </div>
                  {suggestion.household_measure && (
                    <span className="ml-2 text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5 whitespace-nowrap">{suggestion.household_measure}</span>
                  )}
                </li>
              ))}
              {hasMore && (
                <li className="border-t border-gray-100">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      loadMore();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    disabled={isLoading}
                    className="w-full px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                        Loading...
                      </>
                    ) : (
                      <>
                        <span>Load More</span>
                        <span className="text-xs text-gray-400">({suggestions.length} shown)</span>
                      </>
                    )}
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <div className="px-4 py-3 text-gray-400 text-center">
              <div>No suggestions found</div>
              <div className="text-xs mt-1">Press Enter to save your edit (keeps current macros)</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const EditableHouseholdMeasure = ({ value, onChange, mealIndex, optionIndex, ingredientIndex, translations }) => {
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
    onChange(editValue, mealIndex, optionIndex, ingredientIndex);
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
      onBlur={handleBlur}
      className="text-gray-600 bg-white border border-gray-300 rounded px-1 py-0.5 text-sm min-w-[80px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      placeholder={translations?.householdMeasurePlaceholder || 'e.g., 1 cup, 2 tbsp'}
    />
  );
};

const IngredientPortionDialog = ({ isOpen, onClose, onConfirm, ingredient, translations }) => {
  const [gramAmount, setGramAmount] = useState('');
  const [householdMeasure, setHouseholdMeasure] = useState('');
  const [adjustedNutrition, setAdjustedNutrition] = useState(null);

  useEffect(() => {
    if (isOpen && ingredient) {
      // Set default values
      setGramAmount(ingredient['portionSI(gram)'] || '');
      setHouseholdMeasure(ingredient.household_measure || '');
      
      // Calculate adjusted nutrition based on current portion
      const currentPortion = parseFloat(ingredient['portionSI(gram)'] || 0);
      const newAmount = currentPortion;
      
      if (currentPortion > 0) {
        // Calculate nutrition per 100g from current values
        const nutritionPer100g = {
          calories: Math.round((ingredient.calories || 0) * 100 / currentPortion),
          protein: Math.round((ingredient.protein || 0) * 100 / currentPortion),
          fat: Math.round((ingredient.fat || 0) * 100 / currentPortion),
          carbs: Math.round((ingredient.carbs || 0) * 100 / currentPortion),
        };
        
        // Apply the ratio for the new amount
        const ratio = newAmount / 100;
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

  const handleGramAmountChange = (e) => {
    const newAmount = e.target.value;
    setGramAmount(newAmount);
    
    if (newAmount && ingredient) {
      const currentPortion = parseFloat(ingredient['portionSI(gram)'] || 0);
      const newAmountNum = parseFloat(newAmount);
      
      if (currentPortion > 0) {
        // Calculate nutrition per 100g from current values
        const nutritionPer100g = {
          calories: Math.round((ingredient.calories || 0) * 100 / currentPortion),
          protein: Math.round((ingredient.protein || 0) * 100 / currentPortion),
          fat: Math.round((ingredient.fat || 0) * 100 / currentPortion),
          carbs: Math.round((ingredient.carbs || 0) * 100 / currentPortion),
        };
        
        // Apply the ratio for the new amount
        const ratio = newAmountNum / 100;
        setAdjustedNutrition({
          calories: Math.round(nutritionPer100g.calories * ratio),
          protein: Math.round(nutritionPer100g.protein * ratio),
          fat: Math.round(nutritionPer100g.fat * ratio),
          carbs: Math.round(nutritionPer100g.carbs * ratio),
        });
      } else {
        // If no current portion, treat existing values as per 100g
        const ratio = newAmountNum / 100;
        setAdjustedNutrition({
          calories: Math.round((ingredient.calories || 0) * ratio),
          protein: Math.round((ingredient.protein || 0) * ratio),
          fat: Math.round((ingredient.fat || 0) * ratio),
          carbs: Math.round((ingredient.carbs || 0) * ratio),
        });
      }
    } else {
      setAdjustedNutrition(null);
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
      calories: adjustedNutrition?.calories || ingredient.calories,
      protein: adjustedNutrition?.protein || ingredient.protein,
      fat: adjustedNutrition?.fat || ingredient.fat,
      carbs: adjustedNutrition?.carbs || ingredient.carbs,
    };
    
    onConfirm(updatedIngredient);
    onClose();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4" dir="rtl">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">
          {translations?.setPortion || 'Set Portion Size'}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {translations?.portionDialogDescription || 'Enter the amount in grams and a household measurement. The nutrition values will be automatically adjusted based on the 100g serving size from the database.'}
        </p>
        
        <div className="space-y-4">
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
            <input
              type="number"
              value={gramAmount}
              onChange={handleGramAmountChange}
              onKeyDown={handleKeyPress}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="100"
              min="0"
              step="0.1"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {translations?.householdMeasure || 'Household Measure'}:
            </label>
            <input
              type="text"
              value={householdMeasure}
              onChange={(e) => setHouseholdMeasure(e.target.value)}
              onKeyDown={handleKeyPress}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={translations?.householdMeasurePlaceholder || 'e.g., 1 cup, 2 tbsp, 1 medium apple'}
            />
          </div>
          
          {adjustedNutrition && (
            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-sm font-medium text-gray-700 mb-2">
                {translations?.adjustedNutrition || 'Adjusted Nutrition'} (per {gramAmount}g):
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">{translations?.calories || 'Calories'}:</span>
                  <span className="font-medium ml-1">{adjustedNutrition.calories}</span>
                </div>
                <div>
                  <span className="text-gray-600">{translations?.protein || 'Protein'}:</span>
                  <span className="font-medium ml-1">{adjustedNutrition.protein}g</span>
                </div>
                <div>
                  <span className="text-gray-600">{translations?.fat || 'Fat'}:</span>
                  <span className="font-medium ml-1">{adjustedNutrition.fat}g</span>
                </div>
                <div>
                  <span className="text-gray-600">{translations?.carbs || 'Carbs'}:</span>
                  <span className="font-medium ml-1">{adjustedNutrition.carbs}g</span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-blue-200">
                <p className="text-xs text-gray-500">
                  {translations?.basedOn100g || 'Based on 100g serving'} • {translations?.ratio || 'Ratio'}: {gramAmount}/100 = {(parseFloat(gramAmount) / 100).toFixed(2)}x
                </p>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            {translations?.cancel || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
          >
            {translations?.confirm || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

const MenuCreate = () => {
  const pdfRef = React.useRef();
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [shoppingList, setShoppingList] = useState([]);
  
  // Track ongoing operations to prevent duplicates
  const ongoingOperations = React.useRef(new Set());
  
  // Undo/Redo system
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isUndoRedoAction, setIsUndoRedoAction] = useState(false);

  // Undo/Redo functions
  const saveToUndoStack = (currentMenu) => {
    if (!isUndoRedoAction) {
      setUndoStack(prev => [...prev, JSON.stringify(currentMenu)]);
      setRedoStack([]); // Clear redo stack when new action is performed
    }
  };

  const undo = () => {
    if (undoStack.length > 0) {
      setIsUndoRedoAction(true);
      const previousState = undoStack[undoStack.length - 1];
      const currentState = JSON.stringify(menu);
      
      setRedoStack(prev => [...prev, currentState]);
      setUndoStack(prev => prev.slice(0, -1));
      setMenu(JSON.parse(previousState));
      setOriginalMenu(JSON.parse(previousState));
      setIsUndoRedoAction(false);
    }
  };

  const redo = () => {
    if (redoStack.length > 0) {
      setIsUndoRedoAction(true);
      const nextState = redoStack[redoStack.length - 1];
      const currentState = JSON.stringify(menu);
      
      setUndoStack(prev => [...prev, currentState]);
      setRedoStack(prev => prev.slice(0, -1));
      setMenu(JSON.parse(nextState));
      setOriginalMenu(JSON.parse(nextState));
      setIsUndoRedoAction(false);
    }
  };

  // Load menu state from localStorage on initialization
  const [menu, setMenu] = useState(() => {
    try {
      const saved = localStorage.getItem('menuCreate_menu');
      if (!saved) return null;
      
      const parsed = JSON.parse(saved);
      // Validate that the loaded menu has the required structure
      if (!parsed || !parsed.meals || !Array.isArray(parsed.meals) || parsed.meals.length === 0) {
        console.warn('Invalid menu structure in localStorage, clearing...');
        localStorage.removeItem('menuCreate_menu');
        return null;
      }
      
      console.log('📋 Loaded menu from localStorage with', parsed.meals.length, 'meals');
      return parsed;
    } catch (err) {
      console.warn('Failed to load menu from localStorage:', err);
      localStorage.removeItem('menuCreate_menu');
      return null;
    }
  });

  const [originalMenu, setOriginalMenu] = useState(() => {
    try {
      const saved = localStorage.getItem('menuCreate_originalMenu');
      if (!saved) return null;
      
      const parsed = JSON.parse(saved);
      // Validate that the loaded originalMenu has the required structure
      if (!parsed || !parsed.meals || !Array.isArray(parsed.meals) || parsed.meals.length === 0) {
        console.warn('Invalid originalMenu structure in localStorage, clearing...');
        localStorage.removeItem('menuCreate_originalMenu');
        return null;
      }
      
      console.log('📋 Loaded originalMenu from localStorage with', parsed.meals.length, 'meals');
      return parsed;
    } catch (err) {
      console.warn('Failed to load originalMenu from localStorage:', err);
      localStorage.removeItem('menuCreate_originalMenu');
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

  // Ingredient portion dialog state
  const [showPortionDialog, setShowPortionDialog] = useState(false);
  const [selectedIngredientForDialog, setSelectedIngredientForDialog] = useState(null);
  const [dialogIngredientContext, setDialogIngredientContext] = useState(null);

  // Use global client selection from ClientContext instead of local state
  const { selectedClient } = useClient();

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userTargets, setUserTargets] = useState(() => {
    try {
      const saved = localStorage.getItem('menuCreate_userTargets');
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.warn('Failed to load userTargets from localStorage:', err);
      return null;
    }
  });
  const [loadingUserTargets, setLoadingUserTargets] = useState(false);
  const navigate = useNavigate();
  const { language, translations } = useLanguage();
  const [generatingAlt, setGeneratingAlt] = useState({});
  
  // Meal Plan Structure state
  const getDefaultMealPlanStructure = (t) => ([
    { key: 'breakfast', meal: t.breakfast || 'Breakfast', calories_pct: 30, description: '', calories: 0, locked: false },
    { key: 'lunch',      meal: t.lunch || 'Lunch',         calories_pct: 30, description: '', calories: 0, locked: false },
    { key: 'dinner',     meal: t.dinner || 'Dinner',       calories_pct: 30, description: '', calories: 0, locked: false },
    { key: 'snacks',     meal: t.snacks || 'Snack',        calories_pct: 10, description: '', calories: 0, locked: false },
  ]);

  const normalize = (s) => (s || '').toString().trim().toLowerCase();
  const inferMealKey = (name) => {
    const n = normalize(name);
    const candidates = {
      breakfast: [normalize(translations.breakfast), 'breakfast', 'ארוחת בוקר'],
      lunch: [normalize(translations.lunch), 'lunch', 'ארוחת צהריים', 'צהריים'],
      dinner: [normalize(translations.dinner), 'dinner', 'ארוחת ערב', 'ערב'],
      snacks: [normalize(translations.snacks), 'snack', 'snacks', 'חטיף', 'חטיפים'],
    };
    for (const [key, list] of Object.entries(candidates)) {
      if (list.some(x => x && n.includes(x))) return key;
    }
    return undefined;
  };

  const [mealPlanStructure, setMealPlanStructure] = useState(() => getDefaultMealPlanStructure(translations));

  // When language changes, update default meal labels while preserving user edits
  useEffect(() => {
    setMealPlanStructure((prev) => prev.map(item => {
      if (!item.key) return item;
      const map = {
        breakfast: translations.breakfast || 'Breakfast',
        lunch: translations.lunch || 'Lunch',
        dinner: translations.dinner || 'Dinner',
        snacks: translations.snacks || translations.snack || 'Snack',
      };
      return { ...item, meal: map[item.key] || item.meal };
    }));
  }, [language]);
  
  // State for minimizing Meal Plan Structure section
  const [isMealPlanMinimized, setIsMealPlanMinimized] = useState(false);
  
  // State for temporary calorie inputs (before Enter confirmation)
  const [tempCalorieInputs, setTempCalorieInputs] = useState({});
  const [calorieInputErrors, setCalorieInputErrors] = useState({});
  
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
          _selectedUser: selectedClient
        };
        localStorage.setItem('menuCreate_menu', JSON.stringify(menuWithTimestamp));
      } else {
        localStorage.removeItem('menuCreate_menu');
      }
    } catch (err) {
      console.warn('Failed to save menu to localStorage:', err);
    }
  }, [menu, selectedClient]);

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
      if (selectedClient) {
        localStorage.setItem('menuCreate_selectedUser', JSON.stringify(selectedClient));
      } else {
        localStorage.removeItem('menuCreate_selectedUser');
      }
    } catch (err) {
      console.warn('Failed to save selectedUser to localStorage:', err);
    }
  }, [selectedClient]);

  // Save userTargets state to localStorage whenever it changes
  useEffect(() => {
    try {
      if (userTargets) {
        localStorage.setItem('menuCreate_userTargets', JSON.stringify(userTargets));
      } else {
        localStorage.removeItem('menuCreate_userTargets');
      }
    } catch (err) {
      console.warn('Failed to save userTargets to localStorage:', err);
    }
  }, [userTargets]);

  // Auto-calculate meal calories when total calories change
  useEffect(() => {
    if (userTargets?.calories) {
      const updatedMealStructure = calculateMealCalories(mealPlanStructure, userTargets.calories);
      setMealPlanStructure(updatedMealStructure);
    }
  }, [userTargets?.calories]);

  // Keyboard event handler for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, menu]);

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
            margin-bottom: 6px;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .option-number {
            font-weight: 600;
            color: #4CAF50;
            margin-left: 8px;
        }
        
        .option-text {
            color: #333;
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
            /* Disable browser headers and footers */
            @page {
                margin: 0;
                size: A4;
            }
            
            body {
                font-size: 12px;
                margin: 0;
                padding: 0;
            }
            
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
                padding: 20px;
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
            }
        }
        
        /* RTL Support */
        [dir="rtl"] {
            text-align: right;
        }
        
        [dir="rtl"] .meal-options {
            margin-right: 0;
            margin-left: 20px;
        }
        
        [dir="rtl"] .option-number {
            margin-left: 0;
            margin-right: 8px;
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
                                let optionNumber = 1;
                                let options = [];
                                
                                // Add main meal
                                if (meal.main && meal.main.ingredients && meal.main.ingredients.length > 0) {
                                    const mainIngredients = meal.main.ingredients.map(ing => {
                                        let text = ing.item || 'Ingredient';
                                        // Highlight specific words (brands, types, etc.)
                                        text = text.replace(/\b(וגן|קוביה|בישבת|טורטיות|סולוג|מולך|אלשבע|בולים)\b/g, '<span class="highlighted">$1</span>');
                                        
                                        // Add household measure if available
                                        if (ing.household_measure) {
                                            text += ` (${ing.household_measure})`;
                                        }
                                        
                                        return text;
                                    }).join(', ');
                                    options.push(`<div class="meal-option"><span class="option-number">${optionNumber}.</span><span class="option-text">${mainIngredients}</span></div>`);
                                    optionNumber++;
                                }
                                
                                // Add alternative meal
                                if (meal.alternative && meal.alternative.ingredients && meal.alternative.ingredients.length > 0) {
                                    const altIngredients = meal.alternative.ingredients.map(ing => {
                                        let text = ing.item || 'Ingredient';
                                        text = text.replace(/\b(וגן|קוביה|בישבת|טורטיות|סולוג|מולך|אלשבע|בולים)\b/g, '<span class="highlighted">$1</span>');
                                        
                                        // Add household measure if available
                                        if (ing.household_measure) {
                                            text += ` (${ing.household_measure})`;
                                        }
                                        
                                        return text;
                                    }).join(', ');
                                    options.push(`<div class="meal-option"><span class="option-number">${optionNumber}.</span><span class="option-text">${altIngredients}</span></div>`);
                                    optionNumber++;
                                }
                                
                                // Add additional alternatives
                                if (meal.alternatives && meal.alternatives.length > 0) {
                                    meal.alternatives.forEach(alt => {
                                        if (alt.ingredients && alt.ingredients.length > 0) {
                                            const altIngredients = alt.ingredients.map(ing => {
                                                let text = ing.item || 'Ingredient';
                                                text = text.replace(/\b(וגן|קוביה|בישבת|טורטיות|סולוג|מולך|אלשבע|בולים)\b/g, '<span class="highlighted">$1</span>');
                                                
                                                // Add household measure if available
                                                if (ing.household_measure) {
                                                    text += ` (${ing.household_measure})`;
                                                }
                                                
                                                return text;
                                            }).join(', ');
                                            options.push(`<div class="meal-option"><span class="option-number">${optionNumber}.</span><span class="option-text">${altIngredients}</span></div>`);
                                            optionNumber++;
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
      // Save current state to undo stack before making changes
      saveToUndoStack(prevMenu);
      
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
      // Save current state to undo stack before making changes
      saveToUndoStack(prevMenu);
      
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

  const handleHouseholdMeasureChange = (newHouseholdMeasure, mealIndex, optionIndex, ingredientIndex) => {
    setMenu(prevMenu => {
      // Save current state to undo stack before making changes
      saveToUndoStack(prevMenu);
      
      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));
      const meal = updatedMenu.meals[mealIndex];
      const option = optionIndex === 'main' ? meal.main : meal.alternative;

      // Update only the household_measure field of the specific ingredient
      option.ingredients[ingredientIndex].household_measure = newHouseholdMeasure;

      return updatedMenu;
    });

    // Also update the original menu for consistency
    setOriginalMenu(prevOriginal => {
      if (!prevOriginal) return prevOriginal;

      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));
      const meal = updatedOriginal.meals[mealIndex];
      const option = optionIndex === 'main' ? meal.main : meal.alternative;

      // Update only the household_measure field of the specific ingredient
      option.ingredients[ingredientIndex].household_measure = newHouseholdMeasure;

      return updatedOriginal;
    });
  };

  // Dialog handlers for ingredient portion
  const handleOpenPortionDialog = (ingredient, mealIndex, optionIndex, ingredientIndex) => {
    setSelectedIngredientForDialog(ingredient);
    setDialogIngredientContext({ mealIndex, optionIndex, ingredientIndex });
    setShowPortionDialog(true);
  };

  const handleClosePortionDialog = () => {
    setShowPortionDialog(false);
    setSelectedIngredientForDialog(null);
    setDialogIngredientContext(null);
  };

  const handleConfirmPortionDialog = (updatedIngredient) => {
    if (dialogIngredientContext) {
      const { mealIndex, optionIndex, ingredientIndex } = dialogIngredientContext;
      handleIngredientChange(updatedIngredient, mealIndex, optionIndex, ingredientIndex);
    }
    handleClosePortionDialog();
  };

  const handleMakeAlternativeMain = (mealIndex, alternativeIndex = null) => {
    setMenu(prevMenu => {
      // Save current state to undo stack before making changes
      saveToUndoStack(prevMenu);
      
      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));
      const meal = updatedMenu.meals[mealIndex];
      
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
      updatedMenu.totals = calculateMainTotals(updatedMenu);

      return updatedMenu;
    });

    // Also update the original menu for consistency
    setOriginalMenu(prevOriginal => {
      if (!prevOriginal) return prevOriginal;

      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));
      const meal = updatedOriginal.meals[mealIndex];
      
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

      updatedOriginal.totals = calculateMainTotals(updatedOriginal);

      return updatedOriginal;
    });
  };

  const handleDeleteIngredient = (mealIndex, optionIndex, ingredientIndex, alternativeIndex = null) => {
    setMenu(prevMenu => {
      // Save current state to undo stack before making changes
      saveToUndoStack(prevMenu);
      
      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));
      const meal = updatedMenu.meals[mealIndex];
      
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

      // Update meal name with a concise, appealing name (not listing every ingredient)
      const baseName = option.meal_title ? option.meal_title.split(' with ')[0] : meal.meal;
      // Keep the original meal name without listing all ingredients
      option.meal_title = baseName;

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
      updatedMenu.totals = calculateMainTotals(updatedMenu);

      return updatedMenu;
    });

    // Also update the original menu for consistency
    setOriginalMenu(prevOriginal => {
      if (!prevOriginal) return prevOriginal;

      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));
      const meal = updatedOriginal.meals[mealIndex];
      
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

  const fetchUserTargets = async (userCode) => {
    try {
      setLoadingUserTargets(true);
      setError(null); // Clear any existing errors
      console.log('🎯 Fetching nutritional targets for user:', userCode);

      if (!userCode) {
        console.error('❌ No user code provided');
        setError('No user code provided');
        return null;
      }

      // Test database connectivity first
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

      console.log('🔍 Querying database for user_code:', userCode);
      const { data, error } = await supabase
        .from('chat_users')
        .select('dailyTotalCalories, macros, region, food_allergies, food_limitations, age, gender, weight_kg, height_cm, client_preference, meal_plan_structure')
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
      if (!data.dailyTotalCalories) missingFields.push('dailyTotalCalories');
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
        calories: data.dailyTotalCalories || 2000,
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
        client_preference: parseArrayField(data.client_preference),
        meal_plan_structure: parseArrayField(data.meal_plan_structure)
      };

      console.log('✅ Processed user targets:', userTargetsData);
      setUserTargets(userTargetsData);
      
      // Set meal plan structure with fallback to default
      const loadedMealPlan = parseArrayField(data.meal_plan_structure);
      if (loadedMealPlan && loadedMealPlan.length > 0) {
        // Add locked property to each meal (default to false)
        const mealPlanWithLocks = loadedMealPlan.map(meal => ({
          ...meal,
          key: meal.key || inferMealKey(meal.meal),
          locked: false
        }));
        setMealPlanStructure(mealPlanWithLocks);
      } else {
        // Use default structure
        const defaultStructure = getDefaultMealPlanStructure(translations);
        setMealPlanStructure(defaultStructure);
      }
      
      setError(null); // Clear any errors on success
      return userTargetsData;

    } catch (err) {
      console.error('❌ Error in fetchUserTargets:', err);
      setError('Failed to load user targets: ' + err.message);
      return null;
    } finally {
      setLoadingUserTargets(false);
    }
  };

  // Meal Plan Structure Functions
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
            calories_pct: total > 0 ? Math.round(((meal.calories || 0) / total) * 100 * 10) / 10 : 0
          };
        } else if (index === changedMealIndex) {
          // Edited meal: keep exact calories entered, recalculate percentage
          return {
            ...meal,
            calories_pct: total > 0 ? Math.round(((meal.calories || 0) / total) * 100 * 10) / 10 : 0
          };
        } else {
          // Other unlocked meals: scale calories, recalculate percentage
          const scaledCalories = Math.round((meal.calories || 0) * scalingFactor);
          return {
            ...meal,
            calories: Math.max(0, scaledCalories),
            calories_pct: total > 0 ? Math.round((scaledCalories / total) * 100 * 10) / 10 : 0
          };
        }
      });
    }
    
    // If no specific meal changed, just recalculate percentages based on current calories
    return mealPlanStructure.map(meal => ({
      ...meal,
      calories_pct: total > 0 ? Math.round(((meal.calories || 0) / total) * 100 * 10) / 10 : 0
    }));
  };

  // Add new meal to meal plan structure
  const addMealToPlan = () => {
    const newMeal = {
      meal: `Meal ${mealPlanStructure.length + 1}`,
      calories_pct: 0,
      description: "",
      calories: 0,
      locked: false
    };
    
    const updatedStructure = [...mealPlanStructure, newMeal];
    setMealPlanStructure(updatedStructure);
  };

  // Remove meal from meal plan structure
  const removeMealFromPlan = (index) => {
    // Step 1: Remove the selected meal
    const updatedStructure = mealPlanStructure.filter((_, i) => i !== index);
    const totalCalories = userTargets?.calories || 0;
    
    if (totalCalories === 0) {
      setMealPlanStructure(updatedStructure);
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
            calories_pct: totalCalories > 0 ? Math.round(((meal.calories || 0) / totalCalories) * 100 * 10) / 10 : 0
          };
        } else {
          return {
            ...meal,
            calories: 0,
            calories_pct: 0
          };
        }
      });
      
      setMealPlanStructure(rebalancedStructure);
      
      // Show warning
      alert('Warning: Locked meals exceed daily target. Unlocked meals set to 0 calories.');
      return;
    }
    
    // Step 4: Rescale only the unlocked meals
    const scalingFactor = unlockedMealsCalories > 0 ? remainingBudget / unlockedMealsCalories : 0;
    
    let rebalancedStructure = updatedStructure.map(meal => {
      if (meal.locked) {
        // Locked meals: keep calories, recalculate percentage
        return {
          ...meal,
          calories_pct: totalCalories > 0 ? Math.round(((meal.calories || 0) / totalCalories) * 100 * 10) / 10 : 0
        };
      } else {
        // Unlocked meals: scale calories
        const scaledCalories = Math.round((meal.calories || 0) * scalingFactor);
        return {
          ...meal,
          calories: scaledCalories,
          calories_pct: totalCalories > 0 ? Math.round((scaledCalories / totalCalories) * 100 * 10) / 10 : 0
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
          calories_pct: totalCalories > 0 ? Math.round((((rebalancedStructure[largestUnlockedIndex].calories || 0) + difference) / totalCalories) * 100 * 10) / 10 : 0
        };
      }
    }
    
    setMealPlanStructure(rebalancedStructure);
  };

  // Update meal in meal plan structure
  const updateMealInPlan = (index, field, value) => {
    const updatedStructure = [...mealPlanStructure];
    updatedStructure[index] = {
      ...updatedStructure[index],
      [field]: value
    };

    // If calories were changed, recalculate percentages for all meals
    if (field === 'calories') {
      const totalCalories = userTargets?.calories || 0;
      updatedStructure[index].calories = parseInt(value) || 0;
      const recalculatedStructure = recalculatePercentages(updatedStructure, totalCalories, index);
      setMealPlanStructure(recalculatedStructure);
    } else {
      setMealPlanStructure(updatedStructure);
    }
  };

  // Move meal up or down in the list
  const moveMealInPlan = (index, direction) => {
    const updatedStructure = [...mealPlanStructure];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= updatedStructure.length) return;
    
    [updatedStructure[index], updatedStructure[newIndex]] = [updatedStructure[newIndex], updatedStructure[index]];
    
    setMealPlanStructure(updatedStructure);
  };

  // Handle temporary calorie input (without immediate update)
  const handleTempCalorieInput = (mealIndex, value) => {
    const numericValue = parseInt(value) || 0;
    const dailyTotal = userTargets?.calories || 0;
    
    // Calculate current locked calories and other unlocked calories
    const lockedCalories = mealPlanStructure
      .filter((meal, index) => meal.locked && index !== mealIndex)
      .reduce((sum, meal) => sum + (meal.calories || 0), 0);
    
    const otherUnlockedCalories = mealPlanStructure
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
    const dailyTotal = userTargets?.calories || 0;
    
    // Calculate current locked calories
    const lockedCalories = mealPlanStructure
      .filter((meal, index) => meal.locked && index !== mealIndex)
      .reduce((sum, meal) => sum + (meal.calories || 0), 0);
    
    const maxAllowedCalories = dailyTotal - lockedCalories;
    
    // If exceeds limit, reset all unlocked meals
    if (numericValue > maxAllowedCalories) {
      const resetStructure = mealPlanStructure.map((meal, index) => {
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
      
      setMealPlanStructure(resetStructure);
      
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

  // Save meal plan structure to Supabase
  const saveMealPlanStructure = async () => {
    if (!selectedClient?.user_code) {
      alert('No client selected. Please select a client first.');
      return;
    }

    try {
      // Remove locked property before saving (as per Users.jsx pattern)
      const mealPlanToSave = mealPlanStructure.map(meal => ({
        meal: meal.meal,
        description: meal.description,
        calories: meal.calories,
        calories_pct: meal.calories_pct
      }));

      console.log('💾 Saving meal plan structure for user:', selectedClient.user_code);
      console.log('📋 Meal plan data:', mealPlanToSave);

      const { data, error } = await supabase
        .from('chat_users')
        .update({ meal_plan_structure: mealPlanToSave })
        .eq('user_code', selectedClient.user_code)
        .select();

      if (error) {
        console.error('❌ Error saving meal plan structure:', error);
        alert(`Failed to save meal plan structure: ${error.message}`);
        return;
      }

      console.log('✅ Meal plan structure saved successfully:', data);
      alert('Meal plan structure saved successfully!');
      
    } catch (err) {
      console.error('❌ Error in saveMealPlanStructure:', err);
      alert(`Failed to save meal plan structure: ${err.message}`);
    }
  };

  const enrichMenuWithUPC = async (menuToEnrich) => {
    try {
      // Don't set enrichingUPC here since it's now set in the calling function
      // setEnrichingUPC(true);
      // Don't update progress since this runs in background
      // setProgress(90);
      // setProgressStep('🛒 Collecting all ingredients...');

      // Step 1: Collect all unique ingredients across the menu
      const allIngredients = new Map(); // Use brand+name as key to avoid duplicates
      const ingredientPositions = []; // Track where each ingredient is used
      let cacheHits = 0;
      let totalIngredients = 0;

      menuToEnrich.meals.forEach((meal, mealIndex) => {
        // Process main and alternative sections
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

        // Process additional alternatives array
        if (meal.alternatives && Array.isArray(meal.alternatives)) {
          meal.alternatives.forEach((altMeal, altIndex) => {
            if (altMeal?.ingredients) {
              altMeal.ingredients.forEach((ingredient, ingredientIndex) => {
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
                  section: 'alternatives',
                  alternativeIndex: altIndex,
                  ingredientIndex,
                  ingredient
                });
              });
            }
          });
        }
      });

      const uniqueIngredients = Array.from(allIngredients.values());
      const cacheHitRate = totalIngredients > 0 ? Math.round((cacheHits / totalIngredients) * 100) : 0;

      if (uniqueIngredients.length === 0) {
        // setProgress(100);
        // setProgressStep(`✅ All ${totalIngredients} ingredients found in cache (${cacheHitRate}% cache hit rate)`);
        return menuToEnrich;
      }

      // setProgress(92);
      // setProgressStep(`🔍 Looking up ${uniqueIngredients.length} new ingredients (${cacheHits} found in cache, ${cacheHitRate}% hit rate)...`);

      // Step 2: Batch UPC lookup for all ingredients
      const batchResponse = await fetch("https://dietitian-be.azurewebsites.net/api/batch-upc-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ingredients: uniqueIngredients,
          user_code: selectedClient.user_code 
        }),
      });

      if (!batchResponse.ok) {
        console.error("Batch UPC lookup failed, falling back to individual lookups");
        // Fallback to individual lookups if batch fails
        return await enrichMenuWithUPCFallback(menuToEnrich);
      }

      const batchData = await batchResponse.json();

      // setProgress(96);
      // setProgressStep('📋 Updating menu with product codes...');

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
        
        if (pos.section === 'alternatives') {
          // Handle alternatives array
          enrichedMenu.meals[pos.mealIndex].alternatives[pos.alternativeIndex].ingredients[pos.ingredientIndex].UPC = upc;
        } else {
          // Handle main and alternative sections
          enrichedMenu.meals[pos.mealIndex][pos.section].ingredients[pos.ingredientIndex].UPC = upc;
        }
      });

      const finalCacheHitRate = totalIngredients > 0 ? Math.round((cacheHits / totalIngredients) * 100) : 0;
      const successfulLookups = batchData.summary?.successful || 0;

      // setProgress(99);
      // setProgressStep(`✅ Product codes added! ${successfulLookups} new codes found, ${finalCacheHitRate}% cache efficiency`);

      return enrichedMenu;

    } catch (err) {
      console.error("Error in streamlined UPC enrichment:", err);
      // Fallback to original method if streamlined fails
      return await enrichMenuWithUPCFallback(menuToEnrich);
    }
    // Don't set enrichingUPC(false) here since it's handled in the calling function
    // finally {
    //   setEnrichingUPC(false);
    // }
  };

  // Fallback to original method if optimized version fails
  const enrichMenuWithUPCFallback = async (menuToEnrich) => {
    try {
      setProgressStep('🔄 Using fallback UPC lookup...');

      const enrichRes = await fetch("https://dietitian-be.azurewebsites.net/api/enrich-menu-with-upc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          menu: menuToEnrich.meals,
          user_code: selectedClient.user_code 
        }),
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
      console.log('🧹 Clearing saved menu state...');
      localStorage.removeItem('menuCreate_menu');
      localStorage.removeItem('menuCreate_originalMenu');
      localStorage.removeItem('menuCreate_userTargets');
      setMenu(null);
      setOriginalMenu(null);
      setUserTargets(null);
      setError(null);
      console.log('✅ Menu state cleared successfully');
    } catch (err) {
      console.warn('Failed to clear saved menu state:', err);
    }
  };

  const fetchMenu = async () => {
    if (!selectedClient) {
      setError('Please select a client before generating a menu.');
      return;
    }

    // Clear any existing errors at the start
    setError(null);

    // Refresh nutrition targets like when selecting a user
    console.log('🔄 Refreshing nutrition targets like user selection...');
    setProgress(0);
    setProgressStep('🔄 Refreshing nutrition targets...');
    
    // Create a promise that resolves when userTargets is updated
    const waitForUserTargets = () => {
      return new Promise((resolve) => {
        const checkTargets = () => {
          if (userTargets) {
            resolve(userTargets);
          } else {
            setTimeout(checkTargets, 100);
          }
        };
        checkTargets();
      });
    };
    
    // Call fetchUserTargets and wait for the state to update
    fetchUserTargets(selectedClient.user_code);
    
    // Wait for userTargets to be updated
    const updatedTargets = await waitForUserTargets();
    
    // If we got targets, proceed with menu generation
    if (updatedTargets) {
      console.log('✅ User targets loaded successfully:', updatedTargets);
    } else {
      console.warn('⚠️ First attempt failed, trying one more time...');
      setProgressStep('🔄 Retrying nutrition targets...');
      
      // Try one more time
      fetchUserTargets(selectedClient.user_code);
      const retryTargets = await waitForUserTargets();
      
      // If still no targets, then show error
      if (!retryTargets) {
        setError('Unable to load client nutritional targets. Please check the client data and try again.');
        setProgress(0);
        setProgressStep('');
        return;
      }
    }

    try {
      // Clear previous menu data when generating new menu
      clearSavedMenuState();

      setLoading(true);
      setError(null);
      setProgress(0);
      setProgressStep('Initializing...');

      console.log('🧠 Generating menu for user:', selectedClient.user_code);
      console.log('🔍 Selected client data:', selectedClient);
      console.log('🎯 Current user targets:', userTargets);

      // Step 1: Get meal template (25% progress)
      setProgress(5);
      setProgressStep('🎯 Analyzing client preferences...');

      // const templateRes = await fetch("https://dietitian-be.azurewebsites.net/api/template", {
      const templateRes = await fetch("http://127.0.0.1:8000/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: selectedClient.user_code })
      });
      
      console.log('📡 Template API response status:', templateRes.status);
      
      if (!templateRes.ok) {
        const errorText = await templateRes.text();
        console.error('❌ Template API error response:', errorText);
        
        if (templateRes.status === 404) {
          throw new Error("Client not found. Please check if the client exists in the database.");
        } else if (templateRes.status === 500) {
          throw new Error("Server error while analyzing client preferences. Please try again in a moment.");
        } else if (templateRes.status === 503) {
          throw new Error("Menu generation service is temporarily unavailable. Please try again later.");
        } else {
          throw new Error(`Unable to analyze client preferences (Error ${templateRes.status}). Please try again.`);
        }
      }
      
      const templateData = await templateRes.json();
      console.log('📋 Template API response data:', templateData);
      
      if (templateData.error) {
        if (templateData.error.includes("Template validation failed")) {
          throw new Error("Unable to create a balanced meal plan that meets the client's nutritional requirements. Please check the client's dietary restrictions and try again.");
        } else if (templateData.error.includes("Failed to generate template")) {
          throw new Error("Unable to create a meal template. The system is having trouble with the client's dietary preferences. Please review the client's profile and try again.");
        } else {
          throw new Error(`Template creation failed: ${templateData.error}`);
        }
      }
      
      if (!templateData.template) {
        throw new Error("No meal template was generated. Please check the client's profile and try again.");
      }
      
      const template = templateData.template;

      setProgress(25);
      setProgressStep('✅ Client analysis complete!');

      // Step 2: Build menu (50% progress)
      setProgress(30);
      setProgressStep('🍽️ Creating personalized meals...');

      // Normalize template: ensure each option has carbs derived from (cal - 4P - 9F)/4 if missing
      const ensureCarbs = (opt) => {
        if (!opt) return opt;
        const hasAll = opt.calories != null && opt.protein != null && opt.fat != null;
        if (hasAll && (opt.carbs == null || Number.isNaN(opt.carbs))) {
          const remaining = Number(opt.calories) - (4 * Number(opt.protein)) - (9 * Number(opt.fat));
          const carbs = Math.max(0, Math.round(remaining / 4));
          return { ...opt, carbs };
        }
        return opt;
      };

      const normalizedTemplate = (template || []).map(m => ({
        ...m,
        main: ensureCarbs(m.main),
        alternative: ensureCarbs(m.alternative)
      }));

      // const buildRes = await fetch("https://dietitian-be.azurewebsites.net/api/build-menu", {
      const buildRes = await fetch("http://127.0.0.1:8000/api/build-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: normalizedTemplate, user_code: selectedClient.user_code }),
      });
      
      if (!buildRes.ok) {
        if (buildRes.status === 500) {
          throw new Error("Server error while creating meals. Please try again in a moment.");
        } else if (buildRes.status === 503) {
          throw new Error("Meal creation service is temporarily unavailable. Please try again later.");
        } else {
          const errText = await buildRes.text().catch(() => '');
          throw new Error(`Unable to create meals (Error ${buildRes.status}). ${errText || ''}`);
        }
      }
      
      const buildData = await buildRes.json();
      if (buildData.error) {
        if (buildData.error.includes("Template validation failed")) {
          throw new Error("The meal plan doesn't meet the client's nutritional requirements. Please try generating a new menu.");
        } else if (buildData.error.includes("Menu build failed")) {
          throw new Error("Unable to create the complete meal plan. Please try again.");
        } else {
          throw new Error(`Meal creation failed: ${buildData.error}`);
        }
      }
      
      if (!buildData.menu) {
        throw new Error("No meals were created. Please try generating the menu again.");
      }

      setProgress(60);
      setProgressStep('🔢 Calculating nutrition values...');

      const menuData = {
        meals: buildData.menu,
        totals: calculateMainTotals({ meals: buildData.menu }),
        note: buildData.note || ''
      };

      setProgress(70);
      setProgressStep('🛒 Adding product codes...');

      // Step 3: Show menu immediately, then enrich with UPC codes in background
      setMenu(menuData);
      setOriginalMenu(menuData);
      
      setProgress(85);
      setProgressStep('🌐 Preparing menu display...');

      // Display the correct version based on the current language
      if (language === 'he') {
        setProgressStep('🌐 Translating to Hebrew...');
        const translatedMenu = await translateMenu(menuData, 'he');
        setMenu(translatedMenu);
      }

      setProgress(100);
      setProgressStep('🎉 Menu ready!');

      // Clear progress after a short delay to show completion
      setTimeout(() => {
        setProgress(0);
        setProgressStep('');
      }, 1500);

      // Run UPC enrichment in the background (non-blocking)
      console.log('🔄 Starting background UPC enrichment...');
      setEnrichingUPC(true);
      enrichMenuWithUPC(menuData).then(enrichedMenu => {
        console.log('✅ Background UPC enrichment completed');
        setOriginalMenu(enrichedMenu);
        if (language === 'he') {
          translateMenu(enrichedMenu, 'he').then(translatedEnrichedMenu => {
            setMenu(translatedEnrichedMenu);
          });
        } else {
          setMenu(enrichedMenu);
        }
        
        // Automatically minimize the Meal Plan Structure section after successful menu generation
        setIsMealPlanMinimized(true);
        
      }).catch(err => {
        console.error('❌ Background UPC enrichment failed:', err);
        // Menu is already displayed, so this is not critical
      }).finally(() => {
        setEnrichingUPC(false);
      });

    } catch (err) {
      console.error("Error generating menu:", err);
      
      // Handle network errors specifically
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError("Unable to connect to the menu generation service. Please check your internet connection and try again.");
      } else if (err.message.includes('Failed to fetch')) {
        setError("Connection to the menu service was lost. Please check your internet connection and try again.");
      } else if (err.message.includes('NetworkError')) {
        setError("Network connection error. Please check your internet connection and try again.");
      } else {
        // Use the specific error message we created above, or a generic one
        setError(err.message || "Something unexpected went wrong while creating your menu. Please try again.");
      }
      
      setProgress(0);
      setProgressStep('');
    } finally {
      setLoading(false);
    }
  };

  // Function to translate Hebrew ingredients to English
  const translateIngredientsToEnglish = async (menu) => {
    console.log('🌐 Starting ingredient translation to English...');
    
    const translatedMenu = JSON.parse(JSON.stringify(menu));
    
    // Helper function to check if text contains Hebrew
    const containsHebrew = (text) => {
      if (!text) return false;
      return /[\u0590-\u05FF]/.test(text);
    };
    
    // Helper function to translate text
    const translateText = async (text) => {
      if (!text || !containsHebrew(text)) return text;
      
      try {
        // Check cache first
        const cacheKey = createTextCacheKey(text, 'en');
        const cachedTranslation = getCachedTranslation(cacheKey);
        
        if (cachedTranslation) {
          console.log(`📚 Using cached text translation: "${text}" -> "${cachedTranslation}"`);
          return cachedTranslation;
        }
        
        console.log(`🌐 Translating: "${text}"`);
        const response = await fetch('https://dietitian-be.azurewebsites.net/api/translate-text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: text,
            targetLang: 'en'
          })
        });
        
        if (!response.ok) {
          console.error('❌ Translation API error:', response.status);
          return text; // Return original if translation fails
        }
        
        const result = await response.json();
        console.log(`✅ Translated: "${text}" -> "${result.translatedText}"`);
        
        // Cache the successful translation
        cacheTranslation(cacheKey, result.translatedText);
        
        return result.translatedText;
      } catch (error) {
        console.error('❌ Translation error:', error);
        return text; // Return original if translation fails
      }
    };
    
    // Process all meals and their ingredients
    for (const meal of translatedMenu.meals || []) {
      // Process main meal ingredients
      if (meal.main?.ingredients) {
        for (const ingredient of meal.main.ingredients) {
          if (ingredient.item) {
            ingredient.item = await translateText(ingredient.item);
          }
          if (ingredient.household_measure) {
            ingredient.household_measure = await translateText(ingredient.household_measure);
          }
        }
      }
      
      // Process alternative meal ingredients
      if (meal.alternative?.ingredients) {
        for (const ingredient of meal.alternative.ingredients) {
          if (ingredient.item) {
            ingredient.item = await translateText(ingredient.item);
          }
          if (ingredient.household_measure) {
            ingredient.household_measure = await translateText(ingredient.household_measure);
          }
        }
      }
      
      // Process additional alternatives
      if (meal.alternatives) {
        for (const alternative of meal.alternatives) {
          if (alternative.ingredients) {
            for (const ingredient of alternative.ingredients) {
              if (ingredient.item) {
                ingredient.item = await translateText(ingredient.item);
              }
              if (ingredient.household_measure) {
                ingredient.household_measure = await translateText(ingredient.household_measure);
              }
            }
          }
        }
      }
    }
    
    console.log('✅ Ingredient translation completed');
    return translatedMenu;
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

      // Debug: Check what ingredient data is actually in the originalMenu
      console.log('🔍 DEBUG: Checking ingredient data in originalMenu before saving:');
      originalMenu.meals?.forEach((meal, mealIndex) => {
        console.log(`🍽️ Meal ${mealIndex}: ${meal.meal}`);
        
        if (meal.main?.ingredients) {
          meal.main.ingredients.forEach((ingredient, ingIndex) => {
            console.log(`  Main Ingredient ${ingIndex}: ${ingredient.item} - UPC: "${ingredient.UPC}" (type: ${typeof ingredient.UPC})`);
          });
        }
        
        if (meal.alternative?.ingredients) {
          meal.alternative.ingredients.forEach((ingredient, ingIndex) => {
            console.log(`  Alt Ingredient ${ingIndex}: ${ingredient.item} - UPC: "${ingredient.UPC}" (type: ${typeof ingredient.UPC})`);
          });
        }
      });

      console.log('📊 Original Menu structure:', {
        meals: originalMenu.meals?.length,
        totals: originalMenu.totals,
        hasNote: !!originalMenu.note
      });

      // Translate Hebrew ingredients to English before saving
      console.log('🌐 Translating Hebrew ingredients to English...');
      const translatedMenu = await translateIngredientsToEnglish(originalMenu);
      console.log('✅ Translation completed, using translated menu for saving');

      // Create schema template (like your example format)
      const schemaTemplate = {
        template: translatedMenu.meals?.map(meal => {
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
        meal_plan_name: `Meal Plan - ${selectedClient?.full_name || 'Unknown Client'}`,
        schema: schemaTemplate,        // Schema template in same row
        meal_plan: translatedMenu,     // Full meal plan in same row (translated)
        status: 'draft',
        daily_total_calories: translatedMenu.totals?.calories || 2000,
        macros_target: {
          protein: translatedMenu.totals?.protein || 150,
          carbs: translatedMenu.totals?.carbs || 250,
          fat: translatedMenu.totals?.fat || 80,
        },
        recommendations: translatedMenu.recommendations || {},
        dietary_restrictions: {},
        user_code: selectedClient?.user_code || null, // Use selected user's code
        dietitian_id: user.id
      };

      console.log('📤 Combined payload:', JSON.stringify(combinedPayload, null, 2));

      const result = await Menu.create(combinedPayload);
      console.log('✅ Combined schema + menu saved successfully:', result);

      // Show success message
      setError(null);
      console.log('🎉 Schema and meal plan saved in single record!');
      alert('Schema and meal plan saved successfully!');

      // Don't clear the menu from UI - keep it visible for the user
      // The menu is now saved in the database but remains visible for further editing

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

        {/* Ingredients Section */}
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2">{translations.ingredients || 'Ingredients'}:</h5>
          
          {option.ingredients && Array.isArray(option.ingredients) && option.ingredients.length > 0 ? (
            <ul className="space-y-1 mb-3">
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
                        currentIngredient={ingredient}
                        onPortionDialog={handleOpenPortionDialog}
                        autoFocus={idx === option.ingredients.length - 1 && ingredient.item === ''}
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
                          translations={translations}
                        />
                        <button
                          onClick={() => handleOpenPortionDialog(ingredient, option.mealIndex, isAlternative ? 'alternative' : 'main', idx)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded text-xs"
                          title={translations?.editPortion || 'Edit portion size'}
                        >
                          ✏️
                        </button>
                      </div>
                      {(ingredient.calories || ingredient.protein) && (
                        <>
                          <span className="font-bold text-green-700">
                            {Math.round(ingredient.calories || 0)} {translations.calories || 'k'}
                          </span>
                          <span className="text-blue-600 font-medium">
                            {Math.round(ingredient.protein || 0)}g {translations.protein || 'protein'}
                          </span>
                          <span className="font-bold text-amber-700">
                            {Math.round(ingredient.carbs || 0)}g {translations.carbs || 'carbs'}
                          </span>
                          <span className="font-bold text-orange-700">
                            {Math.round(ingredient.fat || 0)}g {translations.fat || 'fat'}
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
            <div className="text-gray-500 text-sm italic mb-3">
              {translations.noIngredients || 'No ingredients added yet'}
            </div>
          )}

          {/* Add Ingredient Button */}
          <div className="flex justify-end mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddIngredient(option.mealIndex, isAlternative ? 'alternative' : 'main')}
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

  // Create a stable function to handle language changes
  const handleLanguageChange = useCallback(async (lang) => {
    console.log('🌐 Language change requested:', lang, 'Current originalMenu:', !!originalMenu, 'Loading:', loading);
    
    // Prevent language changes during menu generation
    if (loading) {
      console.log('⏳ Menu generation in progress, ignoring language change');
      return;
    }
    
    if (!originalMenu) {
      console.log('❌ No originalMenu available for translation');
      return; // Nothing to translate
    }

    // If switching to English, instantly use the original menu
    if (lang === 'en') {
      console.log('✅ Switching to English, using originalMenu directly');
      setMenu(originalMenu);
      return;
    }

    // For other languages, translate from the pristine original menu
    console.log('🌐 Starting translation to:', lang);
    setLoading(true);
    setError(null);
    
    try {
      // Create a local copy to ensure we're using the current state
      const currentOriginalMenu = originalMenu;
      console.log('📋 Translating menu with', currentOriginalMenu.meals?.length, 'meals');
      
      const translated = await translateMenu(currentOriginalMenu, lang);
      console.log('✅ Translation completed, setting menu');
      setMenu(translated);
    } catch (err) {
      console.error('❌ Translation failed:', err);
      setError('Failed to translate menu.');
      setMenu(originalMenu); // Fallback to original on error
    } finally {
      setLoading(false);
    }
  }, [originalMenu, loading]); // Include loading in dependencies to prevent changes during generation

  useEffect(() => {
    // Subscribe the stable handler to the language change event
    EventBus.on('translateMenu', handleLanguageChange);
    
    // Cleanup function to unsubscribe
    return () => {
      // Unsubscribe on cleanup to prevent memory leaks
      if (EventBus.off) {
        EventBus.off('translateMenu', handleLanguageChange);
      }
    };
  }, [handleLanguageChange]);


  async function generateAlternativeMeal(main, alternative, allAlternatives) {
    // const response = await fetch('https://dietitian-be.azurewebsites.net/api/generate-alternative-meal', {
    const response = await fetch('http://127.0.0.1:8000/api/generate-alternative-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        main,
        alternative,
        allAlternatives, // Send all alternatives for better duplication avoidance
        user_code: selectedClient.user_code
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate alternative meal');
    }
    return await response.json();
  }

  const handleAddAlternative = async (mealIdx) => {
    // Prevent duplicate calls while generating
    if (generatingAlt[mealIdx] || ongoingOperations.current.has(mealIdx)) {
      console.log('🔄 Already generating alternative for meal', mealIdx);
      return;
    }
    
    // Mark this operation as ongoing
    ongoingOperations.current.add(mealIdx);
    console.log(`🚀 Starting to generate alternative for meal ${mealIdx}`);
    setGeneratingAlt((prev) => ({ ...prev, [mealIdx]: true }));
    
    try {
      const meal = menu.meals[mealIdx];
      if (!meal || !meal.main || !meal.alternative) {
        console.log('❌ Missing main or alternative for meal', mealIdx);
        return;
      }
      
      // Collect all existing alternatives to avoid duplication
      const allAlternatives = [meal.main, meal.alternative];
      if (meal.alternatives && Array.isArray(meal.alternatives)) {
        allAlternatives.push(...meal.alternatives);
      }
      
      console.log(`📋 Collected ${allAlternatives.length} alternatives to avoid duplication`);
      
      const newAlt = await generateAlternativeMeal(meal.main, meal.alternative, allAlternatives);
      console.log('✅ Generated new alternative:', newAlt);
      
      // If we're in Hebrew mode, translate the new alternative immediately
      let translatedAlt = newAlt;
      if (language === 'he') {
        try {
          console.log('🌐 Translating new alternative meal to Hebrew...');
          console.log('📋 Original newAlt:', newAlt);
          console.log('🌍 Current language:', language);
          
          // Create a proper menu structure for translation
          const menuForTranslation = {
            meals: [{
              meal: newAlt.meal || 'Alternative',
              main: newAlt,
              alternative: newAlt
            }]
          };
          console.log('📤 Sending to translation:', menuForTranslation);
          
          const translatedMenu = await translateMenu(menuForTranslation, 'he');
          console.log('📥 Received translation:', translatedMenu);
          
          translatedAlt = translatedMenu.meals[0].main; // Extract the translated meal
          console.log('✅ New alternative translated to Hebrew:', translatedAlt);
        } catch (translationError) {
          console.error('❌ Failed to translate new alternative:', translationError);
          // Fall back to original English version
          translatedAlt = newAlt;
        }
      } else {
        console.log('🔤 Not in Hebrew mode, using English version');
      }
      
      // Update both menus in a single operation to prevent race conditions
      setMenu((prevMenu) => {
        console.log('🔄 Updating menu state...');
        // Save current state to undo stack before making changes
        saveToUndoStack(prevMenu);
        
        const updated = JSON.parse(JSON.stringify(prevMenu));
        if (!updated.meals[mealIdx].alternatives) {
          updated.meals[mealIdx].alternatives = [];
        }
        updated.meals[mealIdx].alternatives.push(translatedAlt);
        console.log(`✅ Added alternative to meal ${mealIdx}, total alternatives: ${updated.meals[mealIdx].alternatives.length}`);
        return updated;
      });
      
      // Update original menu in the same operation
      setOriginalMenu((prevOriginal) => {
        if (!prevOriginal) return prevOriginal;
        
        const updated = JSON.parse(JSON.stringify(prevOriginal));
        if (!updated.meals[mealIdx].alternatives) {
          updated.meals[mealIdx].alternatives = [];
        }
        updated.meals[mealIdx].alternatives.push(newAlt); // Always store English version in original
        return updated;
      });
      
      console.log(`✅ Successfully added alternative to meal ${mealIdx}`);
      
    } catch (err) {
      console.error('❌ Error generating alternative:', err);
      alert(err.message || 'Failed to generate alternative meal');
    } finally {
      console.log(`🏁 Finished generating alternative for meal ${mealIdx}`);
      setGeneratingAlt((prev) => ({ ...prev, [mealIdx]: false }));
      // Remove from ongoing operations
      ongoingOperations.current.delete(mealIdx);
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

  // Helper for ingredient normalization (for deduplication)
  function normalizeIngredientName(name) {
    let str = name || '';
    str = str.toLowerCase().trim();
    // Remove plural 's' at the end (simple heuristic)
    str = str.replace(/\b(tomatoes|breasts)\b/g, m => m.slice(0, -1));
    str = str.replace(/\b(ies)\b/g, 'y'); // e.g., berries -> berry
    str = str.replace(/\s+/g, ' ');
    return str;
  }

  function generateShoppingList(menu) {
    if (!menu || !menu.meals) return [];
    const itemsMap = {};
    const prettyNames = {};
    menu.meals.forEach(meal => {
      const options = [meal.main, meal.alternative, ...(meal.alternatives || [])];
      options.forEach(option => {
        if (option && option.ingredients) {
          option.ingredients.forEach(ing => {
            const base = extractBaseIngredient(ing.item);
            const normalized = normalizeIngredientName(base);
            const prep = extractPreparation(ing.item);
            const measure = ing.household_measure || '';
            // Save the prettiest name (first occurrence, capitalized)
            if (!prettyNames[normalized]) {
              prettyNames[normalized] = base.charAt(0).toUpperCase() + base.slice(1);
            }
            if (!itemsMap[normalized]) {
              itemsMap[normalized] = {
                base: prettyNames[normalized],
                household_measures: new Set(),
                preparations: new Set(),
              };
            }
            if (measure) itemsMap[normalized].household_measures.add(measure);
            prep.forEach(p => itemsMap[normalized].preparations.add(p));
          });
        }
      });
    });
    // Convert sets to arrays and join for display
    return Object.values(itemsMap)
      .map(item => ({
        base: item.base,
        household_measure: Array.from(item.household_measures).join(' / '),
        preparations: Array.from(item.preparations),
      }))
      .sort((a, b) => a.base.localeCompare(b.base));
  }

  // Auto-fetch user targets if a user was previously selected
  // REMOVED: This useEffect had a condition that prevented fetching when userTargets already existed
  // Now using the useEffect below that fetches whenever selectedClient changes

  // Auto-fetch user targets when selectedClient changes
  useEffect(() => {
    if (selectedClient) {
      console.log('🔄 Fetching user targets for selected client:', selectedClient.user_code);
      fetchUserTargets(selectedClient.user_code);
    }
  }, [selectedClient]);

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

  const handleAddIngredient = (mealIndex, optionIndex) => {
    setMenu(prevMenu => {
      // Save current state to undo stack before making changes
      saveToUndoStack(prevMenu);
      
      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));
      const meal = updatedMenu.meals[mealIndex];
      
      if (!meal) {
        console.error('❌ Meal not found at index:', mealIndex);
        return prevMenu;
      }
      
      const option = optionIndex === 'main' ? meal.main : meal.alternative;
      
      if (!option) {
        console.error('❌ Option not found for meal:', mealIndex, 'option:', optionIndex);
        return prevMenu;
      }

      // Ensure ingredients array exists
      if (!option.ingredients) {
        option.ingredients = [];
      }

      // Add a new empty ingredient
      const newIngredient = {
        item: '',
        household_measure: '',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        'brand of pruduct': '',
        UPC: null,
        'portionSI(gram)': 0
      };

      option.ingredients.push(newIngredient);

      return updatedMenu;
    });

    // Also update the original menu for consistency
    setOriginalMenu(prevOriginal => {
      if (!prevOriginal) return prevOriginal;

      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));
      const meal = updatedOriginal.meals[mealIndex];
      
      if (!meal) {
        console.error('❌ Meal not found at index:', mealIndex);
        return prevOriginal;
      }
      
      const option = optionIndex === 'main' ? meal.main : meal.alternative;
      
      if (!option) {
        console.error('❌ Option not found for meal:', mealIndex, 'option:', optionIndex);
        return prevOriginal;
      }

      // Ensure ingredients array exists
      if (!option.ingredients) {
        option.ingredients = [];
      }

      const newIngredient = {
        item: '',
        household_measure: '',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        'brand of pruduct': '',
        UPC: null,
        'portionSI(gram)': 0
      };

      option.ingredients.push(newIngredient);

      return updatedOriginal;
    });
  };

  // Delete meal option (main or alternative) from a meal
  const deleteMealOption = (mealIndex, optionType) => {
    if (!menu || !menu.meals || mealIndex < 0 || mealIndex >= menu.meals.length) {
      console.error('❌ Invalid meal index for deletion:', mealIndex);
      return;
    }

    const meal = menu.meals[mealIndex];
    if (!meal) {
      console.error('❌ Meal not found at index:', mealIndex);
      return;
    }

    // Save current state to undo stack before making changes
    saveToUndoStack(menu);

    setMenu(prevMenu => {
      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));
      const targetMeal = updatedMenu.meals[mealIndex];
      
      // Remove the specified option type
      if (optionType === 'main') {
        delete targetMeal.main;
      } else if (optionType === 'alternative') {
        delete targetMeal.alternative;
      } else if (optionType === 'alternatives' && targetMeal.alternatives) {
        // For additional alternatives, remove the entire alternatives array
        delete targetMeal.alternatives;
      }
      
      // Recalculate totals after deletion
      if (updatedMenu.meals.length > 0) {
        updatedMenu.totals = calculateMainTotals(updatedMenu);
      } else {
        // If no meals left, reset totals
        updatedMenu.totals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
      }
      
      return updatedMenu;
    });

    // Also update the original menu for consistency
    setOriginalMenu(prevOriginal => {
      if (!prevOriginal) return prevOriginal;

      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));
      const targetMeal = updatedOriginal.meals[mealIndex];
      
      // Remove the specified option type
      if (optionType === 'main') {
        delete targetMeal.main;
      } else if (optionType === 'alternative') {
        delete targetMeal.alternative;
      } else if (optionType === 'alternatives' && targetMeal.alternatives) {
        // For additional alternatives, remove the entire alternatives array
        delete targetMeal.alternatives;
      }
      
      if (updatedOriginal.meals.length > 0) {
        updatedOriginal.totals = calculateMainTotals(updatedOriginal);
      } else {
        updatedOriginal.totals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
      }
      
      return updatedOriginal;
    });

    console.log(`🗑️ Deleted ${optionType} option from meal at index ${mealIndex}`);
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
              {translations.menuCreate || 'Generate Meal Plan'}
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
              if (window.confirm(translations.confirmClearMenu || 'Are you sure you want to clear the current menu and start fresh? This action cannot be undone.')) {
                clearSavedMenuState();
                setError(null);
              }
            }}
          >
            {translations.startFresh || 'Start Fresh'}
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
              <AlertTitle className="text-blue-800">{translations.previousMenuFound || 'Previous Menu Found'}</AlertTitle>
              <AlertDescription className="text-blue-700">
                {translations.previousMenuDescription || 'We found a previously generated menu for'} <strong>{savedUser}</strong> {translations.fromTime || 'from'} <strong>{savedAt}</strong>.
                {translations.continueOrStartFresh || 'Would you like to continue working on it or start fresh?'}
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
                    {translations.continuePreviousMenu || 'Continue Previous Menu'}
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
                    {translations.startFresh || 'Start Fresh'}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          );
        } catch (err) {
          return false;
        }
      })()}

      {/* Client Selection - Now using global selection from sidebar */}
      <Card>
        <CardHeader>
          <CardTitle>{translations.clientSelection || 'Selected Client'}</CardTitle>
          <CardDescription>
            {selectedClient 
              ? `${translations.clientFromSidebar || 'Client selected from sidebar'}: ${selectedClient.full_name}`
              : translations.selectClientInSidebar || 'Please select a client in the sidebar to generate a menu'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedClient ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <span>✓</span>
                <span className="font-medium">{translations.selected || 'Selected'}: {selectedClient.full_name}</span>
                <span className="text-green-600">({selectedClient.user_code})</span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-center gap-2 text-sm text-yellow-700">
                <span>⚠️</span>
                <span>{translations.noClientSelected || 'No client selected'}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Targets Display */}
      {/* Menu Generation Section */}
      {selectedClient && userTargets && (
        <Card className="border-green-200 bg-green-50/30 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <span>🍽️</span>
              {translations.generateMenu || 'Generate Menu'}
            </CardTitle>
            <CardDescription className="text-green-600">
              {translations.generateMenuFor ? `${translations.generateMenuFor} ${selectedClient.full_name}` : `Generate personalized menu for ${selectedClient.full_name}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={fetchMenu}
                  disabled={loading || !selectedClient}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3"
                >
                  {loading ? (
                    <Loader className="animate-spin h-5 w-5 mr-2" />
                  ) : (
                    <span className="text-lg">🎯</span>
                  )}
                  {loading ? translations.generating || 'Generating...' : translations.generateMenu || 'Generate Menu'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meal Plan Structure Section */}
      {selectedClient && userTargets && (
        <Card className="border-blue-200 bg-blue-50/30 mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-800">
                <span>📋</span>
                <CardTitle>{translations.mealPlanStructure || 'Meal Plan Structure'}</CardTitle>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsMealPlanMinimized(!isMealPlanMinimized)}
                className="text-blue-600 hover:bg-blue-100"
                title={isMealPlanMinimized ? "Expand Meal Plan Structure" : "Minimize Meal Plan Structure"}
              >
                {isMealPlanMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
            <CardDescription className="text-blue-600">
              {translations.mealPlanDescription || 'Configure how daily calories are distributed across meals'}
            </CardDescription>
          </CardHeader>
          {!isMealPlanMinimized && (
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {translations.mealPlanDescription || 'Configure how daily calories are distributed across meals'}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={saveMealPlanStructure}
                      className="text-blue-600 border-blue-600 hover:bg-blue-50"
                      title="Save meal plan structure to database"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {translations.saveMealPlan || 'Save Plan'}
                    </Button>
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
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b">
                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
                      <div className="col-span-3">{translations.mealName || 'Meal Name'}</div>
                      <div className="col-span-2">{translations.mealDescriptionShort || translations.description || 'Description'}</div>
                      <div className="col-span-2">{translations.caloriesLabel || translations.calories || 'Calories'}</div>
                      <div className="col-span-2">{translations.percentage || 'Percentage'}</div>
                      <div className="col-span-1">{translations.lock || 'Lock'}</div>
                      <div className="col-span-2">{translations.actions || 'Actions'}</div>
                    </div>
                  </div>
                  
                  {mealPlanStructure.map((meal, index) => (
                    <div key={index} className="px-4 py-3 border-b last:border-b-0 bg-white">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        {/* Meal Name */}
                        <div className="col-span-3">
                          <Input
                            value={meal.meal}
                            onChange={(e) => updateMealInPlan(index, 'meal', e.target.value)}
                            className="text-sm"
                            placeholder={translations.mealName || 'Meal name'}
                          />
                        </div>
                        
                        {/* Description */}
                        <div className="col-span-2">
                          <Input
                            value={meal.description}
                            onChange={(e) => updateMealInPlan(index, 'description', e.target.value)}
                            className="text-sm"
                            placeholder={translations.mealDescriptionShort || translations.descriptionPlaceholder || 'Optional description'}
                          />
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
                              onBlur={() => {
                                if (tempCalorieInputs[index] !== undefined) {
                                  confirmCalorieInput(index);
                                }
                              }}
                              className={`text-sm ${calorieInputErrors[index] ? 'border-red-500' : ''}`}
                              placeholder="0"
                            />
                            {calorieInputErrors[index] && (
                              <div className="absolute -bottom-6 left-0 text-xs text-red-500">
                                {calorieInputErrors[index]}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Percentage */}
                        <div className="col-span-2">
                          <div className="text-sm text-gray-600">
                            {meal.calories_pct.toFixed(1)}%
                          </div>
                        </div>
                        
                        {/* Lock */}
                        <div className="col-span-1">
                          <Button
                            type="button"
                            variant={meal.locked ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateMealInPlan(index, 'locked', !meal.locked)}
                            className={`w-full ${meal.locked ? 'bg-blue-600 hover:bg-blue-700' : 'text-blue-600 border-blue-600 hover:bg-blue-50'}`}
                            title={meal.locked ? "Unlock meal" : "Lock meal"}
                          >
                            🔒
                          </Button>
                        </div>
                        
                        {/* Actions */}
                        <div className="col-span-2">
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => moveMealInPlan(index, 'up')}
                              disabled={index === 0}
                              className="text-gray-600 hover:bg-gray-50"
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => moveMealInPlan(index, 'down')}
                              disabled={index === mealPlanStructure.length - 1}
                              className="text-gray-600 hover:bg-gray-50"
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeMealFromPlan(index)}
                              disabled={mealPlanStructure.length <= 1}
                              className="text-red-600 border-red-600 hover:bg-red-50"
                              title="Remove meal"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary Stats */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">{translations.totalMeals || 'Total Meals'}: </span>
                      <span className="font-medium">{mealPlanStructure.length}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({mealPlanStructure.filter(meal => meal.locked).length} {translations.locked || 'locked'})
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">{translations.totalCalories || 'Total Calories'}: </span>
                      <span className="font-medium">
                        {mealPlanStructure.reduce((sum, meal) => sum + (meal.calories || 0), 0)} / {userTargets?.calories || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">{translations.lockedCalories || 'Locked Calories'}: </span>
                      <span className="font-medium text-blue-600">
                        {mealPlanStructure.filter(meal => meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">{translations.unlockedCalories || 'Unlocked Calories'}: </span>
                      <span className="font-medium text-green-600">
                        {mealPlanStructure.filter(meal => !meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">{translations.availableBudget || 'Available Budget'}: </span>
                      <span className="font-medium text-purple-600">
                        {Math.max(0, (userTargets?.calories || 0) - mealPlanStructure.filter(meal => meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0))} kcal
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">{translations.maxPerMeal || 'Max per Meal'}: </span>
                      <span className="font-medium text-orange-600">
                        {Math.max(0, (userTargets?.calories || 0) - mealPlanStructure.filter(meal => meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0))} kcal
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">{translations.totalPercentage || 'Total Percentage'}: </span>
                      <span className={`font-medium ${Math.abs(mealPlanStructure.reduce((sum, meal) => sum + meal.calories_pct, 0) - 100) < 0.1 ? 'text-green-600' : 'text-red-600'}`}>
                        {mealPlanStructure.reduce((sum, meal) => sum + meal.calories_pct, 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {translations.mealPlanLockNote || 'Note: 🔒 Locked meals maintain their calories. When you edit a meal, that meal keeps its exact value and other unlocked meals scale to fit the remaining budget.'}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    {translations.scalingFormula || 'Formula: Scaling Factor = (Daily Target - Locked Calories - Edited Meal) ÷ Other Unlocked Total'}
                  </p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Nutrition Targets Display */}
      {selectedClient && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-blue-800">
            <span>🎯</span>
            {translations.nutritionTargets || 'Client Nutritional Targets'}
          </CardTitle>
          <CardDescription className="text-blue-600">
            {translations.fromDatabase ? `${translations.fromDatabase} ${selectedClient.full_name}` : `from database ${selectedClient.full_name}`}
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

                {/* User Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-blue-200">
                  {userTargets.region && (
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-xs text-blue-600 font-medium mb-1">{translations.region || 'Region'}</p>
                      <div className="flex items-center justify-center gap-1">
                        <span>🌍</span>
                        <span className="capitalize text-blue-700 font-medium text-sm">{userTargets.region}</span>
                      </div>
                    </div>
                  )}

                  {userTargets.age && (
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-xs text-blue-600 font-medium mb-1">{translations.age || 'Age'}</p>
                      <div className="flex items-center justify-center gap-1">
                        <span>👤</span>
                        <span className="text-blue-700 font-medium text-sm">{userTargets.age} {translations.years || 'years'}</span>
                      </div>
                    </div>
                  )}

                  {userTargets.gender && (
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-xs text-blue-600 font-medium mb-1">{translations.gender || 'Gender'}</p>
                      <div className="flex items-center justify-center gap-1">
                        <span>⚧</span>
                        <span className="capitalize text-blue-700 font-medium text-sm">{userTargets.gender}</span>
                      </div>
                    </div>
                  )}

                  {userTargets.weight_kg && (
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-xs text-blue-600 font-medium mb-1">{translations.weight || 'Weight'}</p>
                      <div className="flex items-center justify-center gap-1">
                        <span>⚖️</span>
                        <span className="text-blue-700 font-medium text-sm">{userTargets.weight_kg} kg</span>
                      </div>
                    </div>
                  )}

                  {userTargets.height_cm && (
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-blue-200 text-center">
                      <p className="text-xs text-blue-600 font-medium mb-1">{translations.height || 'Height'}</p>
                      <div className="flex items-center justify-center gap-1">
                        <span>📏</span>
                        <span className="text-blue-700 font-medium text-sm">{userTargets.height_cm} cm</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Dietary Info */}
                <div className="space-y-3 pt-4 border-t border-blue-200">
                  {userTargets.client_preference && userTargets.client_preference.length > 0 && (
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-green-200">
                      <p className="text-sm text-green-700 font-medium mb-2 flex items-center gap-2">
                        <span>❤️</span>
                        {translations.clientPreferences || 'Client Preferences'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {userTargets.client_preference.map((pref, idx) => (
                          <Badge key={idx} variant="outline" className="bg-green-50 border-green-200 text-green-700 text-sm">
                            {pref}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

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
                </div>

                {/* Menu Comparison */}
                {menu && menu.totals && (
                  <div className="pt-4 border-t border-blue-200">
                    <h4 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
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
                            <span className="font-bold text-green-700">{menu.totals.calories}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                            <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>
                            <span className={`text-sm font-medium ${Math.abs(menu.totals.calories - userTargets.calories) <= userTargets.calories * 0.05
                                ? 'text-green-600'
                                : 'text-red-600'
                              }`}>
                              {`${menu.totals.calories - userTargets.calories > 0 ? '+' : ''}${((menu.totals.calories - userTargets.calories) / userTargets.calories * 100)
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
                          <span className="font-bold text-green-700">{menu.totals.protein}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                          <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>
                          <span className={`text-sm font-medium ${Math.abs(menu.totals.protein - userTargets.macros.protein) <= userTargets.macros.protein * 0.05
                                ? 'text-green-600'
                                : 'text-red-600'
                              }`}>
                              {`${menu.totals.protein - userTargets.macros.protein > 0 ? '+' : ''}${((menu.totals.protein - userTargets.macros.protein)
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
                            <span className="font-bold text-green-700">{menu.totals.fat}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                            <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>
                            <span className={`text-sm font-medium ${Math.abs(menu.totals.fat - userTargets.macros.fat) <= userTargets.macros.fat * 0.05
                                ? 'text-green-600'
                                : 'text-red-600'
                              }`}>
                              {`${menu.totals.fat - userTargets.macros.fat > 0 ? '+' : ''}${((menu.totals.fat - userTargets.macros.fat)
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
                            <span className="font-bold text-green-700">{menu.totals.carbs}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                            <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>
                            <span className={`text-sm font-medium ${Math.abs(menu.totals.carbs - userTargets.macros.carbs) <= userTargets.macros.carbs * 0.05
                                ? 'text-green-600'
                                : 'text-red-600'
                              }`}>
                              {`${menu.totals.carbs - userTargets.macros.carbs > 0 ? '+' : ''}${((menu.totals.carbs - userTargets.macros.carbs)
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
                            const caloriesDiff = Math.abs((menu.totals.calories - userTargets.calories) / userTargets.calories * 100);
                            const proteinDiff = Math.abs((menu.totals.protein - userTargets.macros.protein) / userTargets.macros.protein * 100);
                            const fatDiff = Math.abs((menu.totals.fat - userTargets.macros.fat) / userTargets.macros.fat * 100);
                            const carbsDiff = Math.abs((menu.totals.carbs - userTargets.macros.carbs) / userTargets.macros.carbs * 100);

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

             
      {menu && menu.meals && menu.meals.length > 0 && (
        <>
          {enrichingUPC && (
            <Card className="bg-blue-50/30 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Loader className="animate-spin h-5 w-5 text-blue-600" />
                  <span className="text-blue-700">{translations.addingProductCodes || 'Adding product codes to ingredients...'}</span>
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
                      <span className="text-sm font-normal text-green-600 ml-1">{translations.calories || 'kcal'}</span>
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

          {/* Recommendations Section */}
          {menu.recommendations && menu.recommendations.length > 0 && (
            <Card className="bg-purple-50/30 border-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <span>💡</span>
                  {translations.recommendations || 'Recommendations'}
                </CardTitle>
                <CardDescription className="text-purple-600">
                  {translations.personalizedRecommendations || 'Personalized recommendations'} for {selectedClient?.full_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {menu.recommendations.map((rec, idx) => (
                    <div key={idx} className="p-4 bg-white rounded-lg shadow-sm border border-purple-200">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                          <span className="text-purple-600 font-semibold text-sm">
                            {rec.recommendation_key === 'generalComments' ? '💬' :
                             rec.recommendation_key === 'supplements' ? '💊' :
                             rec.recommendation_key === 'hydration' ? '💧' :
                             rec.recommendation_key === 'sleep' ? '😴' : '📝'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-purple-800 mb-1">
                            {rec.recommendation_key === 'generalComments' ? (translations.generalComments || 'General Comments') :
                             rec.recommendation_key === 'supplements' ? (translations.supplements || 'Supplements') :
                             rec.recommendation_key === 'hydration' ? (translations.hydration || 'Hydration') :
                             rec.recommendation_key === 'sleep' ? (translations.sleep || 'Sleep') :
                             rec.recommendation_key.charAt(0).toUpperCase() + rec.recommendation_key.slice(1)}
                          </h4>
                          <p className="text-purple-700 text-sm leading-relaxed">
                            {rec.recommendation_value}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 border-red-300 ml-auto"
                            onClick={() => {
                              if (window.confirm(translations.confirmDeleteMainOption || 'Are you sure you want to delete the main option? This action cannot be undone.')) {
                                deleteMealOption(mealIdx, 'main');
                              }
                            }}
                            title={translations.deleteMainOption || 'Delete Main Option'}
                          >
                            🗑️
                          </Button>
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 border-red-300 ml-auto"
                            onClick={() => {
                              if (window.confirm(translations.confirmDeleteAlternative || 'Are you sure you want to delete the alternative option? This action cannot be undone.')) {
                                deleteMealOption(mealIdx, 'alternative');
                              }
                            }}
                            title={translations.deleteAlternative || 'Delete Alternative'}
                          >
                            🗑️
                          </Button>
                        </div>
                        {renderMealOption({ ...meal.alternative, mealIndex: mealIdx }, true)}
                      </div>
                    )}

                    {/* Render additional alternatives if present */}
                    {meal.alternatives && meal.alternatives.length > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-blue-700">{translations.otherAlternatives || 'Other Alternatives'}:</div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 border-red-300"
                            onClick={() => {
                              if (window.confirm(translations.confirmDeleteAllAlternatives || 'Are you sure you want to delete all additional alternatives? This action cannot be undone.')) {
                                deleteMealOption(mealIdx, 'alternatives');
                              }
                            }}
                            title={translations.deleteAllAlternatives || 'Delete All Additional Alternatives'}
                          >
                            🗑️ {translations.deleteAll || 'Delete All'}
                          </Button>
                        </div>
                        <div className="space-y-4">
                          {meal.alternatives.map((alt, altIdx) => (
                            <div key={altIdx} className="bg-blue-50 rounded-lg p-3 relative">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:bg-red-50 border-red-300 absolute top-2 right-2"
                                onClick={() => {
                                  if (window.confirm(translations.confirmDeleteAlternative || 'Are you sure you want to delete this alternative? This action cannot be undone.')) {
                                    // Remove this specific alternative from the alternatives array
                                    setMenu(prevMenu => {
                                      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));
                                      updatedMenu.meals[mealIdx].alternatives.splice(altIdx, 1);
                                      if (updatedMenu.meals[mealIdx].alternatives.length === 0) {
                                        delete updatedMenu.meals[mealIdx].alternatives;
                                      }
                                      updatedMenu.totals = calculateMainTotals(updatedMenu);
                                      return updatedMenu;
                                    });
                                    
                                    setOriginalMenu(prevOriginal => {
                                      if (!prevOriginal) return prevOriginal;
                                      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));
                                      updatedOriginal.meals[mealIdx].alternatives.splice(altIdx, 1);
                                      if (updatedOriginal.meals[mealIdx].alternatives.length === 0) {
                                        delete updatedOriginal.meals[mealIdx].alternatives;
                                      }
                                      updatedOriginal.totals = calculateMainTotals(updatedOriginal);
                                      return updatedOriginal;
                                    });
                                  }
                                }}
                                title={translations.deleteAlternative || 'Delete Alternative'}
                              >
                                🗑️
                              </Button>
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
        </>
      )}
      <Button onClick={() => downloadPdf(menu)}>{translations.downloadAsPdf || 'Download as PDF'}</Button>

      {/* Save Button and Cache Management (not in PDF) */}
      {menu && menu.meals && menu.meals.length > 0 && (
        <div className="flex justify-between items-center">
          {/* Cache Statistics and Auto-save indicator */}
          <div className="text-sm text-gray-600 space-y-1">
            <div>
              <span className="font-medium">{translations.upcCache || 'UPC Cache'}:</span> {upcCache.size} {translations.ingredientsStored || 'ingredients stored'}
              {upcCache.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUpcCache(new Map());
                    localStorage.removeItem('upc_cache');
                    alert(translations.upcCacheCleared || 'UPC cache cleared successfully!');
                  }}
                  className="ml-3 text-xs"
                >
                  {translations.clearCache || 'Clear Cache'}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                              <span className="text-xs text-green-600">{translations.menuAutoSaved || 'Menu auto-saved locally'}</span>
            </div>
          </div>

          {/* Save Button */}
          <Button
            onClick={() => {
              console.log('🖱️ Save button clicked!');
              if (!selectedClient) {
                alert('Please select a client before saving the menu.');
                return;
              }
              handleSave();
            }}
            disabled={saving || !selectedClient}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
          >
            {saving ? (
              <Loader className="animate-spin h-4 w-4 mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? (translations.saving || 'Saving...') : (translations.saveSchemaAndMenu || 'Save Schema & Meal Plan')}
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
            {showShoppingList ? (translations.hideShoppingList || 'Hide Shopping List') : `🛒 ${translations.showShoppingList || 'Show Shopping List'}`}
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

      {/* Ingredient Portion Dialog */}
      <IngredientPortionDialog
        isOpen={showPortionDialog}
        onClose={handleClosePortionDialog}
        onConfirm={handleConfirmPortionDialog}
        ingredient={selectedIngredientForDialog}
        translations={translations}
      />
    </div>
  );
};




async function translateMenu(menu, targetLang = 'he') {
  try {
    // Check cache first
    const cacheKey = createMenuCacheKey(menu, targetLang);
    const cachedTranslation = getCachedTranslation(cacheKey);
    
    if (cachedTranslation) {
      console.log('📚 Using cached menu translation for', targetLang);
      return cachedTranslation;
    }
    
    console.log('🌐 Fetching fresh menu translation for', targetLang);
    
    // Create a deep copy of the menu to avoid modifying the original
    const menuToTranslate = JSON.parse(JSON.stringify(menu));
    
    // Combine ingredient names with brand names for translation
    if (menuToTranslate.meals) {
      menuToTranslate.meals.forEach(meal => {
        if (meal.main && meal.main.ingredients) {
          meal.main.ingredients.forEach(ingredient => {
            if (ingredient["brand of pruduct"]) {
              ingredient.item = `${ingredient.item} (${ingredient["brand of pruduct"]})`;
            }
          });
        }
        if (meal.alternative && meal.alternative.ingredients) {
          meal.alternative.ingredients.forEach(ingredient => {
            if (ingredient["brand of pruduct"]) {
              ingredient.item = `${ingredient.item} (${ingredient["brand of pruduct"]})`;
            }
          });
        }
      });
    }

    const response = await fetch('https://dietitian-be.azurewebsites.net/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu: menuToTranslate, targetLang }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Translation failed');
    }
    
    const result = await response.json();
    
    // Cache the successful translation
    cacheTranslation(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error('Error translating menu:', error);
    
    // Try to use cached translations as fallback if available
    try {
      const fallbackCacheKey = `${CACHE_PREFIX}_${targetLang}_fallback`;
      const fallbackTranslation = getCachedTranslation(fallbackCacheKey);
      if (fallbackTranslation) {
        console.log('🔄 Using fallback cached menu translation');
        return fallbackTranslation;
      }
    } catch (fallbackError) {
      console.warn('Failed to load fallback translation:', fallbackError);
    }
    
    // Return original menu if translation fails
    return { menu: menu, error: error.message };
  }
}

export default MenuCreate;

