import React, { useState, useEffect, useCallback, useRef } from 'react';

import { Button } from '@/components/ui/button';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import { ArrowLeft, Loader, Save, Clock, Utensils, CalendarRange, ArrowRight, RefreshCw, Plus, ArrowUp, ArrowDown, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useNavigate, useLocation } from 'react-router-dom';

import { Menu } from '@/api/entities';

import { entities } from '@/api/client';

import { Badge } from '@/components/ui/badge';

import { Separator } from "@/components/ui/separator";

import { useLanguage } from '@/contexts/LanguageContext';

import { useClient } from '@/contexts/ClientContext';

import { EventBus } from '@/utils/EventBus';

import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';

import { Checkbox } from '@/components/ui/checkbox';

import { Textarea } from '@/components/ui/textarea';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Slider } from '@/components/ui/slider';



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



// Function to create cache key for measurement conversions

const createMeasurementCacheKey = (ingredient, fromMeasurement, toType, targetLang) => {

  try {

    const key = `${ingredient.item}_${fromMeasurement}_${toType}_${targetLang}`;

    return `${CACHE_PREFIX}_measurement_${btoa(key).slice(0, 40)}`;

  } catch (error) {

    console.warn('Failed to create measurement cache key:', error);

    return `${CACHE_PREFIX}_measurement_${Date.now()}`;

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



// Function to clear all translation cache (useful when generating new menu)

const clearAllTranslationCache = () => {

  try {

    let cleanedCount = 0;

    const keysToRemove = [];

    

    // Collect all cache keys first (to avoid issues with removing while iterating)

    for (let i = 0; i < localStorage.length; i++) {

      const key = localStorage.key(i);

      if (key && key.startsWith(CACHE_PREFIX)) {

        keysToRemove.push(key);

      }

    }

    

    // Remove all cache keys

    keysToRemove.forEach(key => {

      localStorage.removeItem(key);

      cleanedCount++;

    });

    

    if (cleanedCount > 0) {

      console.log(`🧹 Cleared ${cleanedCount} translation cache entries`);

    }

    

    return cleanedCount;

  } catch (error) {

    console.error('Failed to clear translation cache:', error);

    return 0;

  }

};



// Function to convert measurements using AI

const convertMeasurementWithAI = async (ingredient, fromMeasurement, toType, targetLang = 'en', client = { region: 'israel' }) => {

  try {

    // Check cache first

    const cacheKey = createMeasurementCacheKey(ingredient, fromMeasurement, toType, targetLang);

    const cachedResult = getCachedTranslation(cacheKey);



    if (cachedResult) {

      console.log('📚 Using cached measurement conversion:', cachedResult);

      return cachedResult;

    }



    console.log('🤖 Converting measurement with AI:', { ingredient: ingredient.item, fromMeasurement, toType, targetLang });



    const response = await fetch('https://dietitian-be.azurewebsites.net/api/convert-measurement', {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

      },

      body: JSON.stringify({

        ingredient: ingredient.item,

        brand: ingredient['brand of pruduct'] || '',

        fromMeasurement,

        toType, // 'grams' or 'household'

        targetLang,

        region: (client && client.region) ? client.region : 'israel'

      })

    });



    if (!response.ok) {

      const errorText = await response.text();

      console.error('❌ Measurement conversion API error:', errorText);

      throw new Error(`Failed to convert measurement: ${response.status} ${errorText}`);

    }



    const result = await response.json();

    console.log('✅ AI measurement conversion result:', result);



    // Cache the successful conversion

    cacheTranslation(cacheKey, result);



    return result;

  } catch (error) {

    console.error('❌ Error in measurement conversion:', error);

    throw error;

  }

};



// Clean expired cache on module load

cleanExpiredCache();



const EditableTitle = ({ value, onChange, mealIndex, optionIndex, alternativeIndex }) => {

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

    onChange(editValue, mealIndex, optionIndex, alternativeIndex);

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



const EditableIngredient = ({ value, onChange, mealIndex, optionIndex, ingredientIndex, alternativeIndex, translations, currentIngredient, onPortionDialog, autoFocus, forceShowAbove = false }) => {

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

  const [isConverting, setIsConverting] = useState(false);

  const [conversionMessage, setConversionMessage] = useState('');

  const [isCancelled, setIsCancelled] = useState(false);

  const [pendingSuggestion, setPendingSuggestion] = useState(null);

  const inputRef = React.useRef(null);

  const searchTimeoutRef = React.useRef(null);

  const [showAbove, setShowAbove] = useState(false);

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



  const checkDropdownPosition = () => {

    if (inputRef.current) {

      const rect = inputRef.current.getBoundingClientRect();

      const spaceBelow = window.innerHeight - rect.bottom;

      const spaceAbove = rect.top;

      console.log('🔍 Position check:', { spaceBelow, spaceAbove, rect, forceShowAbove });

      // If forced to show above OR there's less than 400px below, show above

      setShowAbove(forceShowAbove || spaceBelow < 400);

    }

  };



  useEffect(() => {

    return () => {

      if (searchTimeoutRef.current) {

        clearTimeout(searchTimeoutRef.current);

      }

    };

  }, []);



  useEffect(() => {

    if (showSuggestions) {

      checkDropdownPosition();

    }

  }, [showSuggestions]);



  useEffect(() => {

    if (showSuggestions) {

      const handleScroll = () => {

        setTimeout(() => checkDropdownPosition(), 10);

      };

      window.addEventListener('scroll', handleScroll);

      return () => {

        window.removeEventListener('scroll', handleScroll);

      };

    }

  }, [showSuggestions]);



  const fetchSuggestions = async (query, page = 1, append = false) => {

    if (query.length < 2) {

      setSuggestions([]);

      setHasMore(false);

      return;

    }



    setIsLoading(true);

    try {

      console.log('🔍 Fetching suggestions from ingridientsroee table for query:', query);

      

      // Import supabase client
      const { supabase } = await import('@/lib/supabase');

      // Split query into individual words for better matching
      const queryWords = query.trim().split(/\s+/).filter(word => word.length > 0);
      console.log('🔍 Query words:', queryWords);

      // Build search conditions - run multiple queries to catch different patterns
      let allData = [];

      if (queryWords.length === 1) {
        // Single word: prioritize items that start with it, then contain it
        const word = queryWords[0];
        const startsWithPattern = `${word}%`;
        const containsPattern = `%${word}%`;
        
        console.log('🎯 Query 1: items that START with the word');
        const { data: startsWithData, error: startsWithError } = await supabase
          .from('ingridientsroee')
          .select('id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g')
          .or([
            `name.ilike.${startsWithPattern}`,
            `english_name.ilike.${startsWithPattern}`
          ].join(','))
          .limit(50);

        if (startsWithError) {
          console.error('❌ Supabase error (starts with):', startsWithError);
        } else if (startsWithData) {
          console.log(`✅ Found ${startsWithData.length} items that START with the word`);
          allData = startsWithData;
        }
        
        // Also get items that contain the word (if we need more results)
        if (allData.length < 20) {
          console.log('🔍 Query 2: items that CONTAIN the word');
          const { data: containsData, error: containsError } = await supabase
            .from('ingridientsroee')
            .select('id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g')
            .or([
              `name.ilike.${containsPattern}`,
              `english_name.ilike.${containsPattern}`
            ].join(','))
            .limit(50);

          if (containsError) {
            console.error('❌ Supabase error (contains):', containsError);
          } else if (containsData) {
            console.log(`✅ Found ${containsData.length} items that CONTAIN the word`);
            const existingIds = new Set(allData.map(item => item.id));
            const newItems = containsData.filter(item => !existingIds.has(item.id));
            allData = [...allData, ...newItems];
          }
        }
      } else {
        // Multi-word: Search for items containing ALL words (in any order, any position)
        console.log('🔍 Searching for items containing ALL words');
        const wordsConditions = [];
        queryWords.forEach((word) => {
          const containsPattern = `%${word}%`;
          wordsConditions.push(
            `name.ilike.${containsPattern}`,
            `english_name.ilike.${containsPattern}`
          );
        });
        
        // Fetch items that contain at least one of the words
        const { data: wordsData, error: wordsError } = await supabase
          .from('ingridientsroee')
          .select('id, name, english_name, calories_energy, protein_g, fat_g, carbohydrates_g')
          .or(wordsConditions.join(','))
          .limit(200); // Get many results to filter properly

        if (wordsError) {
          console.error('❌ Supabase error:', wordsError);
        } else if (wordsData) {
          console.log(`✅ Found ${wordsData.length} items (before filtering for all words)`);
          
          // Filter to only include items that have ALL words (in either name or english_name, or both combined)
          const filteredWordsData = wordsData.filter(item => {
            const hebrewName = (item.name || '').toLowerCase();
            const englishName = (item.english_name || '').toLowerCase();
            const combinedText = `${hebrewName} ${englishName}`;
            
            // Check if all words are present in the combined text
            const hasAllWords = queryWords.every(word => 
              combinedText.includes(word.toLowerCase())
            );
            
            return hasAllWords;
          });
          
          console.log(`🔎 After filtering for ALL words: ${filteredWordsData.length} items`);
          allData = filteredWordsData;
        }
      }

      const data = allData;
      console.log(`📋 Total raw ingredients data received: ${data.length} items`);

      // Apply ranking and sorting to the results
      const rankedData = data.map(ingredient => {
        const hebrewName = (ingredient.name || '').toLowerCase();
        const englishName = (ingredient.english_name || '').toLowerCase();
        const queryLower = query.toLowerCase();
        const queryWordsLower = queryWords.map(w => w.toLowerCase());
        
        let score = 0;
        let matchedInEnglish = false;
        let matchedInHebrew = false;
        
        // Helper function to check if query matches in a name
        const checkMatch = (fullName, isEnglish) => {
          if (!fullName) return 0;
          
          let localScore = 0;
          
          // Exact match gets highest score
          if (fullName === queryLower) {
            if (isEnglish) matchedInEnglish = true;
            else matchedInHebrew = true;
            return 10000;
          }
          
          // Starts with query gets very high score (THIS IS KEY!)
          if (fullName.startsWith(queryLower)) {
            if (isEnglish) matchedInEnglish = true;
            else matchedInHebrew = true;
            return 9000;
          }
          
          // Check if first word exactly matches the search term
          const words = fullName.split(' ');
          const firstWord = words[0];
          if (queryWordsLower.length === 1 && firstWord === queryWordsLower[0]) {
            if (isEnglish) matchedInEnglish = true;
            else matchedInHebrew = true;
            return 8500;
          }
          
          // For multi-word searches, check if phrase appears at start
          if (queryWordsLower.length > 1) {
            const queryPhrase = queryWordsLower.join(' ');
            
            if (fullName.startsWith(queryPhrase)) {
              if (isEnglish) matchedInEnglish = true;
              else matchedInHebrew = true;
              return 8800;
            }
            
            // Check if first N words match
            if (words.length >= queryWordsLower.length) {
              let allFirstWordsMatch = true;
              for (let i = 0; i < queryWordsLower.length; i++) {
                if (words[i] !== queryWordsLower[i]) {
                  allFirstWordsMatch = false;
                  break;
                }
              }
              if (allFirstWordsMatch) {
                if (isEnglish) matchedInEnglish = true;
                else matchedInHebrew = true;
                return 8700;
              }
            }
            
            // Phrase appears somewhere in the name
            if (fullName.includes(queryPhrase)) {
              if (isEnglish) matchedInEnglish = true;
              else matchedInHebrew = true;
              return 5000;
            }
          }
          
          // Contains exact query (but not at start)
          if (fullName.includes(queryLower)) {
            if (isEnglish) matchedInEnglish = true;
            else matchedInHebrew = true;
            return 3000;
          }
          
          // Multi-word matching: all words present
          const allWordsPresent = queryWordsLower.every(word => fullName.includes(word));
          if (allWordsPresent) {
            if (isEnglish) matchedInEnglish = true;
            else matchedInHebrew = true;
            localScore += 2000;
            
            // Bonus for words being close together
            const queryPhrase = queryWordsLower.join(' ');
            if (fullName.includes(queryPhrase)) {
              localScore += 1000;
            }
            
            // Bonus for words in order
            let wordsInOrder = true;
            let lastIndex = -1;
            for (const word of queryWordsLower) {
              const currentIndex = fullName.indexOf(word);
              if (currentIndex <= lastIndex) {
                wordsInOrder = false;
                break;
              }
              lastIndex = currentIndex;
            }
            if (wordsInOrder) {
              localScore += 500;
            }
            return localScore;
          }
          
          // Individual word matches (partial matches, lower priority)
          queryWordsLower.forEach((word) => {
            const wordIndex = words.indexOf(word);
            
            if (wordIndex === 0) {
              if (isEnglish) matchedInEnglish = true;
              else matchedInHebrew = true;
              localScore += 1000;
            } else if (wordIndex > 0) {
              if (isEnglish) matchedInEnglish = true;
              else matchedInHebrew = true;
              localScore += 500;
            } else if (fullName.includes(word)) {
              if (isEnglish) matchedInEnglish = true;
              else matchedInHebrew = true;
              localScore += 100;
            }
          });
          
          return localScore;
        };
        
        // Detect if query is in Hebrew or English
        const isHebrewQuery = /[\u0590-\u05FF]/.test(query);
        
        // Check both names
        const englishScore = checkMatch(englishName, true);
        const hebrewScore = checkMatch(hebrewName, false);
        
        // Use the best score
        score = Math.max(englishScore, hebrewScore);
        
        // Determine which language to display based on which matched better
        // If query is in Hebrew and Hebrew matched, prefer Hebrew
        // If query is in English and English matched, prefer English
        let preferEnglish = false;
        if (isHebrewQuery) {
          // For Hebrew queries, prefer Hebrew unless English is significantly better
          preferEnglish = englishScore > hebrewScore && matchedInEnglish && !matchedInHebrew;
        } else {
          // For English queries, prefer English unless Hebrew is significantly better
          preferEnglish = (englishScore >= hebrewScore && matchedInEnglish) || !matchedInHebrew;
        }
        
        return { 
          ...ingredient, 
          _searchScore: score,
          _preferEnglish: preferEnglish 
        };
      });

      // Sort by search score (highest first), then by name
      rankedData.sort((a, b) => {
        if (b._searchScore !== a._searchScore) {
          return b._searchScore - a._searchScore;
        }
        // Secondary sort by name
        const aName = a._preferEnglish ? (a.english_name || a.name || '') : (a.name || a.english_name || '');
        const bName = b._preferEnglish ? (b.english_name || b.name || '') : (b.name || b.english_name || '');
        return aName.localeCompare(bName);
      });

      console.log('📊 Ranked data:', rankedData.map(item => ({ 
        name: item._preferEnglish ? (item.english_name || item.name) : (item.name || item.english_name), 
        score: item._searchScore,
        preferEnglish: item._preferEnglish
      })));

      // Transform the ranked data to match the expected suggestion format
      // Show results in the language that matched the query
      const suggestions = rankedData.map(ingredient => {
        const displayName = ingredient._preferEnglish 
          ? (ingredient.english_name || ingredient.name || '')
          : (ingredient.name || ingredient.english_name || '');
        
        return {
          english: ingredient.english_name || ingredient.name || '',
          hebrew: displayName, // Use displayName for the main display
          gtinUpc: null,
          household_measure: '',
          'portionSI(gram)': 100, // Default to 100g per portion
          calories: ingredient.calories_energy || 0,
          protein: ingredient.protein_g || 0,
          fat: ingredient.fat_g || 0,
          carbs: ingredient.carbohydrates_g || 0,
          brand: '',
          full_name: displayName
        };
      });

      console.log('📋 Transformed suggestions:', suggestions);

      

      if (append) {

        setSuggestions(prev => [...prev, ...suggestions]);

      } else {

        setSuggestions(suggestions);

      }

      

      // Check if there are more results (simple pagination check)
      setHasMore(data.length === 10);

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

      setIsCancelled(true);

      setEditValue(originalValue);

      setIsEditing(false);

      setShowSuggestions(false);

      setSuggestions([]);

    } else if (e.key === 'Enter') {

      console.log('↵ Enter pressed');

      setIsCancelled(false);

      // If there's a pending suggestion, confirm it; otherwise save direct edit

      if (pendingSuggestion) {

        confirmPendingSuggestion();

      } else {

        handleDirectEdit();

      }

    }

  };



  const handleBlur = () => {

    console.log('👋 Input blurred, isCancelled:', isCancelled, 'pendingSuggestion:', pendingSuggestion);

    // If user cancelled (pressed Escape), don't save any changes

    if (isCancelled) {

      console.log('👋 User cancelled, reverting to original value:', originalValue);

      setEditValue(originalValue);

      setPendingSuggestion(null); // Clear any pending suggestion

      setIsCancelled(false); // Reset the flag

    } else if (pendingSuggestion) {

      console.log('👋 Confirming pending suggestion on blur');

      confirmPendingSuggestion();

    } else if (!suggestionSelected) {

      console.log('👋 No suggestion selected, reverting to original value:', originalValue);

      setEditValue(originalValue);

    }

    setIsEditing(false);

    setShowSuggestions(false);

    setSuggestions([]);

    setSuggestionSelected(false);

  };



  const confirmPendingSuggestion = () => {
    if (pendingSuggestion) {
      console.log('✅ Confirming pending suggestion:', pendingSuggestion);
      onChange(pendingSuggestion, mealIndex, optionIndex, ingredientIndex, alternativeIndex);
      setPendingSuggestion(null);
    }
  };

  const handleDirectEdit = async () => {

    console.log('✏️ Saving direct edit:', editValue);



    let finalValues = {

      item: editValue,

      household_measure: currentIngredient?.household_measure || '',

      calories: currentIngredient?.calories || 0,

      protein: currentIngredient?.protein || 0,

      fat: currentIngredient?.fat || 0,

      carbs: currentIngredient?.carbs || 0,

      'brand of pruduct': currentIngredient?.['brand of pruduct'] || '',

      UPC: currentIngredient?.UPC || currentIngredient?.gtinUpc || null,

      'portionSI(gram)': currentIngredient?.['portionSI(gram)'] || null

    };



    // Check if the user entered a measurement in the ingredient name (e.g., "1 cup rice" or "200g chicken")

    const measurementMatch = editValue.match(/(\d+(?:\.\d+)?)\s*(g|kg|cup|cups|tbsp|tbsp|oz|lb|ml|l|glass|glasses|slice|slices|piece|pieces|clove|cloves|head|heads)/i);



    if (measurementMatch && !isConverting) {

      const amount = measurementMatch[1];

      const unit = measurementMatch[2].toLowerCase();



      try {

        setIsConverting(true);

        setConversionMessage('🤖 Analyzing measurement in ingredient name...');



        // Check if it's a weight measurement or volume measurement

        const isWeight = ['g', 'kg', 'oz', 'lb'].includes(unit);



        if (isWeight) {

          // It's a weight measurement, extract the base ingredient name

          const baseIngredient = editValue.replace(/\s*\d+(?:\.\d+)?\s*(g|kg|oz|lb)/i, '').trim();

          finalValues.item = baseIngredient;

          finalValues['portionSI(gram)'] = unit === 'kg' ? parseFloat(amount) * 1000 :

                                          unit === 'oz' ? parseFloat(amount) * 28.35 :

                                          unit === 'lb' ? parseFloat(amount) * 453.59 :

                                          parseFloat(amount);

          setConversionMessage(`✅ Extracted ${finalValues['portionSI(gram)']}g from "${editValue}"`);

        } else {

          // It's a household measurement, try to convert to grams

          const baseIngredient = editValue.replace(/\s*\d+(?:\.\d+)?\s*(cup|cups|tbsp|tbsp|ml|l|glass|glasses|slice|slices|piece|pieces|clove|cloves|head|heads)/i, '').trim();

          finalValues.item = baseIngredient;

          finalValues.household_measure = `${amount} ${unit}`;



          const conversionResult = await convertMeasurementWithAI(

            { item: baseIngredient, 'brand of pruduct': currentIngredient?.['brand of pruduct'] || '' },

            finalValues.household_measure,

            'grams',

            language,

            selectedClient

          );



          if (conversionResult && conversionResult.converted_measurement) {

            finalValues['portionSI(gram)'] = conversionResult.converted_measurement;

            setConversionMessage(`✅ "${finalValues.household_measure}" = ${conversionResult.converted_measurement}g`);

          }

        }

      } catch (conversionError) {

        console.warn('⚠️ AI conversion failed for direct edit:', conversionError);

        setConversionMessage('⚠️ Using manual entry');

      } finally {

        setTimeout(() => {

          setConversionMessage('');

          setIsConverting(false);

        }, 2000);

      }

    }



    onChange(finalValues, mealIndex, optionIndex, ingredientIndex, alternativeIndex);

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

      setIsConverting(true);

      setConversionMessage('🤖 Analyzing ingredient data...');



      // Since we already have the nutrition data from the ingredients table in the suggestion,
      // we don't need to make another API call
      const nutritionData = {
        Energy: suggestion.calories || 0,
        Protein: suggestion.protein || 0,
        Total_lipid__fat_: suggestion.fat || 0,
        Carbohydrate__by_difference: suggestion.carbs || 0,
        brand: suggestion.brand || '',
        gtinUpc: suggestion.gtinUpc || null
      };

      console.log('📊 Using nutrition data from ingredients table:', nutritionData);

      console.log('🔍 Suggestion data:', suggestion);



      // Check if we need AI measurement conversion

      let finalHouseholdMeasure = suggestion.household_measure || '';

      let finalPortionGrams = null;



      // If suggestion has a household measure but no portion grams, try to convert

      if (suggestion.household_measure && !suggestion['portionSI(gram)']) {

        try {

          setConversionMessage(`🤖 Converting "${suggestion.household_measure}" to grams...`);

          console.log('🤖 Attempting AI conversion for household measure:', suggestion.household_measure);



          const conversionResult = await convertMeasurementWithAI(

            { item: suggestion.english, 'brand of pruduct': suggestion.brand },

            suggestion.household_measure,

            'grams',

            language,

            selectedClient

          );



          if (conversionResult && conversionResult.converted_measurement) {

            finalPortionGrams = conversionResult.converted_measurement;

            console.log(`✅ AI converted ${suggestion.household_measure} to ${finalPortionGrams}g`);

            setConversionMessage(`✅ Converted to ${finalPortionGrams}g`);

          }

        } catch (conversionError) {

          console.warn('⚠️ AI conversion failed, using original data:', conversionError);

          setConversionMessage('⚠️ Using standard portion data');

        }

      }

      // If suggestion has grams but no household measure, try to convert the other way

      else if (suggestion['portionSI(gram)'] && !suggestion.household_measure) {

        try {

          setConversionMessage(`🤖 Converting ${suggestion['portionSI(gram)']}g to household measure...`);

          console.log('🤖 Attempting AI conversion for grams:', suggestion['portionSI(gram)']);



          const conversionResult = await convertMeasurementWithAI(

            { item: suggestion.english, 'brand of pruduct': suggestion.brand },

            `${suggestion['portionSI(gram)']}g`,

            'household',

            language,

            selectedClient

          );



          if (conversionResult && conversionResult.converted_measurement) {

            finalHouseholdMeasure = conversionResult.converted_measurement;

            console.log(`✅ AI converted ${suggestion['portionSI(gram)']}g to "${finalHouseholdMeasure}"`);

            setConversionMessage(`✅ Converted to "${finalHouseholdMeasure}"`);

          }

        } catch (conversionError) {

          console.warn('⚠️ AI conversion failed, using original data:', conversionError);

          setConversionMessage('⚠️ Using standard portion data');

        }

      }



      const updatedValues = {

        item: suggestion.hebrew || suggestion.english,

        household_measure: finalHouseholdMeasure,

        calories: nutritionData.Energy || 0,

        protein: nutritionData.Protein || 0,

        fat: nutritionData.Total_lipid__fat_ || 0,

        carbs: nutritionData.Carbohydrate__by_difference || 0,

        'brand of pruduct': nutritionData.brand || '',

        UPC: suggestion.gtinUpc || nutritionData.gtinUpc || null,

        'portionSI(gram)': finalPortionGrams || suggestion['portionSI(gram)'] || null

      };

      

      console.log('✅ Updated values with AI conversion:', updatedValues);

      console.log('🔍 Final UPC value:', updatedValues.UPC);



      // Store the suggestion for confirmation instead of immediately saving

      setPendingSuggestion(updatedValues);

      setEditValue(suggestion.hebrew || suggestion.english);

      setSuggestionSelected(true);

      setShowSuggestions(false);

      setIsEditing(false);

      setIsCancelled(false); // Reset cancel flag when suggestion is selected



      // Clear conversion message after a delay

      setTimeout(() => {

        setConversionMessage('');

        setIsConverting(false);

      }, 2000);



      // Then trigger the portion dialog if no automatic conversion was made

      if (onPortionDialog && !finalPortionGrams && !finalHouseholdMeasure) {

        onPortionDialog(updatedValues, mealIndex, optionIndex, ingredientIndex, alternativeIndex);

      }

    } catch (error) {

      console.error('❌ Error in handleSelect:', error);

      console.error('❌ Error stack:', error.stack);

      setConversionMessage('❌ Error occurred');

      setIsConverting(false);

    }

  };



  const startEditing = () => {

    console.log('✏️ Starting edit mode for value:', value);

    setOriginalValue(value); // Store the current value as original

    setEditValue(value);

    setIsEditing(true);

    setSuggestions([]);

    setShowSuggestions(false);

    setIsCancelled(false); // Reset cancel flag when starting to edit

    setPendingSuggestion(null); // Clear any pending suggestion

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

          {currentIngredient && currentIngredient["brand of pruduct"] && shouldShowBrand(currentIngredient["brand of pruduct"]) && (

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

          // Check position when focusing

          setTimeout(() => checkDropdownPosition(), 10);

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



      {/* AI Conversion Status */}

      {isConverting && (

        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-2">

          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>

          <span className="text-xs text-purple-600 font-medium">{conversionMessage}</span>

        </div>

      )}



            {console.log('🔍 Rendering suggestions:', { showSuggestions, suggestionsCount: suggestions.length, suggestions, isLoading })}

      {showSuggestions && (

        <div 
          className={`absolute z-50 bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden animate-fade-in min-w-max max-w-[420px] w-auto ${showAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`} 
          style={{minWidth: 220}}
        >

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



const RecommendationForm = ({ recommendation, onSave, onCancel, translations }) => {

  const [formData, setFormData] = useState({

    id: recommendation?.id || Date.now(),

    category: recommendation?.category || 'general',

    title: recommendation?.title || '',

    content: recommendation?.content || '',

    priority: recommendation?.priority || 'medium'

  });



  useEffect(() => {

    if (recommendation) {

      setFormData({

        id: recommendation.id,

        category: recommendation.category,

        title: recommendation.title,

        content: recommendation.content,

        priority: recommendation.priority

      });

    }

  }, [recommendation]);



  const handleSubmit = (e) => {

    e.preventDefault();

    if (!formData.title.trim() || !formData.content.trim()) {

      alert(translations?.pleaseFillAllFields || 'Please fill in all required fields');

      return;

    }

    onSave(formData);

  };



  const handleChange = (field, value) => {

    setFormData(prev => ({ ...prev, [field]: value }));

  };



  const categoryOptions = [

    { value: 'general', label: translations?.generalRecommendation || 'General' },

    { value: 'nutrition', label: translations?.nutritionRecommendation || 'Nutrition' },

    { value: 'exercise', label: translations?.exerciseRecommendation || 'Exercise' },

    { value: 'lifestyle', label: translations?.lifestyleRecommendation || 'Lifestyle' },

    { value: 'supplements', label: translations?.supplementsRecommendation || 'Supplements' },

    { value: 'hydration', label: translations?.hydrationRecommendation || 'Hydration' },

    { value: 'sleep', label: translations?.sleepRecommendation || 'Sleep' }

  ];



  const priorityOptions = [

    { value: 'low', label: translations?.lowPriority || 'Low Priority' },

    { value: 'medium', label: translations?.mediumPriority || 'Medium Priority' },

    { value: 'high', label: translations?.highPriority || 'High Priority' }

  ];



  return (

    <form onSubmit={handleSubmit} className="space-y-4">

      <div className="grid grid-cols-2 gap-4">

        <div>

          <Label htmlFor="category" className="text-sm font-medium text-gray-700">

            {translations?.category || 'Category'}

          </Label>

          <Select value={formData.category} onValueChange={(value) => handleChange('category', value)}>

            <SelectTrigger className="mt-1">

              <SelectValue />

            </SelectTrigger>

            <SelectContent>

              {categoryOptions.map(option => (

                <SelectItem key={option.value} value={option.value}>

                  {option.label}

                </SelectItem>

              ))}

            </SelectContent>

          </Select>

        </div>

        

        <div>

          <Label htmlFor="priority" className="text-sm font-medium text-gray-700">

            {translations?.priority || 'Priority'}

          </Label>

          <Select value={formData.priority} onValueChange={(value) => handleChange('priority', value)}>

            <SelectTrigger className="mt-1">

              <SelectValue />

            </SelectTrigger>

            <SelectContent>

              {priorityOptions.map(option => (

                <SelectItem key={option.value} value={option.value}>

                  {option.label}

                </SelectItem>

              ))}

            </SelectContent>

          </Select>

        </div>

      </div>



      <div>

        <Label htmlFor="title" className="text-sm font-medium text-gray-700">

          {translations?.title || 'Title'} *

        </Label>

        <Input

          id="title"

          value={formData.title}

          onChange={(e) => handleChange('title', e.target.value)}

          className="mt-1"

          placeholder={translations?.recommendationTitlePlaceholder || 'Enter recommendation title'}

          required

        />

      </div>



      <div>

        <Label htmlFor="content" className="text-sm font-medium text-gray-700">

          {translations?.content || 'Content'} *

        </Label>

        <Textarea

          id="content"

          value={formData.content}

          onChange={(e) => handleChange('content', e.target.value)}

          className="mt-1 min-h-[120px]"

          placeholder={translations?.recommendationContentPlaceholder || 'Enter detailed recommendation content'}

          required

        />

      </div>



      <DialogFooter className="flex gap-3 sm:gap-3">

        <Button

          type="button"

          variant="outline"

          onClick={onCancel}

          className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"

        >

          {translations?.cancel || 'Cancel'}

        </Button>

        <Button

          type="submit"

          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"

        >

          {translations?.save || 'Save'}

        </Button>

      </DialogFooter>

    </form>

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



  // AI Conversion: Convert grams to household measure

  const convertGramsToHousehold = async () => {

    if (!gramAmount || !ingredient) return;



    try {

      setIsAIConverting(true);

      setAiConversionMessage('🤖 Converting to household measure...');



      const conversionResult = await convertMeasurementWithAI(

        ingredient,

        `${gramAmount}g`,

        'household',

        'en' // Use English for API consistency - no client needed for basic conversion

      );



      if (conversionResult && conversionResult.converted_measurement) {

        setHouseholdMeasure(conversionResult.converted_measurement);

        setAiConversionMessage(`✅ Converted to "${conversionResult.converted_measurement}"`);

        console.log(`✅ AI converted ${gramAmount}g to "${conversionResult.converted_measurement}"`);

      } else {

        setAiConversionMessage('⚠️ Could not determine household measure');

      }

    } catch (error) {

      console.error('❌ Error converting grams to household:', error);

      setAiConversionMessage('❌ Conversion failed');

    } finally {

      setTimeout(() => {

        setAiConversionMessage('');

        setIsAIConverting(false);

      }, 3000);

    }

  };



  // AI Conversion: Convert household measure to grams

  const convertHouseholdToGrams = async () => {

    if (!householdMeasure.trim() || !ingredient) return;



    try {

      setIsAIConverting(true);

      setAiConversionMessage('🤖 Converting to grams...');



      const conversionResult = await convertMeasurementWithAI(

        ingredient,

        householdMeasure.trim(),

        'grams',

        'en' // Use English for API consistency - no client needed for basic conversion

      );



      if (conversionResult && conversionResult.converted_measurement) {

        setGramAmount(conversionResult.converted_measurement.toString());

        setAiConversionMessage(`✅ Converted to ${conversionResult.converted_measurement}g`);



        // Recalculate nutrition for the new gram amount

        handleGramAmountChange({ target: { value: conversionResult.converted_measurement.toString() } });

        console.log(`✅ AI converted "${householdMeasure}" to ${conversionResult.converted_measurement}g`);

      } else {

        setAiConversionMessage('⚠️ Could not determine gram amount');

      }

    } catch (error) {

      console.error('❌ Error converting household to grams:', error);

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

          {/* AI Conversion Status */}

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

              onKeyDown={handleKeyPress}

                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"

              placeholder="100"

              min="0"

              step="0.1"

              autoFocus

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

              onKeyDown={handleKeyPress}

                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"

              placeholder={translations?.householdMeasurePlaceholder || 'e.g., 1 cup, 2 tbsp, 1 medium apple'}

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



// Function to filter out generic brand names
const shouldShowBrand = (brand) => {
  if (!brand || typeof brand !== 'string') return false;
  
  const normalizedBrand = brand.trim().toLowerCase();
  const genericBrands = ['fresh', 'none', 'generic', 'store brand', 'private label', 'no brand', 'unbranded'];
  
  return !genericBrands.includes(normalizedBrand) && normalizedBrand.length > 0;
};

const MenuCreate = () => {

  const pdfRef = React.useRef();

  const [showShoppingList, setShowShoppingList] = useState(false);

  const [shoppingList, setShoppingList] = useState([]);

  

  // Track ongoing operations to prevent duplicates

  const ongoingOperations = React.useRef(new Set());

  

  // Ref to always have the latest originalMenu for translation

  const originalMenuRef = React.useRef(null);

  

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

      originalMenuRef.current = parsed; // Update ref with restored value

      return parsed;

    } catch (err) {

      console.warn('Failed to load originalMenu from localStorage:', err);

      localStorage.removeItem('menuCreate_originalMenu');

      return null;

    }

  });

  

  // Keep ref in sync with originalMenu state

  useEffect(() => {

    originalMenuRef.current = originalMenu;

    console.log('🔄 Updated originalMenuRef with latest menu');

  }, [originalMenu]);



  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState(null);

  const [progress, setProgress] = useState(0);

  const [progressStep, setProgressStep] = useState('');

  const [enrichingUPC, setEnrichingUPC] = useState(false);

  const [showEmptyMealPlanDialog, setShowEmptyMealPlanDialog] = useState(false);

  const [users, setUsers] = useState([]);

  const [removeBrandsFromPdf, setRemoveBrandsFromPdf] = useState(false);



  // Ingredient portion dialog state

  const [showPortionDialog, setShowPortionDialog] = useState(false);

  const [selectedIngredientForDialog, setSelectedIngredientForDialog] = useState(null);

  const [dialogIngredientContext, setDialogIngredientContext] = useState(null);



  // Use global client selection from ClientContext instead of local state

  const { selectedClient } = useClient();

  

  // Local state for number of meals (can be different from selectedClient during editing)

  const [numberOfMeals, setNumberOfMeals] = useState(() => selectedClient?.number_of_meals || 4);

  

  // Update local numberOfMeals when selectedClient changes

  useEffect(() => {

    if (selectedClient) {

      setNumberOfMeals(selectedClient.number_of_meals || 4);

      // Reset unsaved changes when client changes

      setHasUnsavedMealPlanChanges(false);

      setSavedMealPlanStructure(null);

      // Temporarily clear meal plan structure to prevent false comparisons

      setMealPlanStructure([]);

    }

  }, [selectedClient]);



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

  const { language, translations, dir } = useLanguage();

  const [generatingAlt, setGeneratingAlt] = useState({});

  

  // Meal Plan Structure state

  const getDefaultMealPlanStructure = (t, numberOfMeals = 4) => {

    const baseMeals = [

      { key: 'breakfast', meal: t.breakfast || 'Breakfast', calories_pct: 0, description: '', calories: 0, locked: false },

      { key: 'lunch', meal: t.lunch || 'Lunch', calories_pct: 0, description: '', calories: 0, locked: false },

      { key: 'dinner', meal: t.dinner || 'Dinner', calories_pct: 0, description: '', calories: 0, locked: false },

      { key: 'snacks', meal: t.snacks || 'Snack', calories_pct: 0, description: '', calories: 0, locked: false },

    ];



    // If numberOfMeals is specified and different from default, create custom structure

    if (numberOfMeals && numberOfMeals !== 4) {

      const customMeals = [];

      const mealNames = [

        t.breakfast || 'Breakfast',

        t.lunch || 'Lunch', 

        t.dinner || 'Dinner',

        t.snacks || 'Snack'

      ];

      

      // Add additional meal names for more than 4 meals

      if (numberOfMeals > 4) {

        for (let i = 4; i < numberOfMeals; i++) {

          mealNames.push(`Meal ${i + 1}`);

        }

      }

      

      // Create meals based on numberOfMeals

      for (let i = 0; i < numberOfMeals; i++) {

        const mealName = mealNames[i] || `Meal ${i + 1}`;

        const key = i < 4 ? baseMeals[i].key : `meal_${i + 1}`;

        customMeals.push({

          key,

          meal: mealName,

          calories_pct: 0,

          description: '',

          calories: 0,

          locked: false

        });

      }

      

      // Distribute calories evenly

      const caloriesPerMeal = Math.round(100 / numberOfMeals * 10) / 10;

      return customMeals.map(meal => ({

        ...meal,

        calories_pct: caloriesPerMeal

      }));

    }

    

    // Default 4-meal structure with traditional percentages

    return [

    { key: 'breakfast', meal: t.breakfast || 'Breakfast', calories_pct: 30, description: '', calories: 0, locked: false },

      { key: 'lunch', meal: t.lunch || 'Lunch', calories_pct: 30, description: '', calories: 0, locked: false },

      { key: 'dinner', meal: t.dinner || 'Dinner', calories_pct: 30, description: '', calories: 0, locked: false },

      { key: 'snacks', meal: t.snacks || 'Snack', calories_pct: 10, description: '', calories: 0, locked: false },

    ];

  };



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



  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);

  const [hasUnsavedMealPlanChanges, setHasUnsavedMealPlanChanges] = useState(false);

  const [savedMealPlanStructure, setSavedMealPlanStructure] = useState(null);

  const [updatingMealDescriptions, setUpdatingMealDescriptions] = useState(false);

  // Meal template states
  const [mealTemplates, setMealTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateFormData, setTemplateFormData] = useState({ name: '', tags: [] });
  const [showTemplateLimitationDialog, setShowTemplateLimitationDialog] = useState(false);
  const [pendingTemplateSave, setPendingTemplateSave] = useState(null);
  const [currentDietitian, setCurrentDietitian] = useState(null);

  // Get emoji for template based on name
  const getTemplateEmoji = (templateName) => {
    const name = templateName?.toLowerCase() || '';
    if (name.includes('balanced')) return '⚖️';
    if (name.includes('dairy')) return '🥛';
    if (name.includes('family')) return '👨‍👩‍👧‍👦';
    if (name.includes('gluten') && name.includes('free')) return '🌾';
    if (name.includes('high-protein')) return '💪';
    if (name.includes('kosher')) return '✡️';
    if (name.includes('lactose') && name.includes('free')) return '🧀';
    if (name.includes('meat')) return '🥩';
    if (name.includes('mediterranean')) return '🍋';
    if (name.includes('nut') && name.includes('free')) return '🥜';
    if (name.includes('quick') || name.includes('simple')) return '⚡';
    if (name.includes('vegan')) return '🌱';
    if (name.includes('vegetarian')) return '🥗';
    return '📋';
  };

  const getTemplateDisplayName = (template) => {
    if (language === 'he') {
      const hebrewName = template?.hebrew_name?.trim();
      if (hebrewName) {
        return hebrewName;
      }
    }
    return template?.name || '';
  };

  const [mealPlanStructure, setMealPlanStructure] = useState(() => {

    // Initialize with numberOfMeals if available

    const meals = numberOfMeals || selectedClient?.number_of_meals || 4;

    return getDefaultMealPlanStructure(translations, meals);

  });

  // Macro distribution state (similar to Users.jsx)
  const [macroInputs, setMacroInputs] = useState({
    protein: { percentage: 0, grams: 0, gramsPerKg: 0 },
    carbs: { percentage: 0, grams: 0, gramsPerKg: 0 },
    fat: { percentage: 0, grams: 0, gramsPerKg: 0 }
  });

  const [previousMacroDistribution, setPreviousMacroDistribution] = useState({
    protein: 30,
    carbs: 40,
    fat: 30
  });

  const [lockedMacros, setLockedMacros] = useState({
    protein: false,
    carbs: false,
    fat: false
  });

  // Function to check if there are unsaved changes to meal plan structure

  const checkForUnsavedChanges = () => {

    if (!savedMealPlanStructure || !mealPlanStructure || !Array.isArray(mealPlanStructure) || !Array.isArray(savedMealPlanStructure)) return false;

    // Ensure both structures have the same length

    if (mealPlanStructure.length !== savedMealPlanStructure.length) return false;

    // Compare current structure with saved structure

    const currentStructure = mealPlanStructure.map(meal => ({

      meal: meal.meal,

      description: meal.description,

      calories: meal.calories,

      calories_pct: meal.calories_pct

    }));

    return JSON.stringify(currentStructure) !== JSON.stringify(savedMealPlanStructure);

  };

  // Update unsaved changes state when meal plan structure changes

  useEffect(() => {

    // Don't check for changes if we're in the middle of loading a new client

    if (loadingUserTargets) {

      setHasUnsavedMealPlanChanges(false);

      return;

    }

    // Only check for unsaved changes if we have both structures and they're properly loaded

    if (savedMealPlanStructure && mealPlanStructure && Array.isArray(mealPlanStructure) && Array.isArray(savedMealPlanStructure)) {

      // Add a small delay to ensure the structure is fully updated

      const timeoutId = setTimeout(() => {

        const hasChanges = checkForUnsavedChanges();

        console.log('🔍 Checking for unsaved changes:', {

          hasChanges,

          currentLength: mealPlanStructure.length,

          savedLength: savedMealPlanStructure.length,

          current: mealPlanStructure.map(m => ({ meal: m.meal, description: m.description })),

          saved: savedMealPlanStructure.map(m => ({ meal: m.meal, description: m.description }))

        });

        setHasUnsavedMealPlanChanges(hasChanges);

      }, 200);

      return () => clearTimeout(timeoutId);

    } else {

      setHasUnsavedMealPlanChanges(false);

    }

  }, [mealPlanStructure, savedMealPlanStructure, loadingUserTargets]);



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

  const [isMealPlanMinimized, setIsMealPlanMinimized] = useState(true);

  // State for minimizing Daily Targets & Macros section
  const [isDailyTargetsMinimized, setIsDailyTargetsMinimized] = useState(true);

  // State for minimizing Recommendations section
  const [isRecommendationsMinimized, setIsRecommendationsMinimized] = useState(true);

  // State for tracking expanded description textareas
  const [expandedDescriptionIndex, setExpandedDescriptionIndex] = useState(null);
  const blurTimeoutRef = useRef(null);

  // Macro calculation functions (from Users.jsx)
  const calculateTotals = () => {
    const totalPercentage = macroInputs.protein.percentage + macroInputs.carbs.percentage + macroInputs.fat.percentage;
    const totalCalories = (macroInputs.protein.grams * 4) + (macroInputs.carbs.grams * 4) + (macroInputs.fat.grams * 9);
    return { totalPercentage, totalCalories };
  };

  const validateMacroPercentages = () => {
    const total = calculateTotals().totalPercentage;
    const dailyCalories = parseInt(userTargets?.calories_per_day) || 0;
    
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

  const toggleMacroLock = (macroType) => {
    setLockedMacros(prev => ({
      ...prev,
      [macroType]: !prev[macroType]
    }));
  };

  const calculateMacrosFromInputs = (inputType, value, macroType) => {
    const calories = parseInt(userTargets?.calories_per_day) || 0;
    const weight = parseFloat(selectedClient?.weight_kg) || 0;
    
    if (calories <= 0) return;

    let newMacros = { ...macroInputs };
    let targetPercentage = 0;
    let targetGrams = 0;
    let targetGramsPerKg = 0;
    
    // Calculate target percentage based on input type
    if (inputType === 'percentage') {
      targetPercentage = Math.max(0, Math.min(100, value));
      targetGrams = Math.round((targetPercentage / 100) * calories / (macroType === 'fat' ? 9 : 4));
      targetGramsPerKg = weight > 0 ? Math.round((targetGrams / weight) * 1000) / 1000 : 0;
    } else if (inputType === 'grams') {
      targetGrams = Math.round(value);
      targetPercentage = calories > 0 ? (targetGrams * (macroType === 'fat' ? 9 : 4) / calories) * 100 : 0;
      targetGramsPerKg = weight > 0 ? Math.round((targetGrams / weight) * 1000) / 1000 : 0;
    } else if (inputType === 'gramsPerKg') {
      // Use the direct input value for gramsPerKg to avoid recalculation issues
      targetGramsPerKg = Math.round(value * 1000) / 1000; // Round to 3 decimal places
      targetGrams = weight > 0 ? Math.round(targetGramsPerKg * weight) : 0;
      targetPercentage = calories > 0 ? (targetGrams * (macroType === 'fat' ? 9 : 4) / calories) * 100 : 0;
    }
    
    // Update the target macro
    newMacros[macroType] = {
      percentage: Math.round(targetPercentage * 1000) / 1000, // Allow 3 decimal places
      grams: targetGrams,
      gramsPerKg: targetGramsPerKg
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

  // Auto-calculate initial macros when userTargets change
  useEffect(() => {
    const calories = parseInt(userTargets?.calories_per_day) || 0;
    if (calories > 0) {
      // Check if macros are empty or significantly incorrect (less than 10% of expected values)
      const expectedProtein = Math.round((0.30 * calories) / 4);
      const expectedCarbs = Math.round((0.40 * calories) / 4);
      const expectedFat = Math.round((0.30 * calories) / 9);
      
      const isEmpty = (!macroInputs.protein.grams && !macroInputs.carbs.grams && !macroInputs.fat.grams);
      const isIncorrect = (
        macroInputs.protein.grams < expectedProtein * 0.1 ||
        macroInputs.carbs.grams < expectedCarbs * 0.1 ||
        macroInputs.fat.grams < expectedFat * 0.1
      );
      
      if (isEmpty || isIncorrect) {
        // Default distribution: 30% protein, 40% carbs, 30% fat (total: 100%)
        const defaultMacros = {
          protein: { 
            percentage: 30, 
            grams: expectedProtein, 
            gramsPerKg: 0 
          },
          carbs: { 
            percentage: 40, 
            grams: expectedCarbs, 
            gramsPerKg: 0 
          },
          fat: { 
            percentage: 30, 
            grams: expectedFat, 
            gramsPerKg: 0 
          }
        };
        
        // Calculate grams per kg if weight is available
        const weight = parseFloat(selectedClient?.weight_kg) || 0;
        if (weight > 0) {
          defaultMacros.protein.gramsPerKg = Math.round((defaultMacros.protein.grams / weight) * 1000) / 1000;
          defaultMacros.carbs.gramsPerKg = Math.round((defaultMacros.carbs.grams / weight) * 1000) / 1000;
          defaultMacros.fat.gramsPerKg = Math.round((defaultMacros.fat.grams / weight) * 1000) / 1000;
        }
        
        setMacroInputs(defaultMacros);
        
        // Set previous distribution for smart rebalancing
        setPreviousMacroDistribution({
          protein: defaultMacros.protein.percentage,
          carbs: defaultMacros.carbs.percentage,
          fat: defaultMacros.fat.percentage
        });
      }
    }
  }, [userTargets?.calories_per_day, selectedClient?.weight_kg]);

  // Initialize macros when component loads with existing userTargets
  useEffect(() => {
    if (userTargets?.calories_per_day && macroInputs.protein.grams === 0 && macroInputs.carbs.grams === 0 && macroInputs.fat.grams === 0) {
      const calories = parseInt(userTargets.calories_per_day) || 0;
      if (calories > 0) {
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
        const weight = parseFloat(selectedClient?.weight_kg) || 0;
        if (weight > 0) {
          defaultMacros.protein.gramsPerKg = Math.round((defaultMacros.protein.grams / weight) * 1000) / 1000;
          defaultMacros.carbs.gramsPerKg = Math.round((defaultMacros.carbs.grams / weight) * 1000) / 1000;
          defaultMacros.fat.gramsPerKg = Math.round((defaultMacros.fat.grams / weight) * 1000) / 1000;
        }
        
        setMacroInputs(defaultMacros);
        
        // Set previous distribution for smart rebalancing
        setPreviousMacroDistribution({
          protein: defaultMacros.protein.percentage,
          carbs: defaultMacros.carbs.percentage,
          fat: defaultMacros.fat.percentage
        });
      }
    }
  }, []); // Run once on component mount

  // Recalculate macros when daily calories change
  useEffect(() => {
    const calories = parseInt(userTargets?.calories_per_day) || 0;
    if (calories > 0 && macroInputs.protein.grams > 0) {
      // Get current percentages
      const currentPercentages = {
        protein: macroInputs.protein.percentage,
        carbs: macroInputs.carbs.percentage,
        fat: macroInputs.fat.percentage
      };
      
      // If we have existing percentages, recalculate grams based on new calories
      if (currentPercentages.protein > 0 || currentPercentages.carbs > 0 || currentPercentages.fat > 0) {
        const weight = parseFloat(selectedClient?.weight_kg) || 0;
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
        
        // Update previous distribution for smart rebalancing
        setPreviousMacroDistribution({
          protein: updatedMacros.protein.percentage,
          carbs: updatedMacros.carbs.percentage,
          fat: updatedMacros.fat.percentage
        });
      }
    }
  }, [userTargets?.calories_per_day]);

  

  // State for temporary calorie inputs (before Enter confirmation)

  const [tempCalorieInputs, setTempCalorieInputs] = useState({});

  const [calorieInputErrors, setCalorieInputErrors] = useState({});

  

  // State for recommendations

  const [recommendations, setRecommendations] = useState(() => {

    try {

      const saved = localStorage.getItem('menuCreate_recommendations');

      console.log('📋 Loading recommendations from localStorage:', saved);

      const parsed = saved ? JSON.parse(saved) : [];

      console.log('📋 Parsed recommendations:', parsed);

      return parsed;

    } catch (err) {

      console.warn('Failed to load recommendations from localStorage:', err);

      return [];

    }

  });

  

  // State for client recommendations from chat_users table

  const [clientRecommendations, setClientRecommendations] = useState([]);

  const [loadingClientRecommendations, setLoadingClientRecommendations] = useState(false);

  

  const [showRecommendationsDialog, setShowRecommendationsDialog] = useState(false);

  const [editingRecommendation, setEditingRecommendation] = useState(null);

  

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



  // Save recommendations state to localStorage whenever it changes

  useEffect(() => {

    try {

      console.log('💾 Recommendations changed, saving to localStorage:', recommendations);

      if (recommendations && recommendations.length > 0) {

        localStorage.setItem('menuCreate_recommendations', JSON.stringify(recommendations));

        console.log('✅ Recommendations saved to localStorage');

      } else {

        localStorage.removeItem('menuCreate_recommendations');

        console.log('🗑️ Recommendations removed from localStorage');

      }

    } catch (err) {

      console.warn('Failed to save recommendations to localStorage:', err);

    }

  }, [recommendations]);



  // Auto-calculate meal calories when total calories change

  useEffect(() => {

    if (userTargets?.calories_per_day || userTargets?.calories) {

      const updatedMealStructure = calculateMealCalories(mealPlanStructure, userTargets.calories_per_day || userTargets.calories);

      setMealPlanStructure(updatedMealStructure);

    }

  }, [userTargets?.calories_per_day, userTargets?.calories]);



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

    // Get current date in appropriate language

    const today = new Date();

    const hebrewDate = today.toLocaleDateString('he-IL', { 

      year: 'numeric', 

      month: 'long', 

      day: 'numeric' 

    });

    const englishDate = today.toLocaleDateString('en-US', { 

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

    <title>BetterChoice - ${hasHebrewContent ? 'תפריט אישי' : 'Personal Meal Plan'}</title>

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

            display: flex;

            flex-direction: column;

        }

        

        .header {

            background: #e8f5e8;

            padding: 4px 8px;

            text-align: center;

            position: relative;

        }

        


        

        .header-top {

            display: flex;

            justify-content: space-between;

            align-items: flex-start;

            margin-bottom: 5px;

        }

        .title-section {

            display: flex;

            flex-direction: column;

            align-items: flex-start;

        }

        .main-title {

            font-size: 14px;

            font-weight: 700;

            color: #333;

            margin: 0;

        }

        .logo {

            position: absolute;

            top: 4px;

            left: 50%;

            transform: translateX(-50%);

            width: 16px;

            height: 16px;

            background: #4CAF50;

            border-radius: 50%;

            display: flex;

            align-items: center;

            justify-content: center;

            color: white;

            font-weight: bold;

            font-size: 8px;

        }

        .date {

            font-size: 8px;

            font-weight: 500;

            color: #666;

            margin: 0;

        }

        

        .user-name {

            font-size: 10px;

            font-weight: 600;

            color: #4CAF50;

            margin: 0;

        }

        


        

        .content {

            flex: 1;

            padding: 10px 15px;

        }

        

        .meal-section {

            margin-bottom: 8px;

            page-break-inside: avoid;

            break-inside: avoid;

            page-break-before: auto;

            page-break-after: avoid;

        }

        

        .meal-title {

            font-size: 24px;

            font-weight: 700;

            color: #2d5016;

            text-align: ${hasHebrewContent ? 'right' : 'left'};

            margin-bottom: 6px;

            padding-bottom: 3px;

            border-bottom: 1.5px solid #4CAF50;

            background-color: #f0f8f0;

            padding: 5px 8px;

            border-radius: 4px;

        }

        

        .meal-subtitle {

            font-size: 20px;

            font-weight: 600;

            color: #4CAF50;

            text-align: ${hasHebrewContent ? 'right' : 'left'};

            margin-bottom: 4px;

        }

        

        .meal-options {

            margin-right: 20px;

        }

        

        .meal-option {

            margin-bottom: 4px;

            font-size: 20px;

            line-height: 1.3;

            padding-left: 14px;

            padding-right: 14px;

            position: relative;

        }

        

        .meal-option::before {

            content: '•';

            color: #4CAF50;

            font-weight: bold;

            position: absolute;

            left: 0;

            top: 0;

            font-size: 14px;

        }

        

        [dir="rtl"] .meal-option {

            padding-left: 0;

            padding-right: 14px;

        }

        

        [dir="rtl"] .meal-option::before {

            left: auto;

            right: 0;

        }

        

        .option-text {

            color: #333;

        }

        

        .highlighted {

            text-decoration: underline;

            text-decoration-color: #ff4444;

            text-decoration-thickness: 2px;

        }

        

        .meal-dish-title {

            font-weight: 700;

            color: #4CAF50;

            font-size: 20px;

            margin-bottom: 2px;

            text-decoration: underline;

        }

        

        .bold-note {

            font-weight: 700;

            color: #333;

        }

        

        .footer {

            background: #e8f5e8;

            padding: 8px 15px;

            text-align: center;

        }

        

        .contact-info {

            color: #333;

            font-size: 10px;

            line-height: 1.4;

            text-align: center;

            display: flex;

            justify-content: center;

            align-items: center;

            gap: 20px;

            flex-wrap: wrap;

        }

        

        .contact-info div {

            margin: 0;

            white-space: nowrap;

        }

        

        @media print {

            /* ${version === 'landscape' ? 'Set to A4 landscape with 10mm margins' : 'Disable browser headers and footers'} */
            
            /* Better page break control for meal sections */
            .meal-section {
                orphans: 3;
                widows: 3;
            }

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

            /* Portrait-specific: Fixed footer at bottom of first page */

            .page {

                display: block !important;

                min-height: auto !important;

                position: relative;

            }

            

            .content {

                display: block !important;

                page-break-after: auto;

                padding-bottom: 30px !important;

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

                padding: 6px 8px;

            }

            

            .logo {

                width: 18px;

                height: 18px;

                font-size: 9px;

                margin-bottom: 0;

                top: 6px;

            }

            

            .main-title {

                font-size: 16px;

                margin-bottom: 2px;

            }

            

            .user-name {

                font-size: 12px;

                margin-bottom: 2px;

            }

            

            .date {

                font-size: 10px;

                margin-bottom: 0;

            }

            

            .content {

                padding: ${version === 'landscape' ? '6px 15px' : '8px 12px'};

                ${version === 'landscape' ? 'display: flex; flex-wrap: wrap; gap: 12px;' : ''}

            }

            

            .meal-title {

                font-size: 20px;

                margin-bottom: 3px;

                padding: 3px 6px;

            }

            

            .meal-subtitle {

                font-size: 11px;

                margin-bottom: 2px;

            }

            

            .meal-option {

                font-size: 11px;

                margin-bottom: 2px;

                padding-left: 12px;

                padding-right: 12px;

                line-height: 1.25;

            }

            

            [dir="rtl"] .meal-option {

                padding-left: 0;

                padding-right: 12px;

            }

            

            .meal-option::before {

                font-size: 17px;

            }

            

            [dir="rtl"] .meal-option::before {

                left: auto;

                right: 0;

            }

            

            .footer {

                padding: 4px 10px;

            }

            

            .contact-info {

                font-size: 8px;

                gap: 12px;

            }

            

            .meal-dish-title {

                font-size: 12px;

                margin-bottom: 1px;

            }

            

            /* Keep meal sections together but allow natural flow */

            .meal-section {

                page-break-inside: avoid;

                break-inside: avoid;

                page-break-before: auto;

                page-break-after: avoid;

                margin-bottom: 5px;

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

            <div class="header-top">

                <div class="title-section">

                    <div class="main-title">${hasHebrewContent ? 'תפריט אישי' : 'Personal Meal Plan'}</div>

                    <div class="user-name">${userName}</div>

                </div>

                <div class="date">${hasHebrewContent ? hebrewDate : englishDate}</div>

            </div>

        </div>

        

        <div class="content">

            ${menu.meals ? menu.meals.map((meal, index) => {

                // Get meal name in Hebrew or English

                const mealName = meal.meal || `Meal ${index + 1}`;

                const isSnack = mealName.toLowerCase().includes('snack') || mealName.toLowerCase().includes('ביניים');

                

                return `

                    <div class="meal-section">

                        <h2 class="meal-title">${mealName}</h2>

                        ${isSnack ? `<div class="meal-subtitle">${hasHebrewContent ? 'לבחירתך מתי' : 'Choose when'}</div>` : ''}

                        

                        <div class="meal-options">

                            ${(() => {

                                let options = [];

                                

                                // Add main meal

                                if (meal.main && meal.main.ingredients && meal.main.ingredients.length > 0) {

                                    const mainMealTitle = meal.main.meal_title || '';

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

                                    const mealTitleText = mainMealTitle ? `<div class="meal-dish-title">${mainMealTitle}</div>` : '';

                                    options.push(`<div class="meal-option"><span class="option-text">${mealTitleText}${mainIngredients}</span></div>`);

                                }

                                

                                // Add alternative meal

                                if (meal.alternative && meal.alternative.ingredients && meal.alternative.ingredients.length > 0) {

                                    const altMealTitle = meal.alternative.meal_title || '';

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

                                    const altMealTitleText = altMealTitle ? `<div class="meal-dish-title">${altMealTitle}</div>` : '';

                                    options.push(`<div class="meal-option"><span class="option-text">${altMealTitleText}${altIngredients}</span></div>`);

                                }

                                

                                // Add additional alternatives

                                if (meal.alternatives && meal.alternatives.length > 0) {

                                    meal.alternatives.forEach(alt => {

                                        if (alt.ingredients && alt.ingredients.length > 0) {

                                            const additionalAltMealTitle = alt.meal_title || '';

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

                                            

                                            // Include meal title if available

                                            const additionalAltMealTitleText = additionalAltMealTitle ? `<div class="meal-dish-title">${additionalAltMealTitle}</div>` : '';

                                            options.push(`<div class="meal-option"><span class="option-text">${additionalAltMealTitleText}${altIngredients}</span></div>`);

                                        }

                                    });

                                }

                                

                                // Add special note for lunch if it exists

                                if (mealName.toLowerCase().includes('lunch') || mealName.toLowerCase().includes('צהרים')) {

                                   
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

                <div>${hasHebrewContent ? 'כתובת: משכית 10, הרצליה' : 'Address: Maskit 10, Herzliya'}</div>

                <div>${hasHebrewContent ? 'מספר טלפון: 054-3066442' : 'Phone Number: 054-3066442'}</div>

                <div>${hasHebrewContent ? 'א"ל: galbecker106@gmail.com' : 'Email: galbecker106@gmail.com'}</div>

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



  const handleTitleChange = (newTitle, mealIndex, optionIndex, alternativeIndex = null) => {

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



      option.meal_title = newTitle;



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



      option.meal_title = newTitle;



      return updatedOriginal;

    });

  };



  const handleIngredientChange = (newValues, mealIndex, optionIndex, ingredientIndex, alternativeIndex = null) => {

    setMenu(prevMenu => {

      // Save current state to undo stack before making changes

      saveToUndoStack(prevMenu);

      

      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));

      const meal = updatedMenu.meals[mealIndex];

      // Get the correct option based on whether it's in the alternatives array

      let option;

      if (alternativeIndex !== null) {

        // Editing an item in the alternatives array

        option = meal.alternatives[alternativeIndex];

      } else {

        // Editing main or alternative

        option = optionIndex === 'main' ? meal.main : meal.alternative;

      }



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

      // Get the correct option based on whether it's in the alternatives array

      let option;

      if (alternativeIndex !== null) {

        // Editing an item in the alternatives array

        option = meal.alternatives[alternativeIndex];

      } else {

        // Editing main or alternative

        option = optionIndex === 'main' ? meal.main : meal.alternative;

      }



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



  const handleHouseholdMeasureChange = (newHouseholdMeasure, mealIndex, optionIndex, ingredientIndex, alternativeIndex = null) => {

    setMenu(prevMenu => {

      // Save current state to undo stack before making changes

      saveToUndoStack(prevMenu);

      

      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));

      const meal = updatedMenu.meals[mealIndex];

      // Get the correct option based on whether it's in the alternatives array

      let option;

      if (alternativeIndex !== null) {

        option = meal.alternatives[alternativeIndex];

      } else {

        option = optionIndex === 'main' ? meal.main : meal.alternative;

      }



      // Update only the household_measure field of the specific ingredient

      option.ingredients[ingredientIndex].household_measure = newHouseholdMeasure;



      return updatedMenu;

    });



    // Also update the original menu for consistency

    setOriginalMenu(prevOriginal => {

      if (!prevOriginal) return prevOriginal;



      const updatedOriginal = JSON.parse(JSON.stringify(prevOriginal));

      const meal = updatedOriginal.meals[mealIndex];

      // Get the correct option based on whether it's in the alternatives array

      let option;

      if (alternativeIndex !== null) {

        option = meal.alternatives[alternativeIndex];

      } else {

        option = optionIndex === 'main' ? meal.main : meal.alternative;

      }



      // Update only the household_measure field of the specific ingredient

      option.ingredients[ingredientIndex].household_measure = newHouseholdMeasure;



      return updatedOriginal;

    });

  };



  // Dialog handlers for ingredient portion

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



  // Handle number of meals change

  const handleNumberOfMealsChange = async (newNumberOfMeals) => {

    if (!selectedClient || newNumberOfMeals < 1 || newNumberOfMeals > 10) return;

    

    setNumberOfMeals(newNumberOfMeals);

    

    // Update meal plan structure based on new number of meals

    const newStructure = getDefaultMealPlanStructure(translations, newNumberOfMeals);

    setMealPlanStructure(newStructure);

    

    // Save to client profile

    try {

      await ChatUser.update(selectedClient.user_code, { number_of_meals: newNumberOfMeals });

      console.log('✅ Updated number of meals for client:', newNumberOfMeals);

    } catch (error) {

      console.error('❌ Failed to update number of meals:', error);

      setError('Failed to update number of meals: ' + error.message);

    }

  };



  const handleConfirmPortionDialog = (updatedIngredient) => {

    if (dialogIngredientContext) {

      const { mealIndex, optionIndex, ingredientIndex, alternativeIndex } = dialogIngredientContext;

      handleIngredientChange(updatedIngredient, mealIndex, optionIndex, ingredientIndex, alternativeIndex);

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

      // Reset unsaved changes when fetching new user targets

      setHasUnsavedMealPlanChanges(false);

      setSavedMealPlanStructure(null);

      console.log('🎯 Fetching nutritional targets for user:', userCode);



      if (!userCode) {

        console.error('❌ No user code provided');

        setError('No user code provided');

        return null;

      }



      // Use the client.js API to get user data

      console.log('🔍 Fetching user data using client.js API for user_code:', userCode);

      const userData = await entities.ChatUser.getByUserCode(userCode);



      console.log('📊 Client API response:', userData);

      console.log('📊 User data keys:', userData ? Object.keys(userData) : 'No user data');



      if (!userData) {

          console.error('❌ No user found with code:', userCode);

          setError(`No user found with code: ${userCode}. Please check if the user exists in the database.`);

        return null;

      }



      console.log('✅ Fetched user targets:', userData);



      // Check if essential fields are missing

      const missingFields = [];

      if (!userData.daily_target_total_calories && !userData.base_daily_total_calories) missingFields.push('daily_target_total_calories or base_daily_total_calories');

      if (!userData.macros) missingFields.push('macros');

      

      if (missingFields.length > 0) {

        console.warn('⚠️ Missing essential fields:', missingFields);

        console.log('Available data:', userData);

      }



      // Parse macros if it's a string

      let parsedMacros = userData.macros;

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

        calories: userData.base_daily_total_calories || 2000,

        calories_per_day: userData.daily_target_total_calories || 2000, // Use daily_target_total_calories for Daily Target Calories UI

        macros: {

          protein: parseFloat((parsedMacros?.protein?.toString() || '150').replace('g', '')),

          fat: parseFloat((parsedMacros?.fat?.toString() || '80').replace('g', '')),

          carbs: parseFloat((parsedMacros?.carbs?.toString() || '250').replace('g', ''))

        },

        region: userData.region || 'israel',

        allergies: parseArrayField(userData.food_allergies),

        limitations: parseArrayField(userData.food_limitations),

        age: userData.age,

        gender: userData.gender,

        weight: userData.weight_kg,

        height: userData.height_cm,

        client_preference: userData.client_preference || {},

        meal_plan_structure: userData.meal_plan_structure || {}

      };



      console.log('✅ Processed user targets:', userTargetsData);

      setUserTargets(userTargetsData);

      

      // Set meal plan structure with fallback to default

      const loadedMealPlan = userData.meal_plan_structure;

      if (loadedMealPlan && loadedMealPlan.length > 0) {

        // Add locked property to each meal (default to false)

        const mealPlanWithLocks = loadedMealPlan.map(meal => ({

          ...meal,

          key: meal.key || inferMealKey(meal.meal),

          locked: false

        }));

        setMealPlanStructure(mealPlanWithLocks);

        // Store the modified structure (with locks) as the saved structure for comparison

        setSavedMealPlanStructure(mealPlanWithLocks.map(meal => ({

          meal: meal.meal,

          description: meal.description,

          calories: meal.calories,

          calories_pct: meal.calories_pct

        })));

      } else {

        // Use default structure and save it to database

        const defaultStructure = getDefaultMealPlanStructure(translations, userData.number_of_meals || 4);

        setMealPlanStructure(defaultStructure);

        // Save default structure to database

        try {

          const mealPlanToSave = defaultStructure.map(meal => ({

            meal: meal.meal,

            description: meal.description,

            calories: meal.calories,

            calories_pct: meal.calories_pct

          }));

          console.log('💾 Saving default meal plan structure to database for user:', userCode);

          const { error } = await supabase

            .from('chat_users')

            .update({ meal_plan_structure: mealPlanToSave })

            .eq('user_code', userCode);

          if (error) {

            console.error('❌ Error saving default meal plan structure:', error);

          } else {

            console.log('✅ Default meal plan structure saved successfully');

            // Store the saved structure for comparison

            setSavedMealPlanStructure(mealPlanToSave);

          }

          // Set the saved structure to match the current structure

          setSavedMealPlanStructure(mealPlanToSave);

        } catch (err) {

          console.error('❌ Error saving default meal plan structure:', err);

        }

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



  // Load client recommendations from chat_users table

  const fetchClientRecommendations = async (userCode) => {

    try {

      setLoadingClientRecommendations(true);

      console.log('📋 Fetching client recommendations for user:', userCode);



      if (!userCode) {

        console.log('⚠️ No user code provided for client recommendations');

        return;

      }



      // Use the client.js API to get user data with recommendations

      const userData = await entities.ChatUser.getByUserCode(userCode);

      

      console.log('📋 Full user data from client.js API:', userData);

      console.log('📋 Recommendations field:', userData?.recommendations);

      

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

        console.log('📋 Is object:', typeof recommendations === 'object' && recommendations !== null);

        

        // Handle both array and object formats

        let clientRecs = [];

        

        if (Array.isArray(recommendations)) {

          // Handle array format

          clientRecs = recommendations.map((rec, index) => {

            if (typeof rec === 'object' && rec !== null) {

              return {

                ...rec,

                id: `client_${userCode}_${index}`,

                source: 'client',

                client_user_code: userCode

              };

            } else {

              // Handle simple string recommendations

              return {

                id: `client_${userCode}_${index}`,

                title: 'Client Recommendation',

                content: String(rec),

                category: 'general',

                priority: 'medium',

                source: 'client',

                client_user_code: userCode

              };

            }

          });

        } else if (typeof recommendations === 'object' && recommendations !== null) {

          // Handle object format (like your database structure)

          clientRecs = Object.entries(recommendations).map(([category, content], index) => {

            console.log(`📋 Processing recommendation ${index}:`, { category, content, contentType: typeof content });

            

            // Ensure content is a string and make it user-friendly

            let contentStr = content;

            if (typeof content === 'object' && content !== null) {

              // If it's an object, try to extract meaningful text

              if (content.text) {

                contentStr = content.text;

              } else if (content.content) {

                contentStr = content.content;

              } else if (content.message) {

                contentStr = content.message;

              } else {

                // Fallback to a clean string representation

                contentStr = Object.values(content).join(' ');

              }

            } else {

              contentStr = String(content);

            }

            

            return {

              id: `client_${userCode}_${index}`,

              title: `${category.charAt(0).toUpperCase() + category.slice(1)} Recommendation`,

              content: contentStr,

              category: category,

              priority: 'medium',

              source: 'client',

              client_user_code: userCode

            };

          });

        }

        

        console.log('✅ Loaded client recommendations:', clientRecs);

        console.log('✅ Client recommendations details:', clientRecs.map(rec => ({ 

          id: rec.id, 

          title: rec.title, 

          content: rec.content, 

          category: rec.category 

        })));

        setClientRecommendations(clientRecs);

      } else {

        console.log('ℹ️ No recommendations found for user:', userCode);

        setClientRecommendations([]);

      }

      

    } catch (err) {

      console.error('❌ Error fetching client recommendations:', err);

      setClientRecommendations([]);

    } finally {

      setLoadingClientRecommendations(false);

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

    // Immediately reflect in Number of Meals section
    setNumberOfMeals(updatedStructure.length);
    try {
      if (selectedClient?.user_code) {
        entities?.ChatUser?.update && entities.ChatUser.update(selectedClient.user_code, { number_of_meals: updatedStructure.length });
      }
    } catch (e) {
      console.warn('Failed to persist number_of_meals after add:', e);
    }

  };



  // Remove meal from meal plan structure

  const removeMealFromPlan = (index) => {

    // Step 1: Remove the selected meal

    const updatedStructure = mealPlanStructure.filter((_, i) => i !== index);

    const totalCalories = userTargets?.calories_per_day || userTargets?.calories || 0;

    

    if (totalCalories === 0) {

      setMealPlanStructure(updatedStructure);
      // Immediately reflect in Number of Meals section
      setNumberOfMeals(updatedStructure.length);
      try {
        if (selectedClient?.user_code) {
          entities?.ChatUser?.update && entities.ChatUser.update(selectedClient.user_code, { number_of_meals: updatedStructure.length });
        }
      } catch (e) {
        console.warn('Failed to persist number_of_meals after remove:', e);
      }

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
    // Immediately reflect in Number of Meals section
    setNumberOfMeals(rebalancedStructure.length);
    try {
      if (selectedClient?.user_code) {
        entities?.ChatUser?.update && entities.ChatUser.update(selectedClient.user_code, { number_of_meals: rebalancedStructure.length });
      }
    } catch (e) {
      console.warn('Failed to persist number_of_meals after remove:', e);
    }

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

      const totalCalories = userTargets?.calories_per_day || userTargets?.calories || 0;

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



  // Meal Template Functions
  
  // Fetch meal templates from database with variant information
  const fetchMealTemplates = async () => {
    try {
      setLoadingTemplates(true);
      
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (user) {
        setCurrentDietitian(user.id);
        console.log('👤 Current dietitian:', user.id);
      }
      
      // Fetch all meal templates with their variants
      const orderColumn = language === 'he' ? 'hebrew_name' : 'name';
      const { data: templates, error: templatesError } = await supabase
        .from('meal_templates')
        .select(`
          *,
          variants:meal_template_variants(meals_per_day)
        `)
        .order(orderColumn, { ascending: true, nullsFirst: false });
      
      if (templatesError) throw templatesError;
      
      // Process templates to include available meal counts and ownership
      const processedTemplates = templates?.map(template => ({
        ...template,
        availableMealCounts: template.variants?.map(v => v.meals_per_day).sort((a, b) => a - b) || [],
        isOwnedByCurrentUser: user ? template.dietitian_id === user.id : false
      })) || [];
      
      console.log('✅ Fetched meal templates with variants:', processedTemplates);
      setMealTemplates(processedTemplates);
      
    } catch (err) {
      console.error('❌ Error fetching meal templates:', err);
      alert(`Failed to load meal templates: ${err.message}`);
    } finally {
      setLoadingTemplates(false);
    }
  };
  
  // Fetch meals for a specific template variant
  const fetchTemplateVariant = async (templateId, mealsPerDay) => {
    try {
      // Find the variant for this template with the specified meals_per_day
      const { data: variants, error: variantError } = await supabase
        .from('meal_template_variants')
        .select('id')
        .eq('template_id', templateId)
        .eq('meals_per_day', mealsPerDay)
        .single();
      
      if (variantError) throw variantError;
      
      if (!variants) {
        console.warn(`No variant found for template ${templateId} with ${mealsPerDay} meals`);
        return null;
      }
      
      // Fetch all meals for this variant
      const { data: meals, error: mealsError } = await supabase
        .from('meal_template_meals')
        .select('*')
        .eq('variant_id', variants.id)
        .order('position');
      
      if (mealsError) throw mealsError;
      
      return meals;
    } catch (err) {
      console.error('❌ Error fetching template variant:', err);
      return null;
    }
  };
  
  // Apply template to meal plan structure
  const applyMealTemplate = async (template) => {
    try {
      if (!template) {
        alert('Please select a template first');
        return;
      }
      
      const mealsPerDay = numberOfMeals || selectedClient?.number_of_meals || 4;
      
      const templateDisplayName = getTemplateDisplayName(template);
      console.log(`📋 Applying template "${templateDisplayName}" with ${mealsPerDay} meals per day`);
      
      // Fetch the template variant and its meals
      const meals = await fetchTemplateVariant(template.id, mealsPerDay);
      
      if (!meals || meals.length === 0) {
        alert(`No meals found for template "${templateDisplayName}" with ${mealsPerDay} meals per day.\nPlease select a different template or adjust the number of meals.`);
        return;
      }
      
      // Convert template meals to meal plan structure format
      const totalCalories = userTargets?.calories_per_day || userTargets?.calories || 0;
      const caloriesPerMeal = totalCalories > 0 ? Math.round(totalCalories / meals.length) : 0;
      const percentagePerMeal = meals.length > 0 ? Math.round((100 / meals.length) * 10) / 10 : 0;
      
      const newMealPlanStructure = meals.map((meal, index) => {
        const mealDescription = language === 'he' && meal.hebrew_example ? meal.hebrew_example : (meal.example || '');
        return {
          key: `meal_${index + 1}`,
          meal: meal.name,
          description: mealDescription,
          calories: caloriesPerMeal,
          calories_pct: percentagePerMeal,
          locked: false
        };
      });
      
      setMealPlanStructure(newMealPlanStructure);
      setSelectedTemplate(template);
      setHasUnsavedMealPlanChanges(true);
      
      console.log('✅ Applied meal template successfully:', newMealPlanStructure);
      
    } catch (err) {
      console.error('❌ Error applying meal template:', err);
      alert(`Failed to apply meal template: ${err.message}`);
    }
  };
  
  // Load templates on component mount
  useEffect(() => {
    fetchMealTemplates();
  }, []);
  
  // Save current meal plan as a template - initial validation
  const saveAsTemplate = async () => {
    const currentMealsPerDay = mealPlanStructure.length;
    
    // Validate that all meals have descriptions
    const mealsWithDescriptions = mealPlanStructure.filter(meal => 
      meal.description && meal.description.trim() !== ''
    ).length;
    
    if (mealsWithDescriptions < currentMealsPerDay) {
      alert(
        `❌ ${translations.cannotSaveIncompleteTemplate || 'Cannot Save Incomplete Template'}\n\n` +
        `You must fill in descriptions for ALL ${currentMealsPerDay} meals before saving as a template.\n\n` +
        `Current progress: ${mealsWithDescriptions}/${currentMealsPerDay} meals filled\n\n` +
        `Please complete all meal descriptions and try again.`
      );
      return;
    }
    
    // Show limitation dialog if less than 6 meals, otherwise proceed directly
    if (currentMealsPerDay < 6) {
      setPendingTemplateSave({ currentMealsPerDay });
      setShowTemplateLimitationDialog(true);
    } else {
      // 6 meals - proceed directly
      await continueTemplateSave();
    }
  };
  
  // Continue with template save after confirmation
  const continueTemplateSave = async () => {
    try {
      const currentMealsPerDay = mealPlanStructure.length;
      
      const templateName = prompt('Enter a name for this meal plan template:');
      if (!templateName || templateName.trim() === '') {
        return;
      }
      
      const templateTags = prompt('Enter tags for this template (comma-separated, optional):');
      const tags = templateTags ? templateTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];
      
      console.log('💾 Saving meal plan as template:', templateName);
      
      // Get the current authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('❌ Authentication error:', authError);
        alert('You must be logged in to create templates');
        return;
      }
      
      console.log('👤 Creating template for dietitian:', user.id);
      
      // Create the meal template with dietitian_id
      const { data: template, error: templateError } = await supabase
        .from('meal_templates')
        .insert({
          name: templateName,
          tags: tags,
          dietitian_id: user.id
        })
        .select()
        .single();
      
      if (templateError) throw templateError;
      
      console.log('✅ Created template:', template);
      
      // Only allow creating variants for meal counts <= current
      const possibleVariants = [3, 4, 5, 6].filter(count => count <= currentMealsPerDay && count !== currentMealsPerDay);
      
      let createVariants = false;
      if (possibleVariants.length > 0) {
        createVariants = window.confirm(
          `Would you like to create variants for FEWER meals?\n\n` +
          `Current: ${currentMealsPerDay} meals\n` +
          `Available variants: ${possibleVariants.join(', ')} meals\n\n` +
          `Click OK to create all smaller variants (recommended)\n` +
          `Click Cancel to only save the ${currentMealsPerDay}-meal version`
        );
      }
      
      const mealCountsToCreate = createVariants ? possibleVariants : [];
      
      // Always create the current variant first
      const allMealCounts = [currentMealsPerDay, ...mealCountsToCreate];
      
      for (const mealsPerDay of allMealCounts) {
        // Create the variant
        const { data: variant, error: variantError } = await supabase
          .from('meal_template_variants')
          .insert({
            template_id: template.id,
            meals_per_day: mealsPerDay
          })
          .select()
          .single();
        
        if (variantError) throw variantError;
        
        console.log(`✅ Created variant for ${mealsPerDay} meals:`, variant);
        
        // Always take first N meals from current structure (can only reduce, not expand)
        const mealsToSave = mealPlanStructure.slice(0, mealsPerDay).map((meal, index) => ({
          variant_id: variant.id,
          position: index + 1,
          name: meal.meal,
          example: meal.description || null
        }));
        
        // Insert meals for this variant
        const { error: mealsError } = await supabase
          .from('meal_template_meals')
          .insert(mealsToSave);
        
        if (mealsError) throw mealsError;
        
        console.log(`✅ Created ${mealsToSave.length} meals for ${mealsPerDay}-meal variant`);
      }
      
      const variantText = createVariants 
        ? ` with variants for ${allMealCounts.join(', ')} meals`
        : ` for ${currentMealsPerDay} meals`;
      
      alert(`Template "${templateName}" saved successfully${variantText}!`);
      
      // Refresh the templates list
      await fetchMealTemplates();
      
    } catch (err) {
      console.error('❌ Error saving template:', err);
      alert(`Failed to save template: ${err.message}`);
    }
  };

  // Render a template card (helper function for template manager)
  const renderTemplateCard = (template) => {
    const displayName = getTemplateDisplayName(template);
    const templateEmoji = getTemplateEmoji(template.name);
    return (
      <div key={template.id} className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
        template.isOwnedByCurrentUser 
          ? 'border-purple-300 bg-purple-50/30' 
          : 'border-gray-200 bg-white'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{templateEmoji}</span>
              <h4 className="font-semibold text-gray-900 text-lg">{displayName}</h4>
              {template.isOwnedByCurrentUser && (
                <Badge variant="outline" className="bg-purple-100 border-purple-400 text-purple-800 text-xs font-semibold">
                  👤 {translations.yourTemplate || 'Your Template'}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {template.tags && template.tags.length > 0 && template.tags.map((tag, idx) => (
                <Badge key={idx} variant="outline" className="bg-purple-50 border-purple-200 text-purple-700 text-xs">
                  {tag}
                </Badge>
              ))}
              <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 text-xs font-semibold">
                🍽️ Variants: {template.availableMealCounts?.map(count => {
                  const isCurrent = count === (numberOfMeals || 4);
                  return (
                    <span key={count} className={isCurrent ? 'font-bold text-green-700' : ''}>
                      {count}
                    </span>
                  );
                }).reduce((prev, curr, idx) => [prev, idx > 0 ? ', ' : '', curr]) || 'none'}
              </Badge>
              {template.availableMealCounts?.includes(numberOfMeals || 4) && (
                <Badge variant="outline" className="bg-green-50 border-green-300 text-green-700 text-xs">
                  ✓ {translations.compatible || 'Compatible'}
                </Badge>
              )}
              {!template.availableMealCounts?.includes(numberOfMeals || 4) && (
                <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700 text-xs">
                  ⚠️ {translations.needsVariant || `Needs ${numberOfMeals}-meal variant`}
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Created: {new Date(template.created_at).toLocaleDateString()}
            </p>
          </div>
          
          <div className="flex gap-2">
            {(() => {
              const currentMealCount = numberOfMeals || 4;
              const hasCurrentVariant = template.availableMealCounts?.includes(currentMealCount);
              const canAddVariant = currentMealCount <= Math.max(...(template.availableMealCounts || [0]));
              
              if (hasCurrentVariant) {
                // Template is compatible - show Apply button
                return (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await applyMealTemplate(template);
                      setShowTemplateManager(false);
                    }}
                    className="text-green-600 border-green-300 hover:bg-green-50"
                    title={translations.apply || 'Apply Template'}
                  >
                    ✓ {translations.apply || 'Apply'}
                  </Button>
                );
              } else if (canAddVariant) {
                // Can add a variant from existing larger variant
                return (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const addVariant = window.confirm(
                        `This template doesn't have a ${currentMealCount}-meal variant yet.\n\n` +
                        `Would you like to create a ${currentMealCount}-meal variant?\n\n` +
                        `It will be created from the largest existing variant (${Math.max(...template.availableMealCounts)}-meal).\n\n` +
                        `Available variants: ${template.availableMealCounts?.join(', ') || 'none'}`
                      );
                      
                      if (addVariant) {
                        try {
                          // Get the largest variant
                          const largestMealCount = Math.max(...template.availableMealCounts);
                          const sourceMeals = await fetchTemplateVariant(template.id, largestMealCount);
                          
                          if (!sourceMeals) {
                            throw new Error('Could not fetch source variant meals');
                          }
                          
                          // Create new variant
                          const { data: variant, error: variantError } = await supabase
                            .from('meal_template_variants')
                            .insert({
                              template_id: template.id,
                              meals_per_day: currentMealCount
                            })
                            .select()
                            .single();
                          
                          if (variantError) throw variantError;
                          
                          // Create meals from source (take first N)
                          const meals = sourceMeals.slice(0, currentMealCount).map((meal, index) => ({
                            variant_id: variant.id,
                            position: index + 1,
                            name: meal.name,
                            example: meal.example
                          }));
                          
                          const { error: mealsError } = await supabase
                            .from('meal_template_meals')
                            .insert(meals);
                          
                          if (mealsError) throw mealsError;
                          
                          alert(`${currentMealCount}-meal variant created successfully!`);
                          await fetchMealTemplates();
                        } catch (err) {
                          alert(`Failed to add variant: ${err.message}`);
                        }
                      }
                    }}
                    className="text-amber-600 border-amber-300 hover:bg-amber-50"
                    title={translations.addVariant || 'Add Variant'}
                  >
                    ➕ {translations.addVariant || 'Add Variant'}
                  </Button>
                );
              } else {
                // Cannot add variant - need larger base template
                return (
                  <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-600 text-xs">
                    {translations.incompatible || 'Incompatible'}
                  </Badge>
                );
              }
            })()}
            {template.isOwnedByCurrentUser ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingTemplate(template);
                    setTemplateFormData({
                      name: template.name,
                      tags: template.tags || []
                    });
                  }}
                  className="text-blue-600 border-blue-300 hover:bg-blue-50"
                  title={translations.edit || 'Edit'}
                >
                  ✏️
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (window.confirm(translations.confirmDeleteTemplate || `Are you sure you want to delete the template "${displayName}"? This action cannot be undone.`)) {
                      try {
                        await deleteTemplate(template.id);
                        alert(translations.templateDeleted || 'Template deleted successfully!');
                      } catch (err) {
                        alert(`Failed to delete template: ${err.message}`);
                      }
                    }
                  }}
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  title={translations.delete || 'Delete'}
                >
                  🗑️
                </Button>
              </>
            ) : (
              <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-600 text-xs px-3">
                🔒 {translations.readOnly || 'Read Only'}
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Delete a template
  const deleteTemplate = async (templateId) => {
    try {
      console.log('🗑️ Deleting template:', templateId);
      
      // First, get all variants for this template
      const { data: variants, error: variantsError } = await supabase
        .from('meal_template_variants')
        .select('id')
        .eq('template_id', templateId);
      
      if (variantsError) throw variantsError;
      
      // Delete all meals for each variant
      if (variants && variants.length > 0) {
        for (const variant of variants) {
          const { error: mealsError } = await supabase
            .from('meal_template_meals')
            .delete()
            .eq('variant_id', variant.id);
          
          if (mealsError) throw mealsError;
        }
        
        // Delete all variants
        const { error: deleteVariantsError } = await supabase
          .from('meal_template_variants')
          .delete()
          .eq('template_id', templateId);
        
        if (deleteVariantsError) throw deleteVariantsError;
      }
      
      // Finally, delete the template
      const { error: templateError } = await supabase
        .from('meal_templates')
        .delete()
        .eq('id', templateId);
      
      if (templateError) throw templateError;
      
      console.log('✅ Template deleted successfully');
      
      // If the deleted template was selected, clear the selection
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }
      
      // Refresh the templates list
      await fetchMealTemplates();
      
    } catch (err) {
      console.error('❌ Error deleting template:', err);
      throw err;
    }
  };

  // Update an existing template
  const updateTemplate = async (templateId, newName, newTags) => {
    try {
      console.log('✏️ Updating template:', templateId);
      
      const { error } = await supabase
        .from('meal_templates')
        .update({
          name: newName,
          tags: newTags
        })
        .eq('id', templateId);
      
      if (error) throw error;
      
      console.log('✅ Template updated successfully');
      
      // Refresh the templates list
      await fetchMealTemplates();
      
    } catch (err) {
      console.error('❌ Error updating template:', err);
      throw err;
    }
  };



  // Handle temporary calorie input (without immediate update)

  const handleTempCalorieInput = (mealIndex, value) => {

    const numericValue = parseInt(value) || 0;

    const dailyTotal = userTargets?.calories_per_day || userTargets?.calories || 0;

    

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

    const dailyTotal = userTargets?.calories_per_day || userTargets?.calories || 0;

    

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

      // Update the saved structure to match current structure

      setSavedMealPlanStructure(mealPlanToSave);

      setHasUnsavedMealPlanChanges(false);

      

    } catch (err) {

      console.error('❌ Error in saveMealPlanStructure:', err);

      alert(`Failed to save meal plan structure: ${err.message}`);

    }

  };



  const updateMealPlanDescriptionsWithAI = async () => {

    if (!selectedClient?.user_code) {

      alert('No client selected. Please select a client first.');

      return;

    }



    setUpdatingMealDescriptions(true);



    try {

      console.log('🤖 Updating meal plan descriptions with AI for user:', selectedClient.user_code);


      const response = await fetch('https://dietitian-be.azurewebsites.net/api/update-meal-plan-descriptions', {
        // const response = await fetch('http://127.0.0.1:8000/api/update-meal-plan-descriptions', {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify({

          user_code: selectedClient.user_code

        })

      });



      if (!response.ok) {

        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);

      }



      const data = await response.json();



      if (data.error) {

        throw new Error(data.error);

      }



      if (data.meal_plan_structure && Array.isArray(data.meal_plan_structure)) {

        // Update meal plan structure with AI-generated descriptions

        // Preserve the locked property if it exists

        const updatedStructure = data.meal_plan_structure.map((meal, index) => ({

          ...meal,

          locked: mealPlanStructure[index]?.locked || false

        }));



        setMealPlanStructure(updatedStructure);

        setHasUnsavedMealPlanChanges(true);



        console.log('✅ Meal plan descriptions updated successfully:', data);

        alert('Meal plan descriptions updated successfully based on client\'s eating habits!');

      } else {

        throw new Error('Invalid response format from server');

      }



    } catch (err) {

      console.error('❌ Error updating meal plan descriptions:', err);

      alert(`Failed to update meal descriptions: ${err.message}`);

    } finally {

      setUpdatingMealDescriptions(false);

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

      localStorage.removeItem('menuCreate_recommendations');

      setMenu(null);

      setOriginalMenu(null);

      setUserTargets(null);

      setRecommendations([]);

      setError(null);

      console.log('✅ Menu state cleared successfully');

    } catch (err) {

      console.warn('Failed to clear saved menu state:', err);

    }

  };



  // Handler for empty meal plan dialog

  const handleEmptyMealPlanConfirm = async () => {

    setShowEmptyMealPlanDialog(false);

    // Proceed with menu generation

    await proceedWithMenuGeneration();

  };



  const handleEmptyMealPlanCancel = () => {

    setShowEmptyMealPlanDialog(false);

  };



  // Extracted menu generation logic

  const proceedWithMenuGeneration = async () => {

    // Clear any existing errors at the start

    setError(null);

    

    // Clear the old menu immediately when starting new generation

    console.log('🧹 Clearing old originalMenu before generating new one');

    setOriginalMenu(null);

    setMenu(null);

    

    // Clear translation cache to prevent old translations from showing

    console.log('🧹 Clearing translation cache');

    clearAllTranslationCache();



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



      const templateRes = await fetch("https://dietitian-be.azurewebsites.net/api/template", {

      // const templateRes = await fetch("http://127.0.0.1:8000/api/template", {

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

          throw new Error("Please fill all the client data in the client page (dietary preferences, restrictions, goals, physical information, etc.) and try again.");

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



                   // Start gradual progress animation from 30% to 99% during meal generation

             const progressInterval = setInterval(() => {

               setProgress(prev => {

                 if (prev >= 99) {

                   clearInterval(progressInterval);

                   return 99;

                 }

                 return prev + 1;

               });

             }, 2000); // Increment by 1% every 2 seconds (much slower progress)



      // Ensure template has carbs for each meal

      const ensureCarbs = (opt) => {

        if (!opt || typeof opt !== 'object') return opt;

        

        // For alternatives that have main and alternative arrays

        if (opt.main && Array.isArray(opt.main)) {

          return {

            ...opt,

            main: opt.main.map(item => ({

              ...item,

              carbs: item.carbs ?? 50 // Default carbs if missing

            }))

          };

        }

        

        // For regular templates that are arrays

        if (Array.isArray(opt)) {

          return opt.map(item => ({

            ...item,

            carbs: item.carbs ?? 50 // Default carbs if missing

          }));

        }

        

        // For single items

        return {

          ...opt,

          carbs: opt.carbs ?? 50 // Default carbs if missing

        };

      };



      const normalizedTemplate = template.map(m => ({

        meal: m.meal,

        main: ensureCarbs(m.main),

        alternative: ensureCarbs(m.alternative)

      }));



      const buildRes = await fetch("https://dietitian-be.azurewebsites.net/api/build-menu", {

      // const buildRes = await fetch("http://127.0.0.1:8000/api/build-menu", {

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

      // IMPORTANT: Always update originalMenu with the new menuData first

      console.log('🔄 Setting new originalMenu:', menuData);

      setOriginalMenu(menuData);

      

      setProgress(85);

      setProgressStep('🌐 Preparing menu display...');



      // Display the correct version based on the current language

      if (language === 'he') {

        setProgressStep('🌐 Translating to Hebrew...');

        const translatedMenu = await translateMenu(menuData, 'he');

        setMenu(translatedMenu);

      } else {

        setMenu(menuData);

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

      setError(err.message || 'Failed to generate menu. Please try again.');

      setProgress(0);

      setProgressStep('');

      // Clear the progress interval if it exists

      if (typeof progressInterval !== 'undefined') {

        clearInterval(progressInterval);

      }

    } finally {

      setLoading(false);

      // Clear the progress interval if it exists

      if (typeof progressInterval !== 'undefined') {

        clearInterval(progressInterval);

      }

    }

  };



  const fetchMenu = async () => {

    if (!selectedClient) {

      setError('Please select a client before generating a menu.');

      return;

    }

    

    // Clear the old menu immediately when starting new generation

    console.log('🧹 Clearing old originalMenu before generating new one (fetchMenu)');

    setOriginalMenu(null);

    setMenu(null);

    

    // Clear translation cache to prevent old translations from showing

    console.log('🧹 Clearing translation cache');

    clearAllTranslationCache();



    // Check meal plan structure validation

    const hasEmptyMealPlan = !mealPlanStructure || mealPlanStructure.length === 0;

    

    // If no template is selected, check meal descriptions

    if (!selectedTemplate) {

      // Count meals with and without descriptions

      const mealsWithDescriptions = mealPlanStructure.filter(meal => 

        meal.description && meal.description.trim() !== ''

      ).length;

      const totalMeals = mealPlanStructure.length;

      

      // All meals are empty

      if (mealsWithDescriptions === 0) {

        setError(translations.mustSelectTemplateOrFillDescriptions || 

          'You must either select a meal template OR fill in descriptions for all meals before generating.');

        

        // Expand the Meal Plan Structure section and scroll to it

        setIsMealPlanMinimized(false);

        setTimeout(() => {

          const mealPlanSection = document.querySelector('[data-meal-plan-section]');

          if (mealPlanSection) {

            mealPlanSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add a pulsing highlight effect with shake animation

            mealPlanSection.classList.add('ring-4', 'ring-amber-400', 'animate-pulse');

            

            // Add shake effect

            mealPlanSection.style.animation = 'shake 0.5s ease-in-out';

            

            setTimeout(() => {

              mealPlanSection.classList.remove('ring-4', 'ring-amber-400', 'animate-pulse');

              mealPlanSection.style.animation = '';

            }, 2500);

          }

        }, 100);

        

        return;

      }

      

      // Some meals are filled but not all (partial)

      if (mealsWithDescriptions > 0 && mealsWithDescriptions < totalMeals) {

        setError(translations.mustFillAllMealDescriptions || 

          `You have filled ${mealsWithDescriptions} out of ${totalMeals} meals. Please fill in descriptions for ALL meals or select a template.`);

        

        // Expand the Meal Plan Structure section and scroll to it

        setIsMealPlanMinimized(false);

        setTimeout(() => {

          const mealPlanSection = document.querySelector('[data-meal-plan-section]');

          if (mealPlanSection) {

            mealPlanSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add a pulsing highlight effect with shake animation

            mealPlanSection.classList.add('ring-4', 'ring-amber-400', 'animate-pulse');

            

            // Add shake effect

            mealPlanSection.style.animation = 'shake 0.5s ease-in-out';

            

            setTimeout(() => {

              mealPlanSection.classList.remove('ring-4', 'ring-amber-400', 'animate-pulse');

              mealPlanSection.style.animation = '';

            }, 2500);

          }

        }, 100);

        

        return;

      }

    }

    // Check if there are unsaved changes to meal plan structure

    if (hasUnsavedMealPlanChanges && !loadingUserTargets) {

      console.log('⚠️ Unsaved changes detected, showing dialog');

      setShowUnsavedChangesDialog(true);

      return; // Don't proceed until user saves or confirms

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



      const templateRes = await fetch("https://dietitian-be.azurewebsites.net/api/template", {

      // const templateRes = await fetch("http://127.0.0.1:8000/api/template", {

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

          throw new Error("Please fill all the client data in the client page (dietary preferences, restrictions, goals, physical information, etc.) and try again.");

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



      // Start gradual progress animation from 30% to 99% during meal generation

      const progressInterval2 = setInterval(() => {

        setProgress(prev => {

          if (prev >= 99) {

            clearInterval(progressInterval2);

            return 99;

          }

          return prev + 1;

        });

      }, 2000); // Increment by 1% every 2 seconds (much slower progress)



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



      const buildRes = await fetch("https://dietitian-be.azurewebsites.net/api/build-menu", {

      // const buildRes = await fetch("http://127.0.0.1:8000/api/build-menu", {

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

      // IMPORTANT: Always update originalMenu with the new menuData first

      console.log('🔄 Setting new originalMenu:', menuData);

      setOriginalMenu(menuData);

      

      setProgress(85);

      setProgressStep('🌐 Preparing menu display...');



      // Display the correct version based on the current language

      if (language === 'he') {

        setProgressStep('🌐 Translating to Hebrew...');

        const translatedMenu = await translateMenu(menuData, 'he');

        setMenu(translatedMenu);

      } else {

        setMenu(menuData);

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

      // Clear the progress interval if it exists

      if (typeof progressInterval2 !== 'undefined') {

        clearInterval(progressInterval2);

      }

    } finally {

      setLoading(false);

      // Clear the progress interval if it exists

      if (typeof progressInterval2 !== 'undefined') {

        clearInterval(progressInterval2);

      }

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

    console.log('📋 Current Menu (displayed):', menu);

    console.log('🔍 Are they the same?', originalMenu === menu ? 'YES (same reference)' : 'NO (different references)');



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

        recommendations: recommendations, // Use the recommendations state

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

            alternativeIndex={option.alternativeIndex}

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

                        alternativeIndex={option.alternativeIndex}

                        translations={translations}

                        currentIngredient={ingredient}

                        onPortionDialog={handleOpenPortionDialog}

                        autoFocus={idx === option.ingredients.length - 1 && ingredient.item === ''}

                        forceShowAbove={option.mealIndex === menu.meals.length - 1 && idx === option.ingredients.length - 1}

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

                          onClick={() => handleOpenPortionDialog(ingredient, option.mealIndex, isAlternative ? 'alternative' : 'main', idx, option.alternativeIndex)}

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



  // Create a stable function to handle language changes

  const handleLanguageChange = useCallback(async (lang) => {

    // IMPORTANT: Use ref to get the LATEST originalMenu, not the closure value

    const currentOriginalMenu = originalMenuRef.current;

    

    console.log('🌐 Language change requested:', lang, 'Current originalMenu:', !!currentOriginalMenu, 'Loading:', loading);

    

    // Prevent language changes during menu generation

    if (loading) {

      console.log('⏳ Menu generation in progress, ignoring language change');

      return;

    }

    

    if (!currentOriginalMenu) {

      console.log('❌ No originalMenu available for translation');

      return; // Nothing to translate

    }



    // If switching to English, instantly use the original menu

    if (lang === 'en') {

      console.log('✅ Switching to English, using originalMenu directly');

      setMenu(currentOriginalMenu);

      return;

    }



    // For other languages, translate from the pristine original menu

    console.log('🌐 Starting translation to:', lang);

    setLoading(true);

    setError(null);

    

    try {

      console.log('📋 Translating menu with', currentOriginalMenu.meals?.length, 'meals');

      

      const translated = await translateMenu(currentOriginalMenu, lang);

      console.log('✅ Translation completed, setting menu');

      setMenu(translated);

    } catch (err) {

      console.error('❌ Translation failed:', err);

      setError('Failed to translate menu.');

      setMenu(currentOriginalMenu); // Fallback to original on error

    } finally {

      setLoading(false);

    }

  }, [loading]); // Include loading in dependencies to prevent changes during generation



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

    const response = await fetch('https://dietitian-be.azurewebsites.net/api/generate-alternative-meal', {

    // const response = await fetch('http://127.0.0.1:8000/api/generate-alternative-meal', {

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



  // Auto-fetch user targets and client recommendations when selectedClient changes

  useEffect(() => {

    if (selectedClient) {

      console.log('🔄 Fetching user targets for selected client:', selectedClient.user_code);

      fetchUserTargets(selectedClient.user_code);

      

      // Also fetch client recommendations

      console.log('🔄 Fetching client recommendations for selected client:', selectedClient.user_code);

      fetchClientRecommendations(selectedClient.user_code);

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



  const handleAddIngredient = (mealIndex, optionIndex, alternativeIndex = null) => {

    setMenu(prevMenu => {

      // Save current state to undo stack before making changes

      saveToUndoStack(prevMenu);

      

      const updatedMenu = JSON.parse(JSON.stringify(prevMenu));

      const meal = updatedMenu.meals[mealIndex];

      

      if (!meal) {

        console.error('❌ Meal not found at index:', mealIndex);

        return prevMenu;

      }

      

      // Get the correct option based on whether it's in the alternatives array

      let option;

      if (alternativeIndex !== null) {

        option = meal.alternatives[alternativeIndex];

      } else {

        option = optionIndex === 'main' ? meal.main : meal.alternative;

      }

      

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

      

      // Get the correct option based on whether it's in the alternatives array

      let option;

      if (alternativeIndex !== null) {

        option = meal.alternatives[alternativeIndex];

      } else {

        option = optionIndex === 'main' ? meal.main : meal.alternative;

      }

      

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



  // Recommendations management functions

  const addRecommendation = () => {

    console.log('➕ Adding new recommendation...');

    const newRecommendation = {

      id: Date.now(),

      category: 'general',

      title: '',

      content: '',

      priority: 'medium'

    };

    console.log('📝 New recommendation object:', newRecommendation);

    setEditingRecommendation(newRecommendation);

    setShowRecommendationsDialog(true);

  };



  const editRecommendation = (recommendation) => {

    setEditingRecommendation(recommendation);

    setShowRecommendationsDialog(true);

  };



  const deleteRecommendation = (id) => {

    setRecommendations(prev => prev.filter(rec => rec.id !== id));

  };



  const saveRecommendation = (recommendation) => {

    console.log('💾 Saving recommendation:', recommendation);

    console.log('📋 Current editingRecommendation:', editingRecommendation);

    console.log('📋 Current recommendations list:', recommendations);

    

    if (editingRecommendation && editingRecommendation.id && recommendations.some(rec => rec.id === editingRecommendation.id)) {

      console.log('🔄 Updating existing recommendation');

      // Update existing recommendation (one that was already in the list)

      setRecommendations(prev => 

        prev.map(rec => rec.id === editingRecommendation.id ? recommendation : rec)

      );

    } else {

      console.log('➕ Adding new recommendation to list');

      // Add new recommendation

      setRecommendations(prev => [...prev, recommendation]);

    }

    setShowRecommendationsDialog(false);

    setEditingRecommendation(null);

  };



  const cancelRecommendationEdit = () => {

    setShowRecommendationsDialog(false);

    setEditingRecommendation(null);

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

          const savedRecommendations = localStorage.getItem('menuCreate_recommendations');

          if (!savedMenu && !savedRecommendations) return false;

          

          const parsed = savedMenu ? JSON.parse(savedMenu) : null;

          const savedAt = parsed?._savedAt ? new Date(parsed._savedAt).toLocaleString() : 'Unknown time';

          const savedUser = parsed?._selectedUser?.full_name || 'Unknown client';

          const hasRecommendations = savedRecommendations ? JSON.parse(savedRecommendations).length > 0 : false;



          return (

            <Alert className="border-blue-200 bg-blue-50">

              <Clock className="h-4 w-4" />

              <AlertTitle className="text-blue-800">{translations.previousMenuFound || 'Previous Menu Found'}</AlertTitle>

              <AlertDescription className="text-blue-700">

                {translations.previousMenuDescription || 'We found a previously generated menu for'} <strong>{savedUser}</strong> {translations.fromTime || 'from'} <strong>{savedAt}</strong>.

                {hasRecommendations && <span className="block mt-1">💡 {translations.recommendationsAlsoFound || 'Recommendations were also found and will be restored.'}</span>}

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



      {/* Number of Meals per Day Section */}

      {selectedClient && (

        <Card className="border-purple-200 bg-purple-50/30">

          <CardHeader>

            <CardTitle className="flex items-center gap-2 text-purple-800">

              <span>🍽️</span>

              {translations.numberOfMeals || 'Number of Meals per Day'}

            </CardTitle>

            <CardDescription className="text-purple-600">

              {translations.configureMealsPerDay || 'Configure how many meals this client has per day'}

            </CardDescription>

          </CardHeader>

          <CardContent>

            <div className="flex items-center gap-4">

              <div className="flex items-center gap-2">

                <label className="text-sm font-medium text-purple-700">

                  {translations.mealsPerDay || 'Meals per day'}:

                </label>

                <input

                  type="number"

                  min="1"

                  max="10"

                  value={numberOfMeals}

                  onChange={(e) => handleNumberOfMealsChange(parseInt(e.target.value) || 4)}

                  className="w-20 px-3 py-1 border border-purple-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"

                />

              </div>

              <div className="text-sm text-purple-600">

                {translations.currentValue || 'Current'}: {numberOfMeals} {translations.meals || 'meals'}

              </div>

            </div>

          </CardContent>

        </Card>

      )}



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

              {/* Show button only when not loading */}

              {!loading && (

                <div className="flex flex-wrap gap-4">

                  <Button

                    onClick={fetchMenu}

                    disabled={!selectedClient}

                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3"

                  >

                    <span className="text-lg">🎯</span>

                    {translations.generateMenu || 'Generate Menu'}

                  </Button>

                </div>

              )}

              

              {/* Loading Progress Indicator */}

              {loading && (

                <div className="mt-6">

                  <WaterBarLoading />

                </div>

              )}

            </div>

          </CardContent>

        </Card>

      )}

      {/* Daily Calories and Macros Section */}
      {selectedClient && userTargets && (
        <Card className="border-green-200 bg-green-50/30 mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-800">
                <span>🎯</span>
                <CardTitle>{translations.dailyTargetsAndMacros || 'Daily Targets & Macros'}</CardTitle>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsDailyTargetsMinimized(!isDailyTargetsMinimized)}
                className="text-green-600 hover:bg-green-100"
                title={isDailyTargetsMinimized ? "Expand Daily Targets & Macros" : "Minimize Daily Targets & Macros"}
              >
                {isDailyTargetsMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
            <CardDescription className="text-green-600">
              {translations.dailyTargetsDescription || 'Set daily calorie targets and macronutrient distribution'}
            </CardDescription>
          </CardHeader>
          {!isDailyTargetsMinimized && (
            <CardContent>
            <div className="space-y-6">
              {/* Daily Target Calories */}
              <div className="space-y-2">
                <Label htmlFor="daily_target_calories" className="text-sm font-medium text-gray-700">
                  {translations.dailyTargetCalories || 'Daily Target Calories'}
                </Label>
                <div className="relative">
                  <Input
                    id="daily_target_calories"
                    type="number"
                    value={userTargets?.calories_per_day || ''}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setUserTargets(prev => ({
                        ...prev,
                        calories_per_day: newValue
                      }));
                    }}
                    className="border-gray-300 focus:border-green-500 focus:ring-green-200"
                    placeholder="2000"
                  />
                  {/* Show original DB value if different from current */}
                  {selectedClient?.daily_target_total_calories && 
                   selectedClient.daily_target_total_calories !== userTargets?.calories_per_day && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <div className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded border">
                        DB: {selectedClient.daily_target_total_calories}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {translations.dailyTargetDescription || 'Total daily calorie target for the client'}
                  {selectedClient?.daily_target_total_calories && 
                   selectedClient.daily_target_total_calories !== userTargets?.calories_per_day && (
                    <span className="text-blue-600 ml-2">
                      • Original: {selectedClient.daily_target_total_calories} kcal
                    </span>
                  )}
                </p>
              </div>

              {/* Macro Distribution */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-medium text-gray-800">
                      {translations.macroDistribution || 'Macro Distribution'}
                    </Label>
                    <p className="text-sm text-gray-600 mt-1">
                      {translations.macrosDescription || 'Set macronutrient targets'}
                    </p>
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
                      title={translations.lockAllMacrosTooltip || 'Lock all macros'}
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
                      title={translations.unlockAllMacrosTooltip || 'Unlock all macros'}
                    >
                      🔓 {translations.unlockAll || 'Unlock All'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const calories = parseInt(userTargets?.calories_per_day) || 0;
                        if (calories > 0) {
                          const weight = parseFloat(selectedClient?.weight_kg) || 0;
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
                          setPreviousMacroDistribution({
                            protein: defaultMacros.protein.percentage,
                            carbs: defaultMacros.carbs.percentage,
                            fat: defaultMacros.fat.percentage
                          });
                        }
                      }}
                      className="text-blue-600 border-blue-300 hover:bg-blue-50 text-xs"
                      disabled={!userTargets?.calories_per_day}
                    >
                      🔄 {translations.resetToDefault || 'Reset to Default (30/40/30)'}
                    </Button>
                  </div>
                </div>

                {/* Macro Input Rows */}
                <div className="space-y-3">
                  {(() => {
                    const dailyCalories = parseInt(userTargets?.calories_per_day) || 0;
                    const maxProteinGrams = dailyCalories > 0 ? Math.ceil(dailyCalories / 4) : 300;
                    const maxCarbsGrams = dailyCalories > 0 ? Math.ceil(dailyCalories / 4) : 400;
                    const maxFatGrams = dailyCalories > 0 ? Math.ceil(dailyCalories / 9) : 150;
                    const maxProtein = Math.min(maxProteinGrams, 500);
                    const maxCarbs = Math.min(maxCarbsGrams, 800);
                    const maxFat = Math.min(maxFatGrams, 200);
                    
                    const macroConfig = [
                      { key: 'protein', label: translations.protein || 'Protein', color: 'blue', maxGrams: maxProtein, icon: '💪' },
                      { key: 'carbs', label: translations.carbs || 'Carbs', color: 'purple', maxGrams: maxCarbs, icon: '🍞' },
                      { key: 'fat', label: translations.fat || 'Fat', color: 'teal', maxGrams: maxFat, icon: '🥑' }
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
                              title={lockedMacros[macro.key] ? 'Unlock macro' : 'Lock macro'}
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
                          </div>
                          
                          {/* Grams Input */}
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">{translations.grams || 'Grams'}</Label>
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
                            ? translations.macrosReadyToGo || 'Your nutrition targets are ready to go!' 
                            : validateMacroPercentages().warning
                        }
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{macroInputs.protein.percentage.toFixed(1)}%</div>
                      <div className="text-xs text-gray-600">{translations.protein || 'Protein'}</div>
                      <div className="text-xs text-gray-500">{macroInputs.protein.grams}g</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{macroInputs.carbs.percentage.toFixed(1)}%</div>
                      <div className="text-xs text-gray-600">{translations.carbs || 'Carbs'}</div>
                      <div className="text-xs text-gray-500">{macroInputs.carbs.grams}g</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-teal-600">{macroInputs.fat.percentage.toFixed(1)}%</div>
                      <div className="text-xs text-gray-600">{translations.fat || 'Fat'}</div>
                      <div className="text-xs text-gray-500">{macroInputs.fat.grams}g</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-300">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{translations.totalPercentage || 'Total Percentage'}:</span>
                      <span className={`font-semibold ${
                        validateMacroPercentages().isValid ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {calculateTotals().totalPercentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-600">{translations.totalCaloriesFromMacros || 'Total Calories from Macros'}:</span>
                      <span className="font-semibold text-gray-800">{calculateTotals().totalCalories} kcal</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                {/* Show unsaved changes indicator */}
                {(() => {
                  const hasCalorieChanges = selectedClient?.daily_target_total_calories && 
                    selectedClient.daily_target_total_calories !== userTargets?.calories_per_day;
                  
                  const hasMacroChanges = selectedClient?.macros && (
                    selectedClient.macros.protein !== macroInputs.protein.grams ||
                    selectedClient.macros.carbs !== macroInputs.carbs.grams ||
                    selectedClient.macros.fat !== macroInputs.fat.grams
                  );
                  
                  const hasChanges = hasCalorieChanges || hasMacroChanges;
                  
                  return hasChanges ? (
                    <div className="flex items-center gap-2 text-amber-600">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      <span className="text-sm font-medium">
                        {translations.unsavedChanges || 'Unsaved changes'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">
                        {translations.allChangesSaved || 'All changes saved'}
                      </span>
                    </div>
                  );
                })()}
                
                <Button
                  onClick={async () => {
                    try {
                      setSaving(true);
                      
                      // Prepare the data to save
                      const saveData = {
                        daily_target_total_calories: parseInt(userTargets?.calories_per_day) || 0,
                        macros: {
                          protein: macroInputs.protein.grams,
                          carbs: macroInputs.carbs.grams,
                          fat: macroInputs.fat.grams
                        },
                        meal_plan_structure: mealPlanStructure.map(meal => ({
                          meal: meal.meal,
                          description: meal.description,
                          calories: meal.calories,
                          calories_pct: meal.calories_pct
                        }))
                      };

                      console.log('💾 Saving nutrition targets and meal plan structure:', saveData);

                      // Update the client in the database
                      const { error } = await supabase
                        .from('chat_users')
                        .update({
                          daily_target_total_calories: saveData.daily_target_total_calories,
                          macros: saveData.macros,
                          meal_plan_structure: saveData.meal_plan_structure
                        })
                        .eq('user_code', selectedClient.user_code);

                      if (error) {
                        console.error('❌ Error saving nutrition targets:', error);
                        setError('Failed to save nutrition targets: ' + error.message);
                        return;
                      }

                      console.log('✅ Nutrition targets and meal plan structure saved successfully');
                      
                      // Update the selectedClient to reflect the saved values
                      // This will hide the "DB: original value" indicators
                      if (window.updateClientContext) {
                        window.updateClientContext({
                          ...selectedClient,
                          daily_target_total_calories: saveData.daily_target_total_calories,
                          macros: saveData.macros,
                          meal_plan_structure: saveData.meal_plan_structure
                        });
                      }

                      // Refresh the Nutrition Targets tab by re-fetching latest targets/macros
                      try {
                        await fetchUserTargets(selectedClient.user_code);
                      } catch (e) {
                        console.warn('⚠️ Failed to refresh user targets after save:', e);
                      }

                      // Update the saved meal plan structure to reflect the changes
                      setSavedMealPlanStructure(saveData.meal_plan_structure);
                      setHasUnsavedMealPlanChanges(false);

                      // Show success message (you could add a toast notification here)
                      alert('Nutrition targets and meal plan structure saved successfully!');
                      
                    } catch (err) {
                      console.error('❌ Error saving nutrition targets:', err);
                      setError('Failed to save nutrition targets: ' + err.message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving || !selectedClient}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {saving ? (
                    <>
                      <Loader className="animate-spin h-4 w-4 mr-2" />
                      {translations.saving || 'Saving...'}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {translations.saveNutritionTargets || 'Save Nutrition Targets'}
                    </>
                  )}
                </Button>
              </div>
            </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Meal Plan Structure Section */}

      {selectedClient && userTargets && (

        <Card className="border-blue-200 bg-blue-50/30 mb-6 transition-all duration-500 rounded-lg" data-meal-plan-section>

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

            <CardContent className="animate-in slide-in-from-top-2 duration-300">

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

                      onClick={updateMealPlanDescriptionsWithAI}

                      disabled={updatingMealDescriptions}

                      className="text-purple-600 border-purple-600 hover:bg-purple-50 disabled:opacity-50"

                      title="Use AI to update meal descriptions based on client's eating habits"

                    >

                      {updatingMealDescriptions ? (

                        <Loader className={`h-4 w-4 ${dir === 'rtl' ? 'ml-1' : 'mr-1'} animate-spin`} />

                      ) : (

                        <Sparkles className={`h-4 w-4 ${dir === 'rtl' ? 'ml-1' : 'mr-1'}`} />

                      )}

                      {updatingMealDescriptions ? (translations.updating || 'Updating...') : (translations.aiUpdate || 'AI Update')}

                    </Button>

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

                      onClick={saveAsTemplate}

                      className="text-purple-600 border-purple-600 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed"

                      title={

                        mealPlanStructure.some(meal => !meal.description || meal.description.trim() === '')

                          ? translations.fillAllMealsFirst || 'Fill all meal descriptions first'

                          : translations.saveCurrentAsReusableTemplate || 'Save current meal plan as a reusable template'

                      }

                      disabled={

                        mealPlanStructure.length === 0 || 

                        mealPlanStructure.some(meal => !meal.description || meal.description.trim() === '')

                      }

                    >

                      <Save className={`h-4 w-4 ${dir === 'rtl' ? 'ml-1' : 'mr-1'}`} />

                      {translations.saveAsTemplate || 'Save as Template'}

                    </Button>

                    <Button

                      type="button"

                      variant="outline"

                      size="sm"

                      onClick={addMealToPlan}

                      className="text-green-600 border-green-600 hover:bg-green-50"

                    >

                      <Plus className={`h-4 w-4 ${dir === 'rtl' ? 'ml-1' : 'mr-1'}`} />

                      {translations.addMeal || 'Add Meal'}

                    </Button>

                  </div>

                </div>

                {/* Meal Template Selector */}
                <div className="border border-blue-200 rounded-lg p-3 bg-gradient-to-br from-blue-50 to-white mb-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 flex-shrink-0 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                      <span className="text-lg">📝</span>
                      <label className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                        {translations.mealTemplate || 'Meal Template'}:
                      </label>
                    </div>
                    <div className="flex-1">
                      <Select
                        value={selectedTemplate?.id || ''}
                        onValueChange={(value) => {
                          const template = mealTemplates.find(t => t.id === value);
                          if (template) {
                            applyMealTemplate(template);
                          }
                        }}
                        disabled={loadingTemplates}
                      >
                        <SelectTrigger className="w-full bg-white border-blue-200 hover:border-blue-300 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                          <SelectValue placeholder={loadingTemplates ? 'Loading templates...' : (translations.selectTemplate || 'Select a template (optional)')} />
                        </SelectTrigger>
                        <SelectContent className="max-h-[400px]">
                          {mealTemplates.map(template => {
                            const currentMealCount = numberOfMeals || 4;
                            const hasMatchingVariant = template.availableMealCounts?.includes(currentMealCount);
                            const isDisabled = !hasMatchingVariant;
                            const displayName = getTemplateDisplayName(template);
                            const templateEmoji = getTemplateEmoji(template.name);
                            
                            return (
                              <SelectItem 
                                key={template.id} 
                                value={template.id}
                                disabled={isDisabled}
                                className={`cursor-pointer ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 focus:bg-blue-50'}`}
                              >
                                <div className="flex items-center justify-between gap-3 py-1 w-full">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{templateEmoji}</span>
                                    <span className="font-medium">{displayName}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {template.tags && template.tags.length > 0 && (
                                      <span className="text-xs text-gray-500">({template.tags.join(', ')})</span>
                                    )}
                                    <Badge 
                                      variant="outline" 
                                      className={`text-xs ${hasMatchingVariant ? 'bg-green-50 border-green-300 text-green-700' : 'bg-red-50 border-red-300 text-red-700'}`}
                                    >
                                      {template.availableMealCounts?.join(', ') || '?'} meals
                                    </Badge>
                                  </div>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTemplateManager(true)}
                      className="text-purple-600 border-purple-300 hover:bg-purple-50 whitespace-nowrap"
                      title={translations.manageTemplates || 'Manage Templates'}
                    >
                      <span className={dir === 'rtl' ? 'ml-1' : 'mr-1'}>⚙️</span> {translations.manage || 'Manage'}
                    </Button>
                    {selectedTemplate && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Clear the template selection
                          setSelectedTemplate(null);
                          
                          // Also clear all meal descriptions from the structure
                          setMealPlanStructure(prev => prev.map(meal => ({
                            ...meal,
                            description: ''
                          })));
                          
                          // Mark as having unsaved changes
                          setHasUnsavedMealPlanChanges(true);
                        }}
                        className="text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md flex-shrink-0 h-8 w-8 p-0"
                        title="Clear template selection and meal descriptions"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {selectedTemplate && (
                    <div className="mt-2 flex items-start gap-2 bg-blue-100/50 border border-blue-200 rounded-md p-2">
                      <span className="text-blue-600">ℹ️</span>
                      <p className="text-xs text-blue-800">
                        <span className="font-medium">{translations.templateApplied || 'Template applied'}:</span> <span className="text-base">{getTemplateEmoji(selectedTemplate.name)}</span> {getTemplateDisplayName(selectedTemplate)}
                        <span className="ml-2 text-blue-600">({numberOfMeals} meals)</span>
                      </p>
                    </div>
                  )}
                  {!selectedTemplate && mealTemplates.length > 0 && (() => {
                    const currentMealCount = numberOfMeals || 4;
                    const compatibleCount = mealTemplates.filter(t => t.availableMealCounts?.includes(currentMealCount)).length;
                    const totalCount = mealTemplates.length;
                    
                    return (
                      <div className={`mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md p-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                        <span className="text-blue-600">💡</span>
                        <div className="flex-1">
                          <p className="text-xs text-blue-700">
                            {(translations.templateFilterInfo || `Showing templates for ${currentMealCount} meals:`).replace('{count}', currentMealCount)}
                          </p>
                          <p className="text-xs text-blue-600 font-medium mt-0.5">
                            {compatibleCount} {translations.compatibleTemplates || 'compatible'}, {totalCount - compatibleCount} {translations.incompatibleDisabled || 'incompatible (disabled)'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    // Only show warning if no template AND meals are not all filled
                    const mealsWithDescriptions = mealPlanStructure.filter(meal => 
                      meal.description && meal.description.trim() !== ''
                    ).length;
                    const totalMeals = mealPlanStructure.length;
                    const allMealsFilled = mealsWithDescriptions === totalMeals;
                    
                    if (!selectedTemplate && !allMealsFilled) {
                      return (
                        <div className={`mt-2 flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-md p-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                          <span className="text-amber-600 text-lg">⚠️</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-amber-900 mb-1">
                              {translations.noTemplateSelected || 'No template selected'}
                            </p>
                            <p className="text-xs text-amber-800">
                              {translations.mustFillAllDescriptions || 'You must fill in descriptions for ALL meals below, or select a template above. Partial descriptions are not allowed.'}
                            </p>
                            <p className="text-xs text-amber-700 mt-1 font-medium">
                              {translations.currentProgress || 'Progress'}: {(translations.mealsFilledProgress || '{filled}/{total} meals filled').replace('{filled}', mealsWithDescriptions).replace('{total}', totalMeals)}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
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

                      <div className="grid grid-cols-12 gap-2 items-start">

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

                        <div className="col-span-2 flex">

                          <div className="relative flex-1 w-full" data-description-field="true">

                            {expandedDescriptionIndex === index ? (
                              <Textarea

                                value={meal.description}

                                onChange={(e) => {
                                  updateMealInPlan(index, 'description', e.target.value);
                                  // Auto-resize textarea when expanded
                                  e.target.style.height = 'auto';
                                  e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
                                }}

                                onBlur={() => {
                                  // Clear any existing timeout
                                  if (blurTimeoutRef.current) {
                                    clearTimeout(blurTimeoutRef.current);
                                  }
                                  
                                  // Delay collapse to allow clicking another field to expand first
                                  blurTimeoutRef.current = setTimeout(() => {
                                    setExpandedDescriptionIndex((currentExpanded) => {
                                      // Only collapse if we're still expanded on this field
                                      return currentExpanded === index ? null : currentExpanded;
                                    });
                                  }, 150);
                                }}

                                className={`text-sm resize-none flex-1 w-full transition-all duration-200 min-h-[100px] max-h-[300px] ${!selectedTemplate && (!meal.description || meal.description.trim() === '') ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200' : ''}`}

                                placeholder={!selectedTemplate ? (translations.required || 'Required') : (translations.mealDescriptionShort || translations.descriptionPlaceholder || 'Optional description')}

                                rows={4}

                                autoFocus

                              />
                            ) : (
                              <Input

                                value={meal.description}

                                onMouseDown={(e) => {
                                  // Clear any pending blur timeout from previous field
                                  if (blurTimeoutRef.current) {
                                    clearTimeout(blurTimeoutRef.current);
                                    blurTimeoutRef.current = null;
                                  }
                                  
                                  // Set expanded index immediately on mouse down (before blur fires)
                                  e.preventDefault();
                                  setExpandedDescriptionIndex(index);
                                }}

                                readOnly

                                className={`text-sm cursor-pointer truncate ${!selectedTemplate && (!meal.description || meal.description.trim() === '') ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200' : ''}`}

                                placeholder={!selectedTemplate ? (translations.required || 'Required') : (translations.mealDescriptionShort || translations.descriptionPlaceholder || 'Optional description')}

                                title={meal.description || ''}

                              />
                            )}

                            {!selectedTemplate && (!meal.description || meal.description.trim() === '') && (

                              <span className="absolute -right-2 -top-2 flex h-3 w-3">

                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>

                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>

                              </span>

                            )}

                          </div>

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

                        {mealPlanStructure.reduce((sum, meal) => sum + (meal.calories || 0), 0)} / {userTargets?.calories_per_day || userTargets?.calories || 0}

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

                        {Math.max(0, (userTargets?.calories_per_day || userTargets?.calories || 0) - mealPlanStructure.filter(meal => meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0))} kcal

                      </span>

                    </div>

                    <div>

                      <span className="text-gray-600">{translations.maxPerMeal || 'Max per Meal'}: </span>

                      <span className="font-medium text-orange-600">

                        {Math.max(0, (userTargets?.calories_per_day || userTargets?.calories || 0) - mealPlanStructure.filter(meal => meal.locked).reduce((sum, meal) => sum + (meal.calories || 0), 0))} kcal

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

                  

                  {/* Validation Status Indicator */}

                  {(() => {

                    const mealsWithDescriptions = mealPlanStructure.filter(meal => 

                      meal.description && meal.description.trim() !== ''

                    ).length;

                    const totalMeals = mealPlanStructure.length;

                    const hasTemplate = !!selectedTemplate;

                    const isValid = hasTemplate || mealsWithDescriptions === totalMeals;

                    const isPartial = !hasTemplate && mealsWithDescriptions > 0 && mealsWithDescriptions < totalMeals;

                    

                    return (

                      <div className={`mt-4 p-3 rounded-lg border-2 ${

                        isValid 

                          ? 'bg-green-50 border-green-300' 

                          : isPartial

                          ? 'bg-amber-50 border-amber-400'

                          : 'bg-red-50 border-red-300'

                      }`}>

                        <div className="flex items-center gap-2">

                          <span className="text-lg">

                            {isValid ? '✅' : isPartial ? '⚠️' : '❌'}

                          </span>

                          <div className="flex-1">

                            <p className={`text-sm font-semibold ${

                              isValid ? 'text-green-800' : isPartial ? 'text-amber-800' : 'text-red-800'

                            }`}>

                              {isValid 

                                ? (hasTemplate 

                                  ? (translations.templateSelectedReady || `Template selected: Ready to generate!`) 

                                  : ((translations.allMealsFilledReady || `All ${totalMeals} meals filled: Ready to generate!`).replace('{count}', totalMeals)))

                                : isPartial

                                ? ((translations.partialMealsWarning || `${mealsWithDescriptions}/${totalMeals} meals filled - Complete all or select a template`).replace('{filled}', mealsWithDescriptions).replace('{total}', totalMeals))

                                : (translations.noMealsFilledWarning || 'No meals filled - Fill all meals or select a template')

                              }

                            </p>

                          </div>

                        </div>

                      </div>

                    );

                  })()}

                </div>

              </div>

            </CardContent>

          )}

        </Card>

      )}



      {/* Recommendations Section */}

      {selectedClient && (

        <Card className="border-purple-200 bg-purple-50/30 mb-6">

          <CardHeader>

            <div className="flex items-center justify-between">

              <div className="flex items-center gap-2 text-purple-800">

                <span>💡</span>

                <CardTitle>

                  {translations.recommendations || 'Recommendations'}

                  {(clientRecommendations.length > 0 || recommendations.length > 0) && (

                    <span className="ml-2 text-sm font-normal text-purple-600">

                    </span>

                  )}

                </CardTitle>

              </div>

              <Button

                type="button"

                variant="ghost"

                size="sm"

                onClick={() => setIsRecommendationsMinimized(!isRecommendationsMinimized)}

                className="text-purple-600 hover:bg-purple-100"

                title={isRecommendationsMinimized ? "Expand Recommendations" : "Minimize Recommendations"}

              >

                {isRecommendationsMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}

              </Button>

              <Button

                type="button"

                variant="outline"

                size="sm"

                onClick={addRecommendation}

                className="text-purple-600 border-purple-600 hover:bg-purple-50"

              >

                <Plus className="h-4 w-4 mr-1" />

                {translations.addRecommendation || 'Add Recommendation'}

              </Button>

            </div>

            <CardDescription className="text-purple-600">

              {translations.recommendationsDescription || 'Add personalized recommendations for this meal plan'}

            </CardDescription>

          </CardHeader>

          {!isRecommendationsMinimized && (

          <CardContent>

            <div className="space-y-6">

              {/* Client Recommendations Section */}

              {selectedClient && (

                <div>

                  <div className="flex items-center gap-2 mb-4">

                    <h3 className="text-lg font-semibold text-gray-800">

                      {translations.clientRecommendations || 'Client Recommendations'}

                    </h3>

                    <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">

                      {translations.fromDatabase || 'From Database'}

                    </Badge>

                    {loadingClientRecommendations && (

                      <Loader className="animate-spin h-4 w-4 text-blue-600" />

                    )}

                  </div>

                  

                  {clientRecommendations.length > 0 ? (

                    <div className="space-y-3">

                      {clientRecommendations.map((rec, index) => (

                        <div key={rec.id} className="bg-blue-50 rounded-lg p-4 border border-blue-200 shadow-sm">

                          <div className="flex items-start justify-between mb-3">

                            <div className="flex items-center gap-2">

                              <Badge 

                                variant="outline" 

                                className={`${

                                  rec.priority === 'high' ? 'bg-red-50 border-red-200 text-red-700' :

                                  rec.priority === 'medium' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :

                                  'bg-green-50 border-green-200 text-green-700'

                                }`}

                              >

                                {rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢'} {translations[rec.priority + 'Priority'] || rec.priority}

                              </Badge>

                              <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">

                                {translations[rec.category + 'Recommendation'] || rec.category}

                              </Badge>

                              <Badge variant="outline" className="bg-gray-50 border-gray-200 text-gray-600">

                                {translations.clients || 'Client'}

                              </Badge>

                            </div>

                            <div className="flex gap-2">

                              <Button

                                type="button"

                                variant="outline"

                                size="sm"

                                onClick={() => {

                                  // Convert client recommendation to meal plan recommendation

                                  const mealPlanRec = {

                                    id: Date.now(),

                                    category: rec.category,

                                    title: rec.title,

                                    content: rec.content,

                                    priority: rec.priority,

                                    source: 'meal_plan'

                                  };

                                  setRecommendations(prev => [...prev, mealPlanRec]);

                                  setClientRecommendations(prev => prev.filter(r => r.id !== rec.id));

                                }}

                                className="text-green-600 border-green-600 hover:bg-green-50"

                                title={translations.addRecommendation || 'Add Recommendation'}

                              >

                                ➕

                              </Button>

                              <Button

                                type="button"

                                variant="outline"

                                size="sm"

                                onClick={() => {

                                  if (window.confirm(translations.confirmRemoveClientRecommendation || 'Remove this client recommendation from the meal plan? (This will not affect the original client data)')) {

                                    setClientRecommendations(prev => prev.filter(r => r.id !== rec.id));

                                  }

                                }}

                                className="text-orange-600 border-orange-600 hover:bg-orange-50"

                                title={translations.delete || 'Delete'}

                              >

                                ➖

                              </Button>

                            </div>

                          </div>

                          <h4 className="font-semibold text-gray-900 mb-2">

                            {translations[rec.category + 'Recommendation'] || rec.title}

                          </h4>

                          <p className="text-gray-700 text-sm leading-relaxed">{rec.content}</p>

                        </div>

                      ))}

                    </div>

                  ) : (

                    <div className="text-center py-4 text-gray-500">

                      <div className="text-2xl mb-2">📋</div>

                      <p className="text-sm">{translations.noClientRecommendations || 'No client recommendations found'}</p>

                    </div>

                  )}

                </div>

              )}



              {/* Separator */}

              {selectedClient && (recommendations.length > 0 || clientRecommendations.length > 0) && (

                <Separator className="my-4" />

              )}



              {/* Meal Plan Recommendations Section */}

              <div>

                <div className="flex items-center gap-2 mb-4">

                  <h3 className="text-lg font-semibold text-gray-800">

                    {translations.mealPlanRecommendations || 'Meal Plan Recommendations'}

                  </h3>

                  <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700">

                    {translations.mealPlanSpecific || 'Meal Plan Specific'}

                  </Badge>

                </div>

                

            {recommendations.length > 0 ? (

              <div className="space-y-3">

                {recommendations.map((rec, index) => (

                  <div key={rec.id} className="bg-white rounded-lg p-4 border border-purple-200 shadow-sm">

                    <div className="flex items-start justify-between mb-3">

                      <div className="flex items-center gap-2">

                        <Badge 

                          variant="outline" 

                          className={`${

                            rec.priority === 'high' ? 'bg-red-50 border-red-200 text-red-700' :

                            rec.priority === 'medium' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :

                            'bg-green-50 border-green-200 text-green-700'

                          }`}

                        >

                          {rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢'} {translations[rec.priority + 'Priority'] || rec.priority}

                        </Badge>

                        <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700">

                          {translations[rec.category + 'Recommendation'] || rec.category}

                        </Badge>

                            <Badge variant="outline" className="bg-gray-50 border-gray-200 text-gray-600">

                              {translations.menuPlan || 'Meal Plan'}

                        </Badge>

                      </div>

                      <div className="flex gap-2">

                        <Button

                          type="button"

                          variant="outline"

                          size="sm"

                          onClick={() => editRecommendation(rec)}

                          className="text-blue-600 border-blue-600 hover:bg-blue-50"

                        >

                          ✏️

                        </Button>

                        <Button

                          type="button"

                          variant="outline"

                          size="sm"

                          onClick={() => {

                            if (window.confirm(translations.confirmDeleteRecommendation || 'Are you sure you want to delete this recommendation?')) {

                              deleteRecommendation(rec.id);

                            }

                          }}

                          className="text-red-600 border-red-600 hover:bg-red-50"

                        >

                          🗑️

                        </Button>

                      </div>

                    </div>

                    <h4 className="font-semibold text-gray-900 mb-2">

                      {translations[rec.category + 'Recommendation'] || rec.title}

                    </h4>

                    <p className="text-gray-700 text-sm leading-relaxed">{rec.content}</p>

                  </div>

                ))}

              </div>

            ) : (

              <div className="text-center py-8 text-gray-500">

                <div className="text-4xl mb-2">💡</div>

                    <p className="text-sm">{translations.noMealPlanRecommendations || 'No meal plan recommendations added yet'}</p>

                <p className="text-xs mt-1">{translations.addRecommendationsPrompt || 'Click "Add Recommendation" to get started'}</p>

              </div>

            )}

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

                      {selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories}

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

                            <span className="font-bold text-blue-700">{selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories}</span>

                          </div>

                          <div className="flex justify-between items-center">

                            <span className="text-sm text-green-600">{translations.generated || 'Generated'}:</span>

                            <span className="font-bold text-green-700">{menu.totals.calories}</span>

                          </div>

                          <div className="flex justify-between items-center pt-1 border-t border-gray-100">

                            <span className="text-xs text-gray-500">{translations.difference || 'Difference'}:</span>

                            <span className={`text-sm font-medium ${Math.abs(menu.totals.calories - (selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories)) <= (selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories) * 0.05

                                ? 'text-green-600'

                                : 'text-red-600'

                              }`}>

                              {`${menu.totals.calories - (selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories) > 0 ? '+' : ''}${((menu.totals.calories - (selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories)) / (selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories) * 100)

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

                            const caloriesDiff = Math.abs((menu.totals.calories - (selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories)) / (selectedClient?.daily_target_total_calories || userTargets?.calories_per_day || userTargets?.calories) * 100);

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

              <Card key={mealIdx} className="overflow-visible">

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

                            <div key={altIdx} className="bg-blue-50 rounded-lg p-3">

                              <div className="flex justify-between items-start mb-3">

                                <div className="flex-1">

                                  {renderMealOption({ ...alt, mealIndex: mealIdx, alternativeIndex: altIdx }, true)}

                                </div>

                              <Button

                                variant="outline"

                                size="sm"

                                  className="text-red-600 hover:bg-red-50 border-red-300 ml-3 flex-shrink-0"

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

                              </div>

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

      {/* PDF Options */}

      <div className="space-y-3">

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

          <Button onClick={() => downloadPdf(menu, 'portrait')} variant="outline">

            {translations.downloadPortraitPdf || 'Download PDF (Portrait)'}

          </Button>

          <Button onClick={() => downloadPdf(menu, 'landscape')} className="bg-blue-600 hover:bg-blue-700">

            {translations.downloadLandscapePdf || 'Download PDF (Landscape)'}

          </Button>

        </div>

      </div>



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



      {/* Recommendations Dialog */}

      <Dialog open={showRecommendationsDialog} onOpenChange={setShowRecommendationsDialog}>

        <DialogContent className="sm:max-w-2xl">

          <DialogHeader>

            <DialogTitle className="flex items-center gap-2 text-purple-600">

              <span className="text-2xl">💡</span>

              {editingRecommendation ? (translations.editRecommendation || 'Edit Recommendation') : (translations.addRecommendation || 'Add Recommendation')}

            </DialogTitle>

            <DialogDescription className="text-gray-600 pt-2">

              {translations.recommendationDialogDescription || 'Add personalized recommendations for this meal plan'}

            </DialogDescription>

          </DialogHeader>

          

          <RecommendationForm

            recommendation={editingRecommendation}

            onSave={saveRecommendation}

            onCancel={cancelRecommendationEdit}

            translations={translations}

          />

        </DialogContent>

      </Dialog>



      {/* Empty Meal Plan Warning Dialog */}

      <Dialog open={showEmptyMealPlanDialog} onOpenChange={setShowEmptyMealPlanDialog}>

        <DialogContent className="sm:max-w-md">

          <DialogHeader>

            <DialogTitle className="flex items-center gap-2 text-amber-600">

              <span className="text-2xl">⚠️</span>

              {translations.emptyMealPlanWarning || 'Empty Meal Plan Warning'}

            </DialogTitle>

            <DialogDescription className="text-gray-600 pt-2">

              {translations.emptyMealPlanMessage || "You didn't fill any of the meals. Are you sure you want to generate with no structure?"}

            </DialogDescription>

          </DialogHeader>

          

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-4">

            <div className="flex items-start gap-3">

              <div className="text-amber-600 text-lg">💡</div>

              <div>

                <h4 className="font-medium text-amber-800 mb-1">

                  {translations.whatThisMeans || 'What this means:'}

                </h4>

                <p className="text-sm text-amber-700">

                  {translations.genericMealPlanExplanation || 'The system will create a generic meal plan without your specific preferences for each meal type. For better results, consider filling in meal descriptions in the Meal Plan Structure section.'}

                </p>

              </div>

            </div>

          </div>



          <DialogFooter className="flex gap-3 sm:gap-3">

            <Button

              variant="outline"

              onClick={handleEmptyMealPlanCancel}

              className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"

            >

              {translations.goBack || 'Go Back'}

            </Button>

            <Button

              onClick={handleEmptyMealPlanConfirm}

              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"

            >

              {translations.continueAnyway || 'Continue Anyway'}

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

      {/* Unsaved Changes Warning Dialog */}

      <Dialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>

        <DialogContent className="sm:max-w-md">

          <DialogHeader>

            <DialogTitle className="flex items-center gap-2 text-orange-600">

              <span className="text-2xl">💾</span>

              {translations.unsavedChangesWarning || 'Unsaved Changes'}

            </DialogTitle>

            <DialogDescription className="text-gray-600 pt-2">

              {translations.unsavedChangesMessage || 'You have unsaved changes to the meal plan structure. Please save your changes before generating a menu.'}

            </DialogDescription>

          </DialogHeader>

          

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 my-4">

            <div className="flex items-start gap-3">

              <div className="text-orange-600 text-lg">⚠️</div>

              <div>

                <h4 className="font-medium text-orange-800 mb-1">

                  {translations.whatYouNeedToDo || 'What you need to do:'}

                </h4>

                <p className="text-sm text-orange-700">

                  {translations.saveMealPlanFirst || 'Go to the "Meal Plan Structure" section and click "Save Plan" to save your changes before generating the menu.'}

                </p>

              </div>

            </div>

          </div>

          

          <DialogFooter className="flex gap-3 sm:gap-3">

            <Button

              variant="outline"

              onClick={() => setShowUnsavedChangesDialog(false)}

              className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"

            >

              {translations.cancel || 'Cancel'}

            </Button>

            <Button

              onClick={() => {

                setShowUnsavedChangesDialog(false);

                // Scroll to meal plan structure section

                const mealPlanSection = document.querySelector('[data-meal-plan-section]');

                if (mealPlanSection) {

                  mealPlanSection.scrollIntoView({ behavior: 'smooth' });

                }

              }}

              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"

            >

              {translations.goToMealPlan || 'Go to Meal Plan'}

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

      {/* Template Limitation Warning Dialog */}
      <Dialog open={showTemplateLimitationDialog} onOpenChange={setShowTemplateLimitationDialog}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <span className="text-2xl">⚠️</span>
                {translations.templateLimitationWarning || 'Template Limitation'}
              </DialogTitle>
              <DialogDescription className="text-gray-600 pt-2">
                {translations.templateLimitationMessage || `You are creating a template with ${pendingTemplateSave?.currentMealsPerDay || mealPlanStructure.length} meals.`}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 my-4">
              {/* Main Explanation */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="text-blue-600 text-lg">ℹ️</div>
                  <div>
                    <h4 className="font-medium text-blue-800 mb-2">
                      {translations.howTemplatesWork || 'How Templates Work:'}
                    </h4>
                    <p className="text-sm text-blue-700 mb-2">
                      {translations.templateReductionExplanation || 'Templates can only be reduced to FEWER meals, not expanded to MORE meals.'}
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-green-600">✅</span>
                        <p className="text-green-700">
                          <span className="font-semibold">{translations.canDo || 'You CAN'}:</span> {translations.canCreateVariants || 'Create variants for'} {pendingTemplateSave?.currentMealsPerDay || mealPlanStructure.length} {translations.mealsOrFewer || 'meals or fewer'}
                        </p>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-red-600">❌</span>
                        <p className="text-red-700">
                          <span className="font-semibold">{translations.cannotDo || 'You CANNOT'}:</span> {translations.cannotCreateVariants || 'Create variants for'} {(translations.moreThanMeals || 'more than {count} meals').replace('{count}', pendingTemplateSave?.currentMealsPerDay || mealPlanStructure.length)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommendation Box */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="text-purple-600 text-lg">💡</div>
                  <div>
                    <h4 className="font-medium text-purple-800 mb-1">
                      {translations.recommendation || 'Recommendation:'}
                    </h4>
                    <p className="text-sm text-purple-700">
                      {translations.createSixMealTemplateRecommendation || 'Create a 6-meal template first to get all possible variants (3, 4, 5, and 6 meals). This gives you maximum flexibility for all clients.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex gap-3 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTemplateLimitationDialog(false);
                  setPendingTemplateSave(null);
                }}
                className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {translations.cancel || 'Cancel'}
              </Button>
              <Button
                onClick={async () => {
                  setShowTemplateLimitationDialog(false);
                  await continueTemplateSave();
                  setPendingTemplateSave(null);
                }}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {translations.continueAnyway || 'Continue Anyway'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Manager Dialog */}
        <Dialog open={showTemplateManager} onOpenChange={setShowTemplateManager}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-purple-600">
                <span className="text-2xl">📋</span>
                {translations.templateManager || 'Template Manager'}
              </DialogTitle>
              <DialogDescription className="text-gray-600 pt-2">
                {translations.createEditManageTemplates || 'Create, edit, and manage your meal plan templates'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* Create New Template Section */}
              <div className="border border-green-200 rounded-lg p-4 bg-green-50/30">
                <h3 className="text-lg font-semibold text-green-800 mb-3 flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  {translations.createNewTemplate || 'Create New Template'}
                </h3>
                <p className="text-sm text-green-700 mb-3">
                  {translations.createTemplateFromCurrent || 'Save your current meal plan structure as a reusable template'}
                </p>
                
                {/* Current Structure Info */}
                <div className={`border rounded-md p-3 mb-3 ${
                  mealPlanStructure.every(meal => meal.description && meal.description.trim() !== '')
                    ? 'bg-white border-green-200'
                    : 'bg-amber-50 border-amber-300'
                }`}>
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <span className="font-semibold text-gray-800">{translations.currentStructure || 'Current structure'}:</span>
                    <Badge variant="outline" className="bg-green-50 border-green-300 text-green-700">
                      {mealPlanStructure.length} {translations.meals || 'meals'}
                    </Badge>
                    <Badge variant="outline" className={
                      mealPlanStructure.every(meal => meal.description && meal.description.trim() !== '')
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-amber-50 border-amber-300 text-amber-700'
                    }>
                      {(translations.mealsFilledProgress || '{filled}/{total} filled').replace('{filled}', mealPlanStructure.filter(m => m.description && m.description.trim() !== '').length).replace('{total}', mealPlanStructure.length)}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-green-600">
                      ✅ {translations.canCreateVariants || 'Can create variants for'}:
                      <span className="font-semibold ml-1">
                        {mealPlanStructure.length} {translations.mealsOrFewer || 'meals or fewer'}
                      </span>
                    </p>
                    {mealPlanStructure.length < 6 && (
                      <p className="text-xs text-red-600">
                        ❌ {translations.cannotCreateVariants || 'Cannot create variants for'}:
                        <span className="font-semibold ml-1">
                          {(translations.moreThanMeals || 'more than {count} meals').replace('{count}', mealPlanStructure.length)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Important Notice */}
                {mealPlanStructure.length === 6 ? (
                  <div className="bg-green-50 border-2 border-green-300 rounded-md p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">🎉</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-900 mb-1">
                          {translations.perfectForTemplate || 'Perfect for Template Creation!'}
                        </p>
                        <p className="text-xs text-green-800">
                          {translations.sixMealOptimal || 'Your 6-meal structure is optimal! You can create variants for all meal counts (3, 4, 5, and 6 meals).'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-md p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">⚠️</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-900 mb-1">
                          {translations.templateLimitation || 'Template Limitation'}
                        </p>
                        <p className="text-xs text-amber-800 mb-2">
                          {translations.templateLimitationExplanation || 'Templates can only be reduced to FEWER meals, not expanded to MORE meals.'}
                        </p>
                        <div className="bg-white border border-amber-300 rounded p-2 mb-2">
                          <p className="text-xs text-amber-900 font-semibold mb-1">
                            📊 {translations.yourCurrentTemplate || 'Your current template'}:
                          </p>
                          <p className="text-xs text-green-700">
                            ✅ {translations.willWorkFor || 'Will work for'}: {mealPlanStructure.length} {translations.mealsOrFewer || 'meals or fewer'}
                          </p>
                          <p className="text-xs text-red-700">
                            ❌ {translations.wontWorkFor || 'Won\'t work for'}: {(translations.moreThanMeals || 'more than {count} meals').replace('{count}', mealPlanStructure.length)}
                          </p>
                        </div>
                        <p className="text-xs text-amber-900 font-semibold bg-amber-100 border border-amber-400 rounded p-2">
                          💡 {translations.createSixMealRecommendation || `To support ALL meal counts (3-6), create a 6-meal template. Or save now for limited compatibility.`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Validation Message */}
                {mealPlanStructure.some(meal => !meal.description || meal.description.trim() === '') && (
                  <div className="bg-red-50 border border-red-300 rounded-md p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">❌</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-red-900 mb-1">
                          {translations.incompleteMealDescriptions || 'Incomplete Meal Descriptions'}
                        </p>
                        <p className="text-xs text-red-800">
                          {(translations.mustFillAllDescriptionsToSave || `You must fill in descriptions for ALL meals before saving as a template. Currently ${mealPlanStructure.filter(m => m.description && m.description.trim() !== '').length} out of ${mealPlanStructure.length} meals are filled.`).replace('{filled}', mealPlanStructure.filter(m => m.description && m.description.trim() !== '').length).replace('{total}', mealPlanStructure.length)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <Button
                  type="button"
                  onClick={async () => {
                    // Close the manager first
                    setShowTemplateManager(false);
                    // Then start the save process (which may show the limitation dialog)
                    await saveAsTemplate();
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white w-full disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={
                    mealPlanStructure.length === 0 || 
                    mealPlanStructure.some(meal => !meal.description || meal.description.trim() === '')
                  }
                  title={
                    mealPlanStructure.some(meal => !meal.description || meal.description.trim() === '')
                      ? translations.fillAllMealsFirst || 'Fill all meal descriptions first'
                      : ''
                  }
                >
                  <Save className="h-4 w-4 mr-2" />
                  {translations.saveCurrentAsTemplate || 'Save Current Meal Plan as Template'}
                  {mealPlanStructure.some(meal => !meal.description || meal.description.trim() === '') && (
                    <span className="ml-2 text-xs">
                      ({mealPlanStructure.filter(m => m.description && m.description.trim() !== '').length}/{mealPlanStructure.length})
                    </span>
                  )}
                </Button>
              </div>

              {/* Existing Templates List */}
              <div>
                <div className="flex flex-col gap-2 mb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-purple-800 flex items-center gap-2">
                      <span>📝</span>
                      {translations.existingTemplates || 'Existing Templates'}
                    </h3>
                    {mealTemplates.length > 0 && (() => {
                      const currentMealCount = numberOfMeals || 4;
                      const yourCount = mealTemplates.filter(t => t.isOwnedByCurrentUser).length;
                      const sharedCount = mealTemplates.filter(t => !t.isOwnedByCurrentUser).length;
                      const compatible = mealTemplates.filter(t => t.availableMealCounts?.includes(currentMealCount)).length;
                      
                      return (
                        <div className="flex gap-2">
                          <Badge variant="outline" className="bg-purple-100 border-purple-300 text-purple-700 font-semibold">
                            👤 {yourCount} {translations.yours || 'yours'}
                          </Badge>
                          <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-700 font-semibold">
                            🌐 {sharedCount} {translations.shared || 'shared'}
                          </Badge>
                          <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 font-semibold">
                            {(translations.compatibleCount || '{compatible}/{total} compatible').replace('{compatible}', compatible).replace('{total}', mealTemplates.length)}
                          </Badge>
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Current Client Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-blue-700 font-medium">{translations.currentClient || 'Current client'}:</span>
                      <Badge variant="outline" className="bg-white border-blue-300 text-blue-700 font-semibold">
                        🍽️ {numberOfMeals || 4} {translations.mealsPerDay || 'meals per day'}
                      </Badge>
                      <span className="text-xs text-blue-600">
                        {(translations.onlyTemplatesWithVariants || '(Only templates with {count}-meal variants can be applied)').replace('{count}', numberOfMeals || 4)}
                      </span>
                    </div>
                  </div>
                </div>
                
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="animate-spin h-6 w-6 text-purple-600" />
                  </div>
                ) : mealTemplates.length > 0 ? (
                  <div className="space-y-4">
                    {/* Your Templates Section */}
                    {(() => {
                      const yourTemplates = mealTemplates.filter(t => t.isOwnedByCurrentUser);
                      if (yourTemplates.length === 0) return null;
                      
                      return (
                        <div>
                          <h4 className="text-md font-semibold text-purple-900 mb-2 flex items-center gap-2">
                            <span>👤</span>
                            {translations.yourTemplates || 'Your Templates'}
                            <Badge variant="outline" className="bg-purple-100 border-purple-300 text-purple-700">
                              {yourTemplates.length}
                            </Badge>
                          </h4>
                          <div className="space-y-3">
                            {yourTemplates.map(template => renderTemplateCard(template))}
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* Shared Templates Section */}
                    {(() => {
                      const sharedTemplates = mealTemplates.filter(t => !t.isOwnedByCurrentUser);
                      if (sharedTemplates.length === 0) return null;
                      
                      return (
                        <div>
                          <h4 className="text-md font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <span>🌐</span>
                            {translations.sharedTemplates || 'Shared Templates'}
                            <Badge variant="outline" className="bg-gray-100 border-gray-300 text-gray-700">
                              {sharedTemplates.length}
                            </Badge>
                          </h4>
                          <div className="space-y-3">
                            {sharedTemplates.map(template => renderTemplateCard(template))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📋</div>
                    <p className="text-sm">{translations.noTemplatesFound || 'No templates found'}</p>
                    <p className="text-xs mt-1">{translations.createFirstTemplate || 'Create your first template using the button above'}</p>
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowTemplateManager(false);
                  setEditingTemplate(null);
                  setTemplateFormData({ name: '', tags: [] });
                }}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {translations.close || 'Close'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Template Dialog */}
        <Dialog open={!!editingTemplate} onOpenChange={(open) => {
          if (!open) {
            setEditingTemplate(null);
            setTemplateFormData({ name: '', tags: [] });
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-blue-600">
                <span className="text-2xl">✏️</span>
                {translations.editTemplate || 'Edit Template'}
              </DialogTitle>
              <DialogDescription className="text-gray-600 pt-2">
                {translations.editTemplateDescription || 'Update the template name and tags'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="template_name" className="text-sm font-medium text-gray-700">
                  {translations.templateName || 'Template Name'} *
                </Label>
                <Input
                  id="template_name"
                  value={templateFormData.name}
                  onChange={(e) => setTemplateFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1"
                  placeholder={translations.templateNamePlaceholder || 'e.g., High-Protein Plan'}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="template_tags" className="text-sm font-medium text-gray-700">
                  {translations.tags || 'Tags'} ({translations.optional || 'optional'})
                </Label>
                <Input
                  id="template_tags"
                  value={templateFormData.tags.join(', ')}
                  onChange={(e) => {
                    const tags = e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                    setTemplateFormData(prev => ({ ...prev, tags }));
                  }}
                  className="mt-1"
                  placeholder={translations.tagsPlaceholder || 'e.g., vegetarian, gluten-free'}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {translations.tagsHint || 'Separate multiple tags with commas'}
                </p>
              </div>
            </div>
            
            <DialogFooter className="flex gap-3 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingTemplate(null);
                  setTemplateFormData({ name: '', tags: [] });
                }}
                className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {translations.cancel || 'Cancel'}
              </Button>
              <Button
                onClick={async () => {
                  if (!templateFormData.name.trim()) {
                    alert(translations.pleaseEnterTemplateName || 'Please enter a template name');
                    return;
                  }
                  
                  try {
                    await updateTemplate(editingTemplate.id, templateFormData.name, templateFormData.tags);
                    alert(translations.templateUpdated || 'Template updated successfully!');
                    setEditingTemplate(null);
                    setTemplateFormData({ name: '', tags: [] });
                  } catch (err) {
                    alert(`Failed to update template: ${err.message}`);
                  }
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {translations.save || 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

            if (ingredient["brand of pruduct"] && shouldShowBrand(ingredient["brand of pruduct"])) {

              ingredient.item = `${ingredient.item} (${ingredient["brand of pruduct"]})`;

            }

          });

        }

        if (meal.alternative && meal.alternative.ingredients) {

          meal.alternative.ingredients.forEach(ingredient => {

            if (ingredient["brand of pruduct"] && shouldShowBrand(ingredient["brand of pruduct"])) {

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






