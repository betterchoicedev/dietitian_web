
import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { User } from '@/api/entities';
import { Client } from '@/api/entities';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from 'lucide-react';
import { InvokeLLM } from '@/api/integrations';
import { Slider } from "@/components/ui/slider"

import ClientInfoCard from '../components/menu/ClientInfoCard';
import MenuTargetsCard from '../components/menu/MenuTargetsCard';
import MenuRecommendations from '../components/menu/MenuRecommendations';
import MealCard from '../components/menu/MealCard';

export default function MenuCreate() {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [client, setClient] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiServiceError, setAiServiceError] = useState(false);

  // Initial state for meal data with proper structure
  const [menuData, setMenuData] = useState({
    programName: '',
    dailyTotalCalories: 0,
    status: 'draft',
    active_from: new Date().toISOString().split('T')[0],
    active_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    macros: {
      proteinPercentage: 30,
      carbsPercentage: 45,
      fatPercentage: 25,
      protein: '0g',
      carbs: '0g',
      fat: '0g'
    },
    recommendations: [],
    meals: [
      {
        mealName: 'Breakfast',
        mealCalories: 0,
        mealProtein: '0g',
        mealFat: '0g',
        mealCarbs: '0g',
        importanceScale: 25,
        timeWindow: { start: '06:00', end: '11:00' },
        items: [],
        notes: []
      },
      {
        mealName: 'Snack #1',
        mealCalories: 0,
        mealProtein: '0g',
        mealFat: '0g',
        mealCarbs: '0g',
        importanceScale: 10,
        timeWindow: { start: '11:00', end: '14:00' },
        items: [],
        notes: []
      },
      {
        mealName: 'Lunch',
        mealCalories: 0,
        mealProtein: '0g',
        mealFat: '0g',
        mealCarbs: '0g',
        importanceScale: 35,
        timeWindow: { start: '11:00', end: '15:00' },
        items: [],
        notes: []
      },
      {
        mealName: 'Snack #2',
        mealCalories: 0,
        mealProtein: '0g',
        mealFat: '0g',
        mealCarbs: '0g',
        importanceScale: 10,
        timeWindow: { start: '15:00', end: '18:00' },
        items: [],
        notes: []
      },
      {
        mealName: 'Dinner',
        mealCalories: 0,
        mealProtein: '0g',
        mealFat: '0g',
        mealCarbs: '0g',
        importanceScale: 20,
        timeWindow: { start: '16:00', end: '21:00' },
        items: [],
        notes: []
      }
    ]
  });

  const loadClientData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const userData = await User.me();
      if (!userData.selectedClientId) {
        setError("No client selected. Please select a client first.");
        return;
      }

      const clientData = await Client.get(userData.selectedClientId);
      if (!clientData) {
        setError("Failed to load client data");
        return;
      }

      setClient(clientData);
      
      // Calculate initial calorie needs
      const calculatedCalories = calculateCalorieNeeds(clientData);
      
      // Update menu data with client information and calculated calories
      setMenuData(prev => ({
        ...prev,
        programName: `${clientData.full_name} - Personalized Meal Plan`,
        user_code: clientData.user_code, // Ensure user_code is set from client data
        client_id: clientData.id, // Ensure client_id is set
        dailyTotalCalories: calculatedCalories,
        macros: {
          ...prev.macros,
          protein: `${Math.round((calculatedCalories * prev.macros.proteinPercentage / 100) / 4)}g`,
          carbs: `${Math.round((calculatedCalories * prev.macros.carbsPercentage / 100) / 4)}g`,
          fat: `${Math.round((calculatedCalories * prev.macros.fatPercentage / 100) / 9)}g`
        }
      }));
      
      console.log("Menu data initialized with:", {
        user_code: clientData.user_code,
        client_id: clientData.id
      });
    } catch (error) {
      console.error("Error loading client data:", error);
      setError("Failed to load client data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClientData();
  }, []);

  const calculateCalorieNeeds = (client) => {
    if (!client) return 2000;
    
    let bmr = 0;
    if (client.gender === 'male') {
      bmr = 88.362 + (13.397 * client.weight) + (4.799 * client.height) - (5.677 * client.age);
    } else {
      bmr = 447.593 + (9.247 * client.weight) + (3.098 * client.height) - (4.330 * client.age);
    }
    
    let activityMultiplier = 1.2;
    switch (client.activity_level) {
      case 'sedentary': activityMultiplier = 1.2; break;
      case 'light': activityMultiplier = 1.375; break;
      case 'moderate': activityMultiplier = 1.55; break;
      case 'very': activityMultiplier = 1.725; break;
      case 'extra': activityMultiplier = 1.9; break;
      default: activityMultiplier = 1.375; break;
    }
    
    let calorieNeeds = bmr * activityMultiplier;
    
    switch (client.goal) {
      case 'lose': calorieNeeds -= 500; break;
      case 'gain': calorieNeeds += 500; break;
      default: break;
    }
    
    return Math.round(calorieNeeds);
  };

  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationPassed, setVerificationPassed] = useState(false);
  const [verificationErrors, setVerificationErrors] = useState([]);

  const verifyMenu = async () => {
    setIsVerifying(true);
    setVerificationErrors([]);
    const errors = [];

    try {
      // Check dietary restrictions
      if (client?.dietary_restrictions?.includes('dairy-free')) {
        const dairyKeywords = ['milk', 'cheese', 'yogurt', 'cream', 'butter', 'dairy', 'whey'];
        menuData.meals.forEach((meal, mealIndex) => {
          meal.items?.forEach((item, itemIndex) => {
            if (dairyKeywords.some(keyword => item.itemName.toLowerCase().includes(keyword))) {
              errors.push(`Meal ${mealIndex + 1}, Item ${itemIndex + 1}: Contains dairy product (${item.itemName})`);
            }
            // Check alternatives too
            item.alternatives?.forEach((alt, altIndex) => {
              if (dairyKeywords.some(keyword => alt.itemName.toLowerCase().includes(keyword))) {
                errors.push(`Meal ${mealIndex + 1}, Item ${itemIndex + 1}, Alternative ${altIndex + 1}: Contains dairy product (${alt.itemName})`);
              }
            });
          });
        });
      }

      // Check food likes/dislikes
      if (client?.food_dislikes?.length > 0) {
        client.food_dislikes.forEach(dislikedFood => {
          menuData.meals.forEach((meal, mealIndex) => {
            meal.items?.forEach((item, itemIndex) => {
              if (item.itemName.toLowerCase().includes(dislikedFood.toLowerCase())) {
                errors.push(`Meal ${mealIndex + 1}, Item ${itemIndex + 1}: Contains disliked food "${dislikedFood}"`);
              }
            });
          });
        });
      }

      // Helper function to extract numeric value from strings like "30g"
      const extractNumeric = (value) => {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        const match = value.toString().match(/(\d+)/);
        return match ? parseInt(match[0], 10) : 0;
      };

      // Calculate total macros from all meals and items
      let totalCalories = 0;
      let totalProtein = 0;
      let totalFat = 0;

      // First, try to calculate from meal level data
      menuData.meals.forEach(meal => {
        if (meal.mealCalories) totalCalories += meal.mealCalories;
        totalProtein += extractNumeric(meal.mealProtein);
        totalFat += extractNumeric(meal.mealFat);
      });

      // If meal level data isn't sufficient, calculate from items
      if (totalCalories === 0) {
        menuData.meals.forEach(meal => {
          (meal.items || []).forEach(item => {
            if (item.itemCalories) totalCalories += item.itemCalories;
            totalProtein += extractNumeric(item.itemProtein);
            totalFat += extractNumeric(item.itemFat);
          });
        });
      }

      console.log("Calculated totals:", { totalCalories, totalProtein, totalFat });
      console.log("Target values:", {
        calories: menuData.dailyTotalCalories,
        protein: extractNumeric(menuData.macros.protein),
        fat: extractNumeric(menuData.macros.fat)
      });

      // Get target values
      const targetCalories = menuData.dailyTotalCalories;
      const targetProtein = extractNumeric(menuData.macros.protein);
      const targetFat = extractNumeric(menuData.macros.fat);

      // Check calories within 10% tolerance
      if (targetCalories > 0) {
        const calorieWithinRange = Math.abs(totalCalories - targetCalories) <= targetCalories * 0.1;
        if (!calorieWithinRange) {
          errors.push(`Total calories (${totalCalories}) differs from target (${targetCalories}) by more than 10%`);
        }
      }
      
      // Check protein and fat within 20% tolerance
      if (targetProtein > 0) {
        const proteinWithinRange = Math.abs(totalProtein - targetProtein) <= targetProtein * 0.2;
        if (!proteinWithinRange) {
          errors.push(`Total protein (${totalProtein}g) differs from target (${targetProtein}g) by more than 20%`);
        }
      }
      
      if (targetFat > 0) {
        const fatWithinRange = Math.abs(totalFat - targetFat) <= targetFat * 0.2;
        if (!fatWithinRange) {
          errors.push(`Total fat (${totalFat}g) differs from target (${targetFat}g) by more than 20%`);
        }
      }

      // If no nutritional values provided at all, add a specific error
      if (totalCalories === 0 && totalProtein === 0 && totalFat === 0) {
        errors.push("No nutritional information provided in the meal plan");
      }

      setVerificationErrors(errors);
      setVerificationPassed(errors.length === 0);
    } catch (error) {
      console.error("Verification error:", error);
      errors.push("An error occurred during verification");
      setVerificationPassed(false);
      setVerificationErrors(errors);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (saveAsDraft) => {
    if (!saveAsDraft && !verificationPassed) {
      setError("Please verify the menu before saving as active");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (!client || !client.user_code) {
        setError("Client information is incomplete. Please reload the page.");
        return;
      }
      
      const menuToCreate = {
        ...menuData,
        status: saveAsDraft ? 'draft' : 'active',
        user_code: client.user_code, // Ensure user_code is set
        client_id: client.id // Ensure client_id is set
      };

      console.log("Creating menu with:", {
        user_code: menuToCreate.user_code,
        client_id: menuToCreate.client_id
      });

      // Generate a menu code if not present
      if (!menuToCreate.menu_code) {
        menuToCreate.menu_code = generateMenuCode();
      }

      const createdMenu = await Menu.create(menuToCreate);
      console.log("Menu created successfully:", createdMenu);
      navigate(createPageUrl('Menus'));
    } catch (error) {
      console.error("Error creating menu:", error);
      setError(`Failed to create menu: ${error.message || "Please check your data and try again."}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Add the menu code generator function if not already present
  const generateMenuCode = () => {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
      code += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return code;
  };

  const mealColors = [
    "green",   // Breakfast
    "blue",    // Snack #1
    "purple",  // Lunch
    "orange",  // Snack #2
    "red"      // Dinner
  ];

  const handleAddMeal = (newMeal) => {
    setMenuData(prev => ({
      ...prev,
      meals: [...prev.meals, newMeal]
    }));
  };

  const handleRemoveMeal = (index) => {
    setMenuData(prev => ({
      ...prev,
      meals: prev.meals.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateMealTime = (index, timeWindow) => {
    setMenuData(prev => {
      const newMeals = [...prev.meals];
      newMeals[index] = {
        ...newMeals[index],
        timeWindow
      };
      return { ...prev, meals: newMeals };
    });
  };

  const generateFallbackRecommendations = (client) => {
    const baseProtein = client?.gender === 'female' ? "1.6-2.0" : "1.8-2.2";
    const waterAmount = client?.gender === 'female' ? "2.5-3" : "3-4";
    
    let dairyFreeText = '';
    if (client?.dietary_restrictions?.includes('dairy-free')) {
      dairyFreeText = 'Ensure all meals are dairy-free. Include calcium-rich alternatives like fortified plant milks, tofu, leafy greens, and almonds. Avoid milk, cheese, yogurt, cream, and butter.';
    }
    
    return {
      generalComments: `Focus on whole, unprocessed foods. Include lean proteins (${baseProtein}g per kg of body weight), complex carbohydrates, and healthy fats. ${dairyFreeText} Eat regular meals every 3-4 hours to maintain stable blood sugar levels. Include a variety of colorful vegetables and fruits for essential nutrients.`,
      
      hydration: `Aim to drink ${waterAmount} liters of water daily. Increase intake during exercise or hot weather. Start each day with a glass of water and keep a water bottle nearby throughout the day. Monitor urine color - it should be light yellow to clear.`,
      
      sleep: "Maintain a consistent sleep schedule, aiming for 7-9 hours per night. Create a relaxing bedtime routine. Avoid screens 1 hour before bed. Keep bedroom cool, dark, and quiet. Avoid caffeine 6 hours before bedtime.",
      
      supplements: `Consider taking: 
- Daily multivitamin for overall nutrition
- Vitamin D3 (2000-4000 IU daily)
- Omega-3 fatty acids for heart health
${client?.dietary_restrictions?.includes('dairy-free') ? '- Calcium supplement (1000mg daily)\n- Vitamin B12 supplement' : ''}
Always consult with healthcare provider before starting any supplement regimen.`
    };
  };

  const handleGenerateMenu = async () => {
    setIsGenerating(true);
    setAiServiceError(false);
    try {
      // Generate recommendations first
      let recommendationsResult;
      try {
        recommendationsResult = await InvokeLLM({
          prompt: `Generate comprehensive dietary recommendations for:
                  Client: ${JSON.stringify(client, null, 2)}
                  Menu Targets: ${JSON.stringify(menuData.macros, null, 2)}
                  
                  Include:
                  1. General nutrition advice
                  2. Hydration guidelines
                  3. Sleep recommendations
                  4. Supplement suggestions`,
          response_json_schema: {
            type: "object",
            properties: {
              generalComments: { type: "string" },
              hydration: { type: "string" },
              sleep: { type: "string" },
              supplements: { type: "string" }
            }
          }
        });
      } catch (error) {
        console.error("AI service error for recommendations:", error);
        setAiServiceError(true);
        throw new Error("Network Error: Unable to connect to AI service. Please try again later.");
      }

      // Convert recommendations to array format
      const recommendations = Object.entries(recommendationsResult).map(([key, value]) => ({
        recommendation_key: key,
        recommendation_value: value
      }));

      setMenuData(prev => ({
        ...prev,
        recommendations
      }));

      // Generate each meal sequentially but without alternatives
      const updatedMeals = [];
      for (const meal of menuData.meals) {
        if (!meal.mealName) continue;
        
        try {
          const mealPrompt = `
            Generate a detailed meal plan for ${meal.mealName}
            Client: ${JSON.stringify(client, null, 2)}
            Targets: 
            - Calories: ${meal.mealCalories}
            - Protein: ${meal.mealProtein}
            - Fat: ${meal.mealFat}
            
            Consider:
            - Client's dietary restrictions: ${client.dietary_restrictions?.join(', ')}
            - Food preferences: Likes: ${client.food_likes?.join(', ')}, Dislikes: ${client.food_dislikes?.join(', ')}
            - Previously generated meals: ${updatedMeals.map(m => m.items.map(i => i.itemName).join(', ')).join(' | ')}
            
            Generate complete meal with:
            1. Main items with exact portions
            2. Detailed ingredients with brands and measurements
            3. Proper macro distribution
            Note: Do not generate alternatives, they will be handled separately
            
            ${client.dietary_restrictions?.includes('dairy-free') ? 'VERY IMPORTANT: Do NOT include any dairy products like milk, cheese, yogurt, cream, or butter.' : ''}
          `;

          let mealResult;
          try {
            mealResult = await InvokeLLM({
              prompt: mealPrompt,
              response_json_schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        itemName: { type: "string" },
                        itemCalories: { type: "number" },
                        itemProtein: { type: "string" },
                        itemFat: { type: "string" },
                        ingredients: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              ingredientName: { type: "string" },
                              brand: { type: "string" },
                              upc: { type: "string" },
                              portionSI: { type: "string" },
                              portionUser: { type: "string" },
                              protein: { type: "string" },
                              fat: { type: "string" }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            });
            
            // Check for dairy items if restriction exists
            let resultItems = mealResult.items;
            if (client.dietary_restrictions?.includes('dairy-free')) {
              resultItems = filterOutDairyItems(resultItems);
            }
            
            // Set all ingredients to collapsed by default
            resultItems = resultItems.map(item => ({
              ...item,
              ingredients: item.ingredients.map(ing => ({
                ...ing,
                isCollapsed: true
              })),
              alternatives: []
            }));
            
            updatedMeals.push({
              ...meal,
              items: resultItems
            });
          } catch (error) {
            console.error(`AI service error for meal ${meal.mealName}:`, error);
            setAiServiceError(true);
            throw new Error("Network Error: Unable to connect to AI service. Please try again later.");
          }
        } catch (error) {
          console.error(`Error processing meal ${meal.mealName}:`, error);
          throw error;
        }
      }

      setMenuData(prev => ({
        ...prev,
        meals: updatedMeals
      }));

    } catch (error) {
      console.error("Error generating menu:", error);
      setError(error.message || "Failed to generate menu. Please try again later.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Create dairy-free fallback meals
  const createDietaryCompliantFallbackMeal = (meal, client) => {
    // Basic set of ingredients based on meal type
    const mealOptions = {
      'Breakfast': {
        dairy: ['Greek Yogurt Bowl with Berries and Granola', 'Cottage Cheese with Fruit'],
        dairyFree: ['Avocado Toast with Scrambled Eggs', 'Overnight Oats with Almond Milk']
      },
      'Lunch': {
        dairy: ['Turkey and Cheese Sandwich', 'Chicken Caesar Salad'],
        dairyFree: ['Tuna Salad Wrap', 'Quinoa Bowl with Roasted Vegetables']
      },
      'Dinner': {
        dairy: ['Pasta with Creamy Sauce', 'Cheese Quesadillas'],
        dairyFree: ['Grilled Chicken with Sweet Potato', 'Stir-Fry with Tofu']
      },
      'Snack': {
        dairy: ['String Cheese', 'Yogurt Parfait'],
        dairyFree: ['Trail Mix', 'Apple with Almond Butter']
      }
    };
    
    // Determine meal type
    let mealType = 'Snack';
    if (meal.mealName.includes('Breakfast')) mealType = 'Breakfast';
    else if (meal.mealName.includes('Lunch')) mealType = 'Lunch';
    else if (meal.mealName.includes('Dinner')) mealType = 'Dinner';
    
    // Select appropriate option based on dietary restrictions
    const hasDairyRestriction = client?.dietary_restrictions?.includes('dairy-free');
    const options = hasDairyRestriction ? mealOptions[mealType].dairyFree : mealOptions[mealType].dairy;
    const selectedOption = options[Math.floor(Math.random() * options.length)];
    
    return {
      ...meal,
      items: [
        {
          itemName: selectedOption,
          itemCalories: meal.mealCalories || Math.floor(Math.random() * 200) + 200,
          itemProtein: meal.mealProtein || `${Math.floor(Math.random() * 15) + 10}g`,
          itemFat: meal.mealFat || `${Math.floor(Math.random() * 10) + 5}g`,
          ingredients: [
            {
              ingredientName: selectedOption.split(' ')[0],
              brand: 'Generic',
              upc: '',
              portionSI: 'Standard portion',
              portionUser: 'Standard portion',
              protein: `${Math.floor(Math.random() * 10) + 5}g`,
              fat: `${Math.floor(Math.random() * 8) + 2}g`,
              isCollapsed: true
            }
          ],
          alternatives: []
        }
      ]
    };
  };
  
  // Filter out dairy items from generated meals
  const filterOutDairyItems = (items) => {
    const dairyKeywords = ['milk', 'cheese', 'yogurt', 'cream', 'butter', 'dairy', 'whey'];
    
    return items.map(item => {
      // Check if item name contains dairy keywords
      const hasDairy = dairyKeywords.some(keyword => item.itemName.toLowerCase().includes(keyword));
      
      if (hasDairy) {
        // Replace with non-dairy alternative
        return {
          ...item,
          itemName: item.itemName.replace(/yogurt/i, 'coconut yogurt')
                              .replace(/milk/i, 'almond milk')
                              .replace(/cheese/i, 'vegan cheese')
                              .replace(/butter/i, 'plant-based butter')
                              .replace(/cream/i, 'coconut cream'),
          ingredients: item.ingredients.map(ingredient => {
            if (dairyKeywords.some(keyword => ingredient.ingredientName.toLowerCase().includes(keyword))) {
              return {
                ...ingredient,
                ingredientName: ingredient.ingredientName.replace(/yogurt/i, 'coconut yogurt')
                                                       .replace(/milk/i, 'almond milk')
                                                       .replace(/cheese/i, 'vegan cheese')
                                                       .replace(/butter/i, 'plant-based butter')
                                                       .replace(/cream/i, 'coconut cream'),
                brand: ingredient.brand.includes('Dairy') ? 'Silk' : ingredient.brand
              };
            }
            return ingredient;
          })
        };
      }
      
      // Filter individual ingredients
      return {
        ...item,
        ingredients: item.ingredients.map(ingredient => {
          if (dairyKeywords.some(keyword => ingredient.ingredientName.toLowerCase().includes(keyword))) {
            return {
              ...ingredient,
              ingredientName: ingredient.ingredientName.replace(/yogurt/i, 'coconut yogurt')
                                                     .replace(/milk/i, 'almond milk')
                                                     .replace(/cheese/i, 'vegan cheese')
                                                     .replace(/butter/i, 'plant-based butter')
                                                     .replace(/cream/i, 'coconut cream'),
              brand: ingredient.brand.includes('Dairy') ? 'Silk' : ingredient.brand
            };
          }
          return ingredient;
        }),
        // Also check alternatives if they exist
        alternatives: (item.alternatives || []).map(alt => {
          if (dairyKeywords.some(keyword => alt.itemName.toLowerCase().includes(keyword))) {
            return {
              ...alt,
              itemName: alt.itemName.replace(/yogurt/i, 'coconut yogurt')
                                   .replace(/milk/i, 'almond milk')
                                   .replace(/cheese/i, 'vegan cheese')
                                   .replace(/butter/i, 'plant-based butter')
                                   .replace(/cream/i, 'coconut cream'),
              ingredients: (alt.ingredients || []).map(ingredient => {
                if (dairyKeywords.some(keyword => ingredient.ingredientName.toLowerCase().includes(keyword))) {
                  return {
                    ...ingredient,
                    ingredientName: ingredient.ingredientName.replace(/yogurt/i, 'coconut yogurt')
                                                           .replace(/milk/i, 'almond milk')
                                                           .replace(/cheese/i, 'vegan cheese')
                                                           .replace(/butter/i, 'plant-based butter')
                                                           .replace(/cream/i, 'coconut cream'),
                    brand: ingredient.brand.includes('Dairy') ? 'Silk' : ingredient.brand
                  };
                }
                return ingredient;
              })
            };
          }
          
          // Just filter the ingredients
          return {
            ...alt,
            ingredients: (alt.ingredients || []).map(ingredient => {
              if (dairyKeywords.some(keyword => ingredient.ingredientName.toLowerCase().includes(keyword))) {
                return {
                  ...ingredient,
                  ingredientName: ingredient.ingredientName.replace(/yogurt/i, 'coconut yogurt')
                                                         .replace(/milk/i, 'almond milk')
                                                         .replace(/cheese/i, 'vegan cheese')
                                                         .replace(/butter/i, 'plant-based butter')
                                                         .replace(/cream/i, 'coconut cream'),
                  brand: ingredient.brand.includes('Dairy') ? 'Silk' : ingredient.brand
                };
              }
              return ingredient;
            })
          };
        })
      };
    });
  };

  const handleMacroChange = (macro, value) => {
    // Ensure the total of percentages is always 100
    let newProteinPercentage = menuData.macros.proteinPercentage;
    let newCarbsPercentage = menuData.macros.carbsPercentage;
    let newFatPercentage = menuData.macros.fatPercentage;
  
    if (macro === 'proteinPercentage') {
      newProteinPercentage = value;
    } else if (macro === 'carbsPercentage') {
      newCarbsPercentage = value;
    } else if (macro === 'fatPercentage') {
      newFatPercentage = value;
    }
  
    // Normalize the values to ensure they add up to 100
    const total = newProteinPercentage + newCarbsPercentage + newFatPercentage;
    const normProtein = (newProteinPercentage / total) * 100;
    const normCarbs = (newCarbsPercentage / total) * 100;
    const normFat = (newFatPercentage / total) * 100;
  
    setMenuData(prev => ({
      ...prev,
      macros: {
        ...prev.macros,
        proteinPercentage: Math.round(normProtein),
        carbsPercentage: Math.round(normCarbs),
        fatPercentage: Math.round(normFat),
        protein: `${Math.round((prev.dailyTotalCalories * normProtein / 100) / 4)}g`,
        carbs: `${Math.round((prev.dailyTotalCalories * normCarbs / 100) / 4)}g`,
        fat: `${Math.round((prev.dailyTotalCalories * normFat / 100) / 9)}g`
      }
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => navigate(createPageUrl('Menus'))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Create New Menu Plan</h1>
        </div>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => navigate(createPageUrl('Menus'))}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Create New Menu Plan</h1>
      </div>

      <ClientInfoCard client={client} />

      <MenuTargetsCard
        menuData={menuData}
        onUpdateMenuData={setMenuData}
        isGenerating={isGenerating}
        onGenerate={handleGenerateMenu}
        onAddMeal={handleAddMeal}
        onRemoveMeal={handleRemoveMeal}
        onUpdateMealTime={handleUpdateMealTime}
      />
       
       {/* Macro Sliders */}
       <div className="space-y-2">
          <h3 className="text-lg font-semibold">Macro Targets</h3>
          
          <div className="grid grid-cols-3 gap-4">
              {/* Protein Slider */}
              <div className="space-y-1">
                  <label htmlFor="protein" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Protein ({menuData.macros.proteinPercentage}%)</label>
                  <Slider
                      id="protein"
                      defaultValue={[menuData.macros.proteinPercentage]}
                      max={100}
                      step={5}
                      onValueChange={(value) => handleMacroChange('proteinPercentage', value[0])}
                  />
              </div>
              
              {/* Carbs Slider */}
              <div className="space-y-1">
                  <label htmlFor="carbs" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Carbs ({menuData.macros.carbsPercentage}%)</label>
                  <Slider
                      id="carbs"
                      defaultValue={[menuData.macros.carbsPercentage]}
                      max={100}
                      step={5}
                      onValueChange={(value) => handleMacroChange('carbsPercentage', value[0])}
                  />
              </div>
              
              {/* Fat Slider */}
              <div className="space-y-1">
                  <label htmlFor="fat" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Fat ({menuData.macros.fatPercentage}%)</label>
                  <Slider
                      id="fat"
                      defaultValue={[menuData.macros.fatPercentage]}
                      max={100}
                      step={5}
                      onValueChange={(value) => handleMacroChange('fatPercentage', value[0])}
                  />
              </div>
          </div>
      </div>

      <MenuRecommendations
        recommendations={menuData.recommendations}
        onChange={(newRecommendations) => {
          setMenuData(prev => ({
            ...prev,
            recommendations: newRecommendations
          }));
        }}
        calorieTarget={calculateCalorieNeeds(client)}
        onCalorieTargetChange={(value) => {
          setMenuData(prev => ({
            ...prev,
            dailyTotalCalories: value
          }));
        }}
      />

      {aiServiceError && (
        <Alert variant="warning" className="mb-4">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle>AI Service Issue</AlertTitle>
          <AlertDescription>
            We encountered issues connecting to our AI service. Some parts of the menu were generated using templates.
            You can edit these items manually or try again later.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {menuData.meals.map((meal, index) => (
          <MealCard
            key={index}
            meal={meal}
            onUpdateMeal={(updatedMeal) => {
              const newMeals = [...menuData.meals];
              newMeals[index] = updatedMeal;
              setMenuData({ ...menuData, meals: newMeals });
            }}
            onDeleteMeal={() => {
              const newMeals = menuData.meals.filter((_, i) => i !== index);
              setMenuData({ ...menuData, meals: newMeals });
            }}
            onGenerateMeal={async (meal) => {
              setIsGenerating(true);
              try {
                // Generate single meal implementation
                console.log("Single meal generation to be implemented");
              } catch (error) {
                setError("Failed to generate meal");
              } finally {
                setIsGenerating(false);
              }
            }}
            isGenerating={isGenerating}
            colorScheme={mealColors[index % mealColors.length]}
          />
        ))}
      </div>

      <div className="flex justify-end gap-4">
        <Button
          variant="outline"
          onClick={() => navigate(createPageUrl('Menus'))}
        >
          Cancel
        </Button>
        <Button
          onClick={verifyMenu}
          variant="outline"
          className="bg-blue-50 text-blue-700 hover:bg-blue-100"
          disabled={isVerifying}
        >
          {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Verify Menu
        </Button>
        <Button 
          onClick={() => handleSubmit(true)}
          variant="outline" 
          className="bg-blue-50 text-blue-700 hover:bg-blue-100"
          disabled={!client || isSaving}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save as Draft
        </Button>
        <Button 
          onClick={() => handleSubmit(false)}
          className="bg-green-600 hover:bg-green-700"
          disabled={!client || isSaving || !verificationPassed}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save & Activate
        </Button>
      </div>

      {verificationErrors.length > 0 && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Verification Failed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {verificationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
