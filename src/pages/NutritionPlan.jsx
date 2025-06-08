import React, { useState, useEffect } from 'react';

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
  const [nutritionData, setNutritionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedMeals, setExpandedMeals] = useState({});
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetchNutritionData();
  }, []);

  const fetchNutritionData = async () => {
    try {
      const response = await fetch('/data.json');
      if (!response.ok) {
        throw new Error('Failed to fetch nutrition data');
      }
      const data = await response.json();
      setNutritionData(data);
      setLoading(false);
    } catch (err) {
      setError('שגיאה בטעינת הנתונים');
      setLoading(false);
    }
  };

  const saveNutritionData = async () => {
    try {
      const response = await fetch('/api/nutrition-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nutritionData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save nutrition data');
      }
      
      alert('השינויים נשמרו בהצלחה!');
    } catch (err) {
      alert('שגיאה בשמירת השינויים');
      console.error('Error saving nutrition data:', err);
    }
  };

  const toggleMeal = (mealIndex) => {
    setExpandedMeals(prev => ({
      ...prev,
      [mealIndex]: !prev[mealIndex]
    }));
  };

  const updateMealDetail = (mealIndex, field, value) => {
    setNutritionData(prev => {
      const newData = { ...prev };
      newData.meals[mealIndex][field] = value;
      return newData;
    });
  };

  const updateIngredient = (mealIndex, itemIndex, ingredientIndex, field, value) => {
    setNutritionData(prev => {
      const newData = { ...prev };
      newData.meals[mealIndex].items[itemIndex].ingredients[ingredientIndex][field] = value;
      return newData;
    });
  };

  const addIngredient = (mealIndex, itemIndex) => {
    setNutritionData(prev => {
      const newData = { ...prev };
      newData.meals[mealIndex].items[itemIndex].ingredients.push({
        ingredientName: "מרכיב חדש",
        brand: "Generic",
        portionSI: "0g",
        portionUser: "0",
        protein: "0g",
        fat: "0g",
        alternatives: []
      });
      return newData;
    });
  };

  const removeIngredient = (mealIndex, itemIndex, ingredientIndex) => {
    setNutritionData(prev => {
      const newData = { ...prev };
      newData.meals[mealIndex].items[itemIndex].ingredients.splice(ingredientIndex, 1);
      return newData;
    });
  };

  const formatTime = (time) => {
    return `${time.slice(0, 2)}:${time.slice(2)}`;
  };

  if (loading) return <div className="text-center p-8">טוען...</div>;
  if (error) return <div className="text-center text-red-600 p-8">{error}</div>;
  if (!nutritionData) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section with Edit Toggle */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{nutritionData.programName}</h1>
          <div className="flex gap-4">
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-4 py-2 rounded-lg ${
                editMode 
                  ? 'bg-gray-200 text-gray-700' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {editMode ? 'סיום עריכה' : 'ערוך תוכנית'}
            </button>
            {editMode && (
              <button
                onClick={saveNutritionData}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
              >
                שמור שינויים
              </button>
            )}
          </div>
        </div>
        
        {/* Client Info & Stats */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-blue-50 p-6 rounded-lg">
              <h2 className="text-lg font-semibold text-blue-900 mb-2">פרטי מתאמן</h2>
              <div className="space-y-2">
                {editMode ? (
                  <>
                    <div>שם: <EditableField 
                      value={nutritionData.client.name}
                      onChange={(value) => setNutritionData(prev => ({
                        ...prev,
                        client: { ...prev.client, name: value }
                      }))}
                    /></div>
                    <div>גיל: <EditableField 
                      value={nutritionData.client.age}
                      onChange={(value) => setNutritionData(prev => ({
                        ...prev,
                        client: { ...prev.client, age: parseInt(value) }
                      }))}
                      type="number"
                    /></div>
                    <div>גובה: <EditableField 
                      value={nutritionData.client.height_cm}
                      onChange={(value) => setNutritionData(prev => ({
                        ...prev,
                        client: { ...prev.client, height_cm: parseInt(value) }
                      }))}
                      type="number"
                    /> ס״מ</div>
                    <div>משקל: <EditableField 
                      value={nutritionData.client.weight_kg}
                      onChange={(value) => setNutritionData(prev => ({
                        ...prev,
                        client: { ...prev.client, weight_kg: parseInt(value) }
                      }))}
                      type="number"
                    /> ק״ג</div>
                  </>
                ) : (
                  <>
                    <p className="text-blue-800">שם: {nutritionData.client.name}</p>
                    <p className="text-blue-800">גיל: {nutritionData.client.age}</p>
                    <p className="text-blue-800">גובה: {nutritionData.client.height_cm} ס״מ</p>
                    <p className="text-blue-800">משקל: {nutritionData.client.weight_kg} ק״ג</p>
                  </>
                )}
              </div>
            </div>
            
            <div className="bg-green-50 p-6 rounded-lg">
              <h2 className="text-lg font-semibold text-green-900 mb-2">יעדים יומיים</h2>
              {editMode ? (
                <>
                  <div className="mb-4">
                    <EditableField 
                      value={nutritionData.dailyTotalCalories}
                      onChange={(value) => setNutritionData(prev => ({
                        ...prev,
                        dailyTotalCalories: parseInt(value)
                      }))}
                      type="number"
                    /> קק״ל
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-green-600">חלבון</p>
                      <EditableField 
                        value={nutritionData.macros.protein}
                        onChange={(value) => setNutritionData(prev => ({
                          ...prev,
                          macros: { ...prev.macros, protein: value }
                        }))}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-green-600">פחמימות</p>
                      <EditableField 
                        value={nutritionData.macros.carbs}
                        onChange={(value) => setNutritionData(prev => ({
                          ...prev,
                          macros: { ...prev.macros, carbs: value }
                        }))}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-green-600">שומן</p>
                      <EditableField 
                        value={nutritionData.macros.fat}
                        onChange={(value) => setNutritionData(prev => ({
                          ...prev,
                          macros: { ...prev.macros, fat: value }
                        }))}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-green-700 mb-4">{nutritionData.dailyTotalCalories} קק״ל</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-green-600">חלבון</p>
                      <p className="font-bold text-green-700">{nutritionData.macros.protein}</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-600">פחמימות</p>
                      <p className="font-bold text-green-700">{nutritionData.macros.carbs}</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-600">שומן</p>
                      <p className="font-bold text-green-700">{nutritionData.macros.fat}</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-purple-50 p-6 rounded-lg">
              <h2 className="text-lg font-semibold text-purple-900 mb-2">המלצות</h2>
              <div className="space-y-2 text-sm text-purple-700">
                {editMode ? (
                  Object.entries(nutritionData.recommendations).map(([key, value]) => (
                    <div key={key}>
                      <EditableField 
                        value={value}
                        onChange={(newValue) => setNutritionData(prev => ({
                          ...prev,
                          recommendations: { ...prev.recommendations, [key]: newValue }
                        }))}
                      />
                    </div>
                  ))
                ) : (
                  <>
                    <p>{nutritionData.recommendations.supplements}</p>
                    <p>{nutritionData.recommendations.hydration}</p>
                    <p>{nutritionData.recommendations.sleep}</p>
                    <p>{nutritionData.recommendations.general}</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Food Limitations */}
          {nutritionData.client.food_limitations.length > 0 && (
            <div className="bg-red-50 p-4 rounded-lg mt-4">
              <h3 className="text-lg font-semibold text-red-900 mb-2">הגבלות תזונה</h3>
              <div className="flex gap-2 flex-wrap">
                {nutritionData.client.food_limitations.map((limitation, index) => (
                  <div key={index} className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm flex items-center">
                    {editMode ? (
                      <>
                        <EditableField 
                          value={limitation}
                          onChange={(value) => {
                            setNutritionData(prev => {
                              const newLimitations = [...prev.client.food_limitations];
                              newLimitations[index] = value;
                              return {
                                ...prev,
                                client: {
                                  ...prev.client,
                                  food_limitations: newLimitations
                                }
                              };
                            });
                          }}
                        />
                        <button
                          onClick={() => {
                            setNutritionData(prev => {
                              const newLimitations = prev.client.food_limitations.filter((_, i) => i !== index);
                              return {
                                ...prev,
                                client: {
                                  ...prev.client,
                                  food_limitations: newLimitations
                                }
                              };
                            });
                          }}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      limitation
                    )}
                  </div>
                ))}
                {editMode && (
                  <button
                    onClick={() => {
                      setNutritionData(prev => ({
                        ...prev,
                        client: {
                          ...prev.client,
                          food_limitations: [...prev.client.food_limitations, "הגבלה חדשה"]
                        }
                      }));
                    }}
                    className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm hover:bg-red-200"
                  >
                    + הוסף הגבלה
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Meals Section */}
        <div className="space-y-6">
          {nutritionData.meals.map((meal, mealIndex) => (
            <div key={mealIndex} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div 
                className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleMeal(mealIndex)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-3">
                      {editMode ? (
                        <EditableField 
                          value={meal.mealName}
                          onChange={(value) => updateMealDetail(mealIndex, 'mealName', value)}
                        />
                      ) : (
                        <h3 className="text-xl font-semibold text-gray-900">{meal.mealName}</h3>
                      )}
                      <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {editMode ? (
                          <EditableField 
                            value={meal.recommendedTime}
                            onChange={(value) => updateMealDetail(mealIndex, 'recommendedTime', value)}
                          />
                        ) : (
                          formatTime(meal.recommendedTime)
                        )}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-1">
                      {editMode ? (
                        <>
                          <EditableField 
                            value={meal.mealCalories}
                            onChange={(value) => updateMealDetail(mealIndex, 'mealCalories', parseInt(value))}
                            type="number"
                          /> קק״ל •
                          חלבון: <EditableField 
                            value={meal.mealProtein}
                            onChange={(value) => updateMealDetail(mealIndex, 'mealProtein', value)}
                          /> •
                          שומן: <EditableField 
                            value={meal.mealFat}
                            onChange={(value) => updateMealDetail(mealIndex, 'mealFat', value)}
                          />
                        </>
                      ) : (
                        `${meal.mealCalories} קק״ל • חלבון: ${meal.mealProtein} • שומן: ${meal.mealFat}`
                      )}
                    </p>
                  </div>
                  <button className="text-blue-600 hover:text-blue-800 flex items-center gap-2">
                    {expandedMeals[mealIndex] ? 'הסתר פרטים' : 'הצג פרטים'}
                    <span className="transform transition-transform duration-200">
                      {expandedMeals[mealIndex] ? '▼' : '▶'}
                    </span>
                  </button>
                </div>
              </div>

              {expandedMeals[mealIndex] && (
                <div className="border-t border-gray-100 p-6">
                  {/* Meal Details */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-6">
                    {editMode ? (
                      <EditableField 
                        value={meal.reminder}
                        onChange={(value) => updateMealDetail(mealIndex, 'reminder', value)}
                      />
                    ) : (
                      <p className="text-gray-600 mb-3">{meal.reminder}</p>
                    )}
                    <div className="flex gap-4 text-sm">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                        זמן הכנה: {editMode ? (
                          <EditableField 
                            value={meal.prepTimeMinutes}
                            onChange={(value) => updateMealDetail(mealIndex, 'prepTimeMinutes', parseInt(value))}
                            type="number"
                          />
                        ) : (
                          meal.prepTimeMinutes
                        )} דקות
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  {meal.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="mb-8 last:mb-0">
                      <div className="border-b border-gray-200 pb-4 mb-4">
                        {editMode ? (
                          <EditableField 
                            value={item.itemName}
                            onChange={(value) => {
                              setNutritionData(prev => {
                                const newData = { ...prev };
                                newData.meals[mealIndex].items[itemIndex].itemName = value;
                                return newData;
                              });
                            }}
                          />
                        ) : (
                          <h4 className="text-lg font-medium text-gray-900 mb-2">{item.itemName}</h4>
                        )}
                        <div className="flex gap-4 text-sm text-gray-600">
                          {editMode ? (
                            <>
                              <EditableField 
                                value={item.itemCalories}
                                onChange={(value) => {
                                  setNutritionData(prev => {
                                    const newData = { ...prev };
                                    newData.meals[mealIndex].items[itemIndex].itemCalories = parseInt(value);
                                    return newData;
                                  });
                                }}
                                type="number"
                              /> קק״ל
                              <span>חלבון: 
                                <EditableField 
                                  value={item.itemProtein}
                                  onChange={(value) => {
                                    setNutritionData(prev => {
                                      const newData = { ...prev };
                                      newData.meals[mealIndex].items[itemIndex].itemProtein = value;
                                      return newData;
                                    });
                                  }}
                                />
                              </span>
                              <span>שומן: 
                                <EditableField 
                                  value={item.itemFat}
                                  onChange={(value) => {
                                    setNutritionData(prev => {
                                      const newData = { ...prev };
                                      newData.meals[mealIndex].items[itemIndex].itemFat = value;
                                      return newData;
                                    });
                                  }}
                                />
                              </span>
                            </>
                          ) : (
                            <>
                              <span>{item.itemCalories} קק״ל</span>
                              <span>חלבון: {item.itemProtein}</span>
                              <span>שומן: {item.itemFat}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Ingredients */}
                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-3">
                          <h5 className="text-md font-medium text-gray-900">מרכיבים:</h5>
                          {editMode && (
                            <button
                              onClick={() => addIngredient(mealIndex, itemIndex)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              + הוסף מרכיב
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {item.ingredients.map((ingredient, ingredientIndex) => (
                            <div key={ingredientIndex} className="bg-gray-50 p-4 rounded-lg">
                              {editMode ? (
                                <div className="flex justify-between">
                                  <EditableField 
                                    value={ingredient.ingredientName}
                                    onChange={(value) => updateIngredient(mealIndex, itemIndex, ingredientIndex, 'ingredientName', value)}
                                  />
                                  <button
                                    onClick={() => removeIngredient(mealIndex, itemIndex, ingredientIndex)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <p className="font-medium text-gray-900">{ingredient.ingredientName}</p>
                              )}
                              <div className="mt-2 space-y-1 text-sm text-gray-600">
                                {editMode ? (
                                  <>
                                    <div>מותג: 
                                      <EditableField 
                                        value={ingredient.brand}
                                        onChange={(value) => updateIngredient(mealIndex, itemIndex, ingredientIndex, 'brand', value)}
                                      />
                                    </div>
                                    <div>מנה: 
                                      <EditableField 
                                        value={ingredient.portionUser}
                                        onChange={(value) => updateIngredient(mealIndex, itemIndex, ingredientIndex, 'portionUser', value)}
                                      />
                                    </div>
                                    <div className="flex gap-4 mt-2">
                                      <span>חלבון: 
                                        <EditableField 
                                          value={ingredient.protein}
                                          onChange={(value) => updateIngredient(mealIndex, itemIndex, ingredientIndex, 'protein', value)}
                                        />
                                      </span>
                                      <span>שומן: 
                                        <EditableField 
                                          value={ingredient.fat}
                                          onChange={(value) => updateIngredient(mealIndex, itemIndex, ingredientIndex, 'fat', value)}
                                        />
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p>מותג: {ingredient.brand}</p>
                                    <p>מנה: {ingredient.portionUser}</p>
                                    <div className="flex gap-4 mt-2">
                                      <span>חלבון: {ingredient.protein}</span>
                                      <span>שומן: {ingredient.fat}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Notes */}
                      {meal.notes && meal.notes.length > 0 && (
                        <div className="mt-6 bg-yellow-50 p-4 rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <h5 className="text-md font-medium text-yellow-900">הערות:</h5>
                            {editMode && (
                              <button
                                onClick={() => {
                                  setNutritionData(prev => {
                                    const newData = { ...prev };
                                    if (!newData.meals[mealIndex].notes) {
                                      newData.meals[mealIndex].notes = [];
                                    }
                                    newData.meals[mealIndex].notes.push("הערה חדשה");
                                    return newData;
                                  });
                                }}
                                className="text-yellow-600 hover:text-yellow-800 text-sm"
                              >
                                + הוסף הערה
                              </button>
                            )}
                          </div>
                          <ul className="list-disc list-inside text-yellow-800">
                            {meal.notes.map((note, noteIndex) => (
                              <li key={noteIndex} className="flex items-center gap-2">
                                {editMode ? (
                                  <>
                                    <EditableField 
                                      value={note}
                                      onChange={(value) => {
                                        setNutritionData(prev => {
                                          const newData = { ...prev };
                                          newData.meals[mealIndex].notes[noteIndex] = value;
                                          return newData;
                                        });
                                      }}
                                    />
                                    <button
                                      onClick={() => {
                                        setNutritionData(prev => {
                                          const newData = { ...prev };
                                          newData.meals[mealIndex].notes.splice(noteIndex, 1);
                                          return newData;
                                        });
                                      }}
                                      className="text-yellow-600 hover:text-yellow-800"
                                    >
                                      ✕
                                    </button>
                                  </>
                                ) : (
                                  note
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NutritionPlan; 