
import React from 'react';
import { InvokeLLM } from '@/api/integrations';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function MenuGenerator({ 
  client, 
  targetCalories,
  targetMacros,
  onMenuGenerated, 
  onError,
  isGenerating,
  setIsGenerating 
}) {
  const calculateMealSplit = (totalCalories, macros) => {
    const mealPercentages = {
      Breakfast: 0.25,
      'Snack #1': 0.1,
      Lunch: 0.35,
      'Snack #2': 0.1,
      Dinner: 0.2
    };

    // Extract numeric values from macros (removing 'g' suffix)
    const totalProtein = parseInt(macros.protein.replace('g', ''));
    const totalFat = parseInt(macros.fat.replace('g', ''));
    const totalCarbs = parseInt(macros.carbs.replace('g', ''));

    return Object.entries(mealPercentages).reduce((acc, [mealName, percentage]) => {
      acc[mealName] = {
        mealName,
        mealCalories: Math.round(totalCalories * percentage),
        mealProtein: `${Math.round(totalProtein * percentage)}g`,
        mealFat: `${Math.round(totalFat * percentage)}g`,
        mealCarbs: `${Math.round(totalCarbs * percentage)}g`,
        items: []
      };
      return acc;
    }, {});
  };

  const generateGeneralRecommendations = async (clientContext) => {
    try {
      const recommendationsPrompt = `
        Create comprehensive dietary recommendations for this client:
        ${JSON.stringify(clientContext, null, 2)}
        
        Consider their goals, metrics, and any restrictions.
        Provide specific, actionable recommendations for:
        1. General nutrition advice and meal timing
        2. Hydration needs (based on weight and activity)
        3. Sleep optimization
        4. Supplement recommendations
        
        Format as JSON with keys: general, hydration, sleep, supplements  
        Keep recommendations evidence-based and practical.
      `;

      const recommendationsResult = await InvokeLLM({
        prompt: recommendationsPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            general: { type: "string" },
            hydration: { type: "string" },
            sleep: { type: "string" },
            supplements: { type: "string" }
          }
        }
      });

      return recommendationsResult;
    } catch (error) {
      console.error("Error generating recommendations:", error);
      throw error;
    }
  };

  const generateMeal = async (mealName, mealTargets, clientContext, previousMeals = []) => {
    try {
      const mealPrompt = `
        Generate a detailed ${mealName} meal plan:
        
        Client Context:
        ${JSON.stringify(clientContext, null, 2)}
        
        Meal Targets:
        - Calories: ${mealTargets.mealCalories} kcal
        - Protein: ${mealTargets.mealProtein}
        - Fat: ${mealTargets.mealFat}
        - Carbs: ${mealTargets.mealCarbs}
        
        Previous meals today:
        ${JSON.stringify(previousMeals, null, 2)}
        
        Requirements:
        1. Create main meal items with exact portions
        2. Break down into specific ingredients with measurements
        3. Include nutrition data per ingredient
        4. Ensure ingredients match any dietary restrictions
        5. Include specific brands where relevant
        6. Provide both SI (metric) and user-friendly measurements
        7. Find the UPC - if not found, return empty string
        
        Important: Ensure the total macros of all items match the meal targets.
      `;

      const mealResult = await InvokeLLM({
        prompt: mealPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            mealName: { type: "string" },
            mealCalories: { type: "number" },
            mealProtein: { type: "string" },
            mealFat: { type: "string" },
            mealCarbs: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemName: { type: "string" },
                  itemCalories: { type: "number" },
                  itemProtein: { type: "string" },
                  itemFat: { type: "string" },
                  itemCarbs: { type: "string" },
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
                        fat: { type: "string" },
                        carbs: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Ensure the generated meal has all the required properties
      return {
        ...mealTargets,
        ...mealResult,
        items: mealResult.items || []
      };
    } catch (error) {
      console.error(`Error generating ${mealName}:`, error);
      // Return the base meal structure with targets if generation fails
      return {
        ...mealTargets,
        items: []
      };
    }
  };

  const generateMenu = async () => {
    try {
      setIsGenerating(true);

      const clientContext = {
        age: client.age,
        gender: client.gender,
        height: client.height,
        weight: client.weight,
        activity_level: client.activity_level,
        goal: client.goal,
        dietary_restrictions: client.dietary_restrictions || []
      };

      // Get macros with proper formatting
      const macros = {
        protein: typeof targetMacros.protein === 'string' ? targetMacros.protein : `${targetMacros.protein}g`,
        carbs: typeof targetMacros.carbs === 'string' ? targetMacros.carbs : `${targetMacros.carbs}g`,
        fat: typeof targetMacros.fat === 'string' ? targetMacros.fat : `${targetMacros.fat}g`
      };

      // Calculate meal splits with macros
      const mealTargets = calculateMealSplit(targetCalories, macros);

      // Generate recommendations
      const recommendationsResponse = await generateGeneralRecommendations(clientContext);
      
      // Convert recommendations to array format
      const recommendations = Object.entries(recommendationsResponse).map(([key, value]) => ({
        recommendation_key: key,
        recommendation_value: value
      }));

      // Generate each meal sequentially
      const meals = [];
      for (const [mealName, targets] of Object.entries(mealTargets)) {
        const meal = await generateMeal(mealName, targets, clientContext, meals);
        meals.push(meal);
      }

      const menuData = {
        programName: `${client.full_name} - ${client.goal.charAt(0).toUpperCase() + client.goal.slice(1)} Plan`,
        dailyTotalCalories: targetCalories,
        status: "draft",
        active_from: new Date().toISOString().split('T')[0],
        active_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        recommendations,
        meals,
        macros  // Using the properly formatted macros
      };

      onMenuGenerated(menuData);
    } catch (error) {
      console.error("Error in menu generation:", error);
      onError("Failed to generate menu. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button 
      type="button" 
      variant="outline"
      onClick={generateMenu}
      disabled={isGenerating || !client}
      className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
    >
      {isGenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          Generate Menu
        </>
      )}
    </Button>
  );
}
