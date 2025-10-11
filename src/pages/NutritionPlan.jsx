import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const IngredientSearch = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/suggestions?query=${encodeURIComponent(query)}`);
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

    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (suggestion) => {
    setQuery(suggestion.hebrew || suggestion.english);
    setShowSuggestions(false);
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="חפש מרכיב..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {isLoading && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          <ul className="py-1">
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                onClick={() => handleSelect(suggestion)}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-right"
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

const EditableIngredient = ({ value, onChange, mealIndex, itemIndex, ingredientIndex }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Keep editValue in sync with value prop
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  // Cleanup timeout on unmount
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
      const response = await fetch(`sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/suggestions?query=${encodeURIComponent(query)}`);
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

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for search
    searchTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300); // Reduced debounce time from default 500ms to 300ms
  };

  const handleSelect = async (suggestion) => {
    try {
      const response = await fetch(`sqlservice-erdve2fpeda4f5hg.eastus2-01.azurewebsites.net/api/ingredient-nutrition?name=${encodeURIComponent(suggestion.english)}`);
      if (!response.ok) throw new Error('Failed to fetch nutrition data');
      const nutritionData = await response.json();

      // Update with all values including the new name
      const updatedValues = {
        ingredientName: suggestion.hebrew || suggestion.english,
        protein: nutritionData.Protein ? `${nutritionData.Protein}g` : '0g',
        fat: nutritionData.Total_lipid__fat_ ? `${nutritionData.Total_lipid__fat_}g` : '0g',
        energy: nutritionData.Energy || 0,
        portionUser: '100g',
        portionSI: '100g'
      };

      onChange(updatedValues, mealIndex, itemIndex, ingredientIndex);
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
          // Don't trigger search on initial edit
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

const EditableField = ({ value, onChange, type = "text" }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex gap-2 items-center">
        <input
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
          onBlur={handleSave}
          autoFocus
        />
        <button
          onClick={handleSave}
          className="text-green-600 hover:text-green-800 text-sm"
        >
          שמור
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
    >
      {value}
    </div>
  );
};

const NutritionPlan = () => {
  const { language, translations } = useLanguage();
  const [data, setData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    // Load data from public/data.json
    fetch('/data/data.json')
      .then(response => response.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) return <div>Loading...</div>;

  return (
    <div className="relative min-h-screen pb-16">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold">
            {data.programName}
          </h1>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {translations.editPlan}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="container mx-auto px-4 mt-6">
        <Tabs defaultValue="overview" className="w-full" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">{translations.overview || 'Overview'}</TabsTrigger>
            <TabsTrigger value="meals">{translations.meals || 'Meals'}</TabsTrigger>
            <TabsTrigger value="nutrition">{translations.nutritionValues || 'Nutrition'}</TabsTrigger>
            <TabsTrigger value="recommendations">{translations.recommendations || 'Recommendations'}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid gap-4">
              <div className="p-6 bg-white rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4">{translations.clientInfo || 'Client Information'}</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-600">{translations.name || 'Name'}</p>
                    <p className="font-medium">{data.client.name}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">{translations.age || 'Age'}</p>
                    <p className="font-medium">{data.client.age}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">{translations.height || 'Height'}</p>
                    <p className="font-medium">{data.client.height_cm} cm</p>
                  </div>
                  <div>
                    <p className="text-gray-600">{translations.weight || 'Weight'}</p>
                    <p className="font-medium">{data.client.weight_kg} kg</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="meals" className="mt-6">
            <div className="space-y-6">
              {data.meals?.map((meal, mealIndex) => (
                <div key={mealIndex} className="bg-white rounded-lg shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          {isEditing ? (
                            <EditableField 
                              value={meal.mealName}
                              onChange={(value) => {
                                setData(prev => {
                                  const newData = { ...prev };
                                  newData.meals[mealIndex].mealName = value;
                                  return newData;
                                });
                              }}
                            />
                          ) : (
                            <h3 className="text-xl font-semibold text-gray-900">{meal.mealName}</h3>
                          )}
                          <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            {meal.recommendedTime}
                          </span>
                        </div>
                        <div className="flex gap-4 text-sm text-gray-600">
                          {isEditing ? (
                            <>
                              <span>
                                <EditableField 
                                  value={meal.mealCalories}
                                  onChange={(value) => {
                                    setData(prev => {
                                      const newData = { ...prev };
                                      newData.meals[mealIndex].mealCalories = parseInt(value);
                                      return newData;
                                    });
                                  }}
                                  type="number"
                                /> {translations.calories}
                              </span>
                              <span>
                                {translations.protein}: <EditableField 
                                  value={meal.mealProtein}
                                  onChange={(value) => {
                                    setData(prev => {
                                      const newData = { ...prev };
                                      newData.meals[mealIndex].mealProtein = value;
                                      return newData;
                                    });
                                  }}
                                />
                              </span>
                              <span>
                                {translations.fat}: <EditableField 
                                  value={meal.mealFat}
                                  onChange={(value) => {
                                    setData(prev => {
                                      const newData = { ...prev };
                                      newData.meals[mealIndex].mealFat = value;
                                      return newData;
                                    });
                                  }}
                                />
                              </span>
                            </>
                          ) : (
                            <>
                              <span>{meal.mealCalories} {translations.calories}</span>
                              <span>{translations.protein}: {meal.mealProtein}</span>
                              <span>{translations.fat}: {meal.mealFat}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Meal Items */}
                  <div className="divide-y divide-gray-100">
                    {meal.items?.map((item, itemIndex) => (
                      <div key={itemIndex} className="p-6">
                        <div className="mb-4">
                          <h4 className="text-lg font-medium text-gray-900 mb-2">
                            {isEditing ? (
                              <EditableField 
                                value={item.itemName}
                                onChange={(value) => {
                                  setData(prev => {
                                    const newData = { ...prev };
                                    newData.meals[mealIndex].items[itemIndex].itemName = value;
                                    return newData;
                                  });
                                }}
                              />
                            ) : item.itemName}
                          </h4>
                          <div className="flex gap-4 text-sm text-gray-600">
                            <span>{item.itemCalories} {translations.calories}</span>
                            <span>{translations.protein}: {item.itemProtein}</span>
                            <span>{translations.fat}: {item.itemFat}</span>
                          </div>
                        </div>

                        {/* Ingredients */}
                        <div className="mb-6">
                          <h5 className="text-md font-medium text-gray-900 mb-3">{translations.ingredients}:</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {item.ingredients?.map((ingredient, ingredientIndex) => (
                              <div key={ingredientIndex} className="bg-gray-50 p-4 rounded-lg">
                                {isEditing ? (
                                  <EditableIngredient 
                                    value={ingredient.ingredientName}
                                    onChange={(newValues, mealIndex, itemIndex, ingredientIndex) => {
                                      setData(prev => {
                                        const newData = { ...prev };
                                        const item = newData.meals[mealIndex].items[itemIndex];
                                        const targetIngredient = item.ingredients[ingredientIndex];
                                        Object.assign(targetIngredient, newValues);
                                        
                                        // Update item totals
                                        const ingredients = item.ingredients;
                                        item.itemCalories = ingredients.reduce((sum, ing) => sum + (ing.energy || 0), 0);
                                        item.itemProtein = ingredients.reduce((sum, ing) => sum + (parseFloat(ing.protein) || 0), 0).toFixed(1) + 'g';
                                        item.itemFat = ingredients.reduce((sum, ing) => sum + (parseFloat(ing.fat) || 0), 0).toFixed(1) + 'g';
                                        
                                        // Update meal totals
                                        const items = newData.meals[mealIndex].items;
                                        newData.meals[mealIndex].mealCalories = items.reduce((sum, item) => sum + (item.itemCalories || 0), 0);
                                        newData.meals[mealIndex].mealProtein = items.reduce((sum, item) => sum + (parseFloat(item.itemProtein) || 0), 0).toFixed(1) + 'g';
                                        newData.meals[mealIndex].mealFat = items.reduce((sum, item) => sum + (parseFloat(item.itemFat) || 0), 0).toFixed(1) + 'g';
                                        
                                        return newData;
                                      });
                                    }}
                                    mealIndex={mealIndex}
                                    itemIndex={itemIndex}
                                    ingredientIndex={ingredientIndex}
                                  />
                                ) : (
                                  <p className="font-medium text-gray-900">{ingredient.ingredientName}</p>
                                )}
                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                  <p>{translations.portion}: {ingredient.portionUser}</p>
                                  <div className="flex gap-4 mt-2">
                                    <span>{translations.protein}: {ingredient.protein}</span>
                                    <span>{translations.fat}: {ingredient.fat}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Alternative Items */}
                        {item.alternatives && item.alternatives.length > 0 && (
                          <div className="mt-6 bg-blue-50 p-4 rounded-lg">
                            <h5 className="text-lg font-medium text-blue-900 mb-4">{translations.alternatives || 'Alternatives'}:</h5>
                            <div className="space-y-4">
                              {item.alternatives.map((altItem, altIndex) => (
                                <div key={altIndex} className="bg-white p-4 rounded-lg border border-blue-100">
                                  <div className="mb-3">
                                    <h6 className="text-md font-medium text-blue-900">
                                      {isEditing ? (
                                        <EditableField 
                                          value={altItem.itemName}
                                          onChange={(value) => {
                                            setData(prev => {
                                              const newData = { ...prev };
                                              newData.meals[mealIndex].items[itemIndex].alternatives[altIndex].itemName = value;
                                              return newData;
                                            });
                                          }}
                                        />
                                      ) : altItem.itemName}
                                    </h6>
                                    <div className="flex gap-4 text-sm text-blue-700 mt-1">
                                      <span>{altItem.itemCalories} {translations.calories}</span>
                                      <span>{translations.protein}: {altItem.itemProtein}</span>
                                      <span>{translations.fat}: {altItem.itemFat}</span>
                                    </div>
                                  </div>

                                  {/* Alternative Ingredients */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {altItem.ingredients?.map((altIngredient, altIngredientIndex) => (
                                      <div key={altIngredientIndex} className="bg-blue-50 p-3 rounded-lg">
                                        {isEditing ? (
                                          <EditableIngredient 
                                            value={altIngredient.ingredientName}
                                            onChange={(newValues) => {
                                              setData(prev => {
                                                const newData = { ...prev };
                                                const targetIngredient = newData.meals[mealIndex].items[itemIndex].alternatives[altIndex].ingredients[altIngredientIndex];
                                                Object.assign(targetIngredient, newValues);
                                                return newData;
                                              });
                                            }}
                                            mealIndex={mealIndex}
                                            itemIndex={itemIndex}
                                            ingredientIndex={altIngredientIndex}
                                          />
                                        ) : (
                                          <p className="font-medium text-blue-900">{altIngredient.ingredientName}</p>
                                        )}
                                        <div className="mt-1 space-y-1 text-sm text-blue-700">
                                          <p>{translations.portion}: {altIngredient.portionUser}</p>
                                          <div className="flex gap-4">
                                            <span>{translations.protein}: {altIngredient.protein}</span>
                                            <span>{translations.fat}: {altIngredient.fat}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="nutrition" className="mt-6">
            <div className="p-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">{translations.dailyNutrition || 'Daily Nutrition'}</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-600">{translations.protein || 'Protein'}</p>
                  <p className="text-2xl font-semibold">{data.macros.protein}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-600">{translations.fat || 'Fat'}</p>
                  <p className="text-2xl font-semibold">{data.macros.fat}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-600">{translations.carbs || 'Carbs'}</p>
                  <p className="text-2xl font-semibold">{data.macros.carbs}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="recommendations" className="mt-6">
            <div className="p-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">{translations.recommendations || 'Recommendations'}</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-700">{translations.supplements || 'Supplements'}</h3>
                  <p className="mt-1 text-gray-600">{data.recommendations.supplements}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-700">{translations.hydration || 'Hydration'}</h3>
                  <p className="mt-1 text-gray-600">{data.recommendations.hydration}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-700">{translations.sleep || 'Sleep'}</h3>
                  <p className="mt-1 text-gray-600">{data.recommendations.sleep}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-700">{translations.general || 'General'}</h3>
                  <p className="mt-1 text-gray-600">{data.recommendations.general}</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default NutritionPlan; 