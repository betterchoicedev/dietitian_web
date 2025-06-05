
import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronDown, ChevronRight, ChevronUp, Plus, RefreshCw, Trash, CalendarClock } from 'lucide-react';
import { InvokeLLM } from '@/api/integrations';

export default function MealCard({
  meal,
  onUpdateMeal,
  onDeleteMeal,
  onGenerateMeal,
  isGenerating,
  colorScheme = "green"
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [localGenerating, setLocalGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  
  // Helper function to extract numeric values from macros
  const extractNumeric = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const match = value.toString().match(/(\d+)/);
    return match ? parseInt(match[0], 10) : 0;
  };

  // Format macros for display
  const formatMacro = (value) => {
    if (!value) return '0g';
    if (typeof value === 'number') return `${value}g`;
    if (typeof value === 'string' && !value.endsWith('g')) return `${value}g`;
    return value;
  };

  // Calculate meal-level macros from items
  React.useEffect(() => {
    if (meal.items && meal.items.length > 0) {
      let totalCalories = 0;
      let totalProtein = 0;
      let totalFat = 0;
      let totalCarbs = 0;
      
      meal.items.forEach(item => {
        if (item.itemCalories) totalCalories += item.itemCalories;
        totalProtein += extractNumeric(item.itemProtein);
        totalFat += extractNumeric(item.itemFat);
        totalCarbs += extractNumeric(item.itemCarbs);
      });
      
      // Only update if values changed to avoid infinite loop
      const shouldUpdate = 
        totalCalories !== meal.mealCalories || 
        totalProtein !== extractNumeric(meal.mealProtein) ||
        totalFat !== extractNumeric(meal.mealFat) ||
        totalCarbs !== extractNumeric(meal.mealCarbs);
        
      if (shouldUpdate) {
        onUpdateMeal({
          ...meal,
          mealCalories: totalCalories,
          mealProtein: `${totalProtein}g`,
          mealFat: `${totalFat}g`,
          mealCarbs: `${totalCarbs}g`,
        });
      }
    }
  }, [meal.items]);

  // Add new food item
  const handleAddFoodItem = () => {
    const newItem = {
      itemName: "",
      itemCalories: 0,
      itemProtein: "0g",
      itemFat: "0g",
      ingredients: [{
        ingredientName: "",
        brand: "",
        upc: "",
        portionSI: "",
        portionUser: "",
        protein: "",
        fat: "",
        isCollapsed: true // Start collapsed
      }],
      alternatives: []
    };
    
    onUpdateMeal({
      ...meal,
      items: [...(meal.items || []), newItem]
    });
  };

  // Add ingredient to a food item
  const handleAddIngredient = (itemIndex) => {
    const newItems = [...meal.items];
    
    if (!newItems[itemIndex].ingredients) {
      newItems[itemIndex].ingredients = [];
    }
    
    newItems[itemIndex].ingredients.push({
      ingredientName: "",
      brand: "",
      upc: "",
      portionSI: "",
      portionUser: "",
      protein: "",
      fat: "",
      isCollapsed: true // Start collapsed
    });
    
    onUpdateMeal({ ...meal, items: newItems });
  };

  // Generate alternative item functionality
  const handleAddAlternativeItem = async (itemIndex) => {
    const baseItem = meal.items[itemIndex];
    if (!baseItem) return;

    try {
      setLocalGenerating(true);
      setGenerationError(null);
      
      // Default alternative if LLM fails
      let alternativeItem = {
        itemName: `Alternative for ${baseItem.itemName}`,
        itemCalories: baseItem.itemCalories,
        itemProtein: baseItem.itemProtein,
        itemFat: baseItem.itemFat,
        ingredients: [],
        isCollapsed: false
      };

      // Try to generate a real alternative with LLM
      try {
        const result = await InvokeLLM({
          prompt: `Generate a single alternative food item for "${baseItem.itemName}" with similar:
          - Calories: ${baseItem.itemCalories} kcal
          - Protein: ${baseItem.itemProtein}
          - Fat: ${baseItem.itemFat}
          
          The alternative should meet these requirements:
          - Different main ingredients but similar macros
          - If original contains dairy (milk, cheese, yogurt, butter) and user is dairy-free, ensure alternative is dairy-free
          - Include 1-3 ingredients with brands and portions
          
          Return ONLY the alternative item in the specified JSON format.`,
          response_json_schema: {
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
        });
        
        // Add isCollapsed to all ingredients
        if (result && result.ingredients) {
          result.ingredients = result.ingredients.map(ing => ({
            ...ing,
            isCollapsed: true
          }));
          alternativeItem = result;
          alternativeItem.isCollapsed = false;
        }
      } catch (error) {
        console.error("Error generating alternative item:", error);
        setGenerationError("Network error generating alternative. Try again later.");
        // Continue with default alternative
      }
      
      // Add the alternative
      const newItems = [...meal.items];
      
      if (!newItems[itemIndex].alternatives) {
        newItems[itemIndex].alternatives = [];
      }
      
      newItems[itemIndex].alternatives.push(alternativeItem);
      onUpdateMeal({ ...meal, items: newItems });
      
    } catch (error) {
      console.error("Error in alternative generation:", error);
      setGenerationError("Failed to generate alternative item. Please try again.");
    } finally {
      setLocalGenerating(false);
    }
  };

  // Generate alternative ingredient functionality
  const handleAddAlternativeIngredient = async (itemIndex, ingredientIndex) => {
    const baseIngredient = meal.items[itemIndex].ingredients[ingredientIndex];
    if (!baseIngredient) return;

    try {
      setLocalGenerating(true);
      setGenerationError(null);
      
      // Default alternative if LLM fails
      let alternativeIngredient = {
        ingredientName: `Alternative for ${baseIngredient.ingredientName}`,
        brand: baseIngredient.brand || "Generic",
        upc: "",
        portionSI: baseIngredient.portionSI || "1 serving",
        portionUser: baseIngredient.portionUser || "1 serving",
        protein: baseIngredient.protein || "0g",
        fat: baseIngredient.fat || "0g",
        isCollapsed: true
      };

      // Try to generate a real alternative with LLM
      try {
        const result = await InvokeLLM({
          prompt: `Generate a single alternative ingredient to replace "${baseIngredient.ingredientName}" with similar:
          - Original portion: ${baseIngredient.portionSI || baseIngredient.portionUser}
          - Protein: ${baseIngredient.protein}
          - Fat: ${baseIngredient.fat}
          
          The alternative should:
          - Serve the same culinary purpose
          - Have similar macronutrient profile
          - If original is dairy (milk, cheese, yogurt, butter), ensure alternative is dairy-free
          - Include UPC if available, otherwise leave empty
          
          Return ONLY the alternative ingredient in the specified JSON format.`,
          response_json_schema: {
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
        });
        
        if (result) {
          alternativeIngredient = {
            ...result,
            isCollapsed: true
          };
        }
      } catch (error) {
        console.error("Error generating alternative ingredient:", error);
        setGenerationError("Network error generating alternative. Try again later.");
        // Continue with default alternative
      }
      
      // Add the alternative ingredient
      const newItems = [...meal.items];
      const newIngredient = newItems[itemIndex].ingredients[ingredientIndex];
      
      if (!newIngredient.alternatives) {
        newIngredient.alternatives = [];
      }
      
      newIngredient.alternatives.push(alternativeIngredient);
      onUpdateMeal({ ...meal, items: newItems });
      
    } catch (error) {
      console.error("Error in alternative generation:", error);
      setGenerationError("Failed to generate alternative ingredient. Please try again.");
    } finally {
      setLocalGenerating(false);
    }
  };
  
  // Generate alternative for alternative item's ingredient
  const handleAddAltItemIngredient = async (itemIndex, altItemIndex) => {
    try {
      setLocalGenerating(true);
      setGenerationError(null);
      
      const newItems = [...meal.items];
      const alternativeItem = newItems[itemIndex].alternatives[altItemIndex];
      
      if (!alternativeItem.ingredients) {
        alternativeItem.ingredients = [];
      }
      
      // Generate a new ingredient with LLM
      let newIngredient = {
        ingredientName: "New ingredient",
        brand: "Generic",
        upc: "",
        portionSI: "1 serving",
        portionUser: "1 serving",
        protein: "0g",
        fat: "0g",
        isCollapsed: true
      };
      
      try {
        const result = await InvokeLLM({
          prompt: `Generate a single ingredient for the dish "${alternativeItem.itemName}" that:
          - Has appropriate macros for this type of dish
          - Includes brand suggestion and serving size
          - Include UPC if available, otherwise leave empty
          - Should be dairy-free if appropriate
          
          Return ONLY the ingredient in the specified JSON format.`,
          response_json_schema: {
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
        });
        
        if (result) {
          newIngredient = {
            ...result,
            isCollapsed: true
          };
        }
      } catch (error) {
        console.error("Error generating ingredient:", error);
        setGenerationError("Network error generating ingredient. Try again later.");
        // Continue with default ingredient
      }
      
      alternativeItem.ingredients.push(newIngredient);
      onUpdateMeal({ ...meal, items: newItems });
      
    } catch (error) {
      console.error("Error adding ingredient:", error);
      setGenerationError("Failed to add ingredient. Please try again.");
    } finally {
      setLocalGenerating(false);
    }
  };

  const getBgColor = () => {
    switch (colorScheme) {
      case "green": return "bg-green-50";
      case "blue": return "bg-blue-50";
      case "purple": return "bg-purple-50";
      case "orange": return "bg-orange-50";
      case "red": return "bg-red-50";
      default: return "bg-green-50";
    }
  };

  // Format time window for display
  const formatTimeWindow = (timeWindow) => {
    if (!timeWindow) return 'All day';
    return `${timeWindow.start} - ${timeWindow.end}`;
  };

  const displayMacros = {
    calories: meal.mealCalories || 0,
    protein: formatMacro(meal.mealProtein),
    fat: formatMacro(meal.mealFat),
    carbs: formatMacro(meal.mealCarbs)
  };

  return (
    <Card className={`${getBgColor()} border-t-4`} style={{ borderColor: `var(--${colorScheme}-500)` }}>
      <CardHeader className="flex flex-row items-center justify-between p-4">
        <div className="space-y-1">
          <div className="text-lg font-medium">
            <Input
              value={meal.mealName || ''}
              onChange={(e) => onUpdateMeal({ ...meal, mealName: e.target.value })}
              className="w-full max-w-xs font-medium py-1 px-2 h-8"
            />
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-gray-500">
            <span>{displayMacros.calories} kcal</span>
            <span>|</span>
            <span>P: {displayMacros.protein}</span>
            <span>|</span>
            <span>F: {displayMacros.fat}</span>
            <span>|</span>
            <span>C: {displayMacros.carbs}</span>
          </div>
          {meal.timeWindow && (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" />
              {formatTimeWindow(meal.timeWindow)}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onGenerateMeal(meal)}
            disabled={isGenerating}
            className="h-8 w-8 p-0"
          >
            {isGenerating ? (
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDeleteMeal(meal)}
            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
          >
            <Trash className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="h-8 w-8 p-0"
          >
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {generationError && (
        <div className="text-sm text-amber-600 p-2 bg-amber-50 rounded-md mx-4 mb-2">
          {generationError}
        </div>
      )}

      {isOpen && (
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Calories (kcal)</Label>
              <Input 
                type="number" 
                value={meal.mealCalories || 0}
                readOnly={true}
                className="bg-gray-50"
              />
            </div>
            <div>
              <Label>Protein</Label>
              <Input 
                value={meal.mealProtein || '0g'}
                readOnly={true}
                className="bg-gray-50"
              />
            </div>
            <div>
              <Label>Fat</Label>
              <Input 
                value={meal.mealFat || '0g'}
                readOnly={true}
                className="bg-gray-50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">Food Items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddFoodItem}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Food Item
              </Button>
            </div>
            
            <Accordion type="single" collapsible className="space-y-4">
              {meal.items?.map((item, itemIndex) => (
                <AccordionItem 
                  key={itemIndex} 
                  value={`item-${itemIndex}`}
                  className="border rounded-lg overflow-hidden"
                >
                  <AccordionTrigger className="px-4 py-2 hover:no-underline">
                    <div className="flex justify-between items-center w-full">
                      <div className="font-medium text-left">
                        {item.itemName || `Item ${itemIndex + 1}`}
                      </div>
                      <div className="text-sm text-gray-500">
                        {item.itemCalories} kcal
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="p-4 pt-0 space-y-4">
                      {/* Item main details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`item-${itemIndex}-name`}>Name</Label>
                          <Input
                            id={`item-${itemIndex}-name`}
                            value={item.itemName || ''}
                            onChange={(e) => {
                              const newItems = [...meal.items];
                              newItems[itemIndex].itemName = e.target.value;
                              onUpdateMeal({ ...meal, items: newItems });
                            }}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`item-${itemIndex}-calories`}>Calories</Label>
                          <Input
                            id={`item-${itemIndex}-calories`}
                            type="number"
                            value={item.itemCalories || 0}
                            onChange={(e) => {
                              const newItems = [...meal.items];
                              newItems[itemIndex].itemCalories = parseInt(e.target.value) || 0;
                              onUpdateMeal({ ...meal, items: newItems });
                            }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`item-${itemIndex}-protein`}>Protein</Label>
                          <Input
                            id={`item-${itemIndex}-protein`}
                            value={item.itemProtein || '0g'}
                            onChange={(e) => {
                              const newItems = [...meal.items];
                              newItems[itemIndex].itemProtein = e.target.value;
                              onUpdateMeal({ ...meal, items: newItems });
                            }}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`item-${itemIndex}-fat`}>Fat</Label>
                          <Input
                            id={`item-${itemIndex}-fat`}
                            value={item.itemFat || '0g'}
                            onChange={(e) => {
                              const newItems = [...meal.items];
                              newItems[itemIndex].itemFat = e.target.value;
                              onUpdateMeal({ ...meal, items: newItems });
                            }}
                          />
                        </div>
                      </div>

                      {/* Ingredients section */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-sm font-medium">Ingredients</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddIngredient(itemIndex)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Ingredient
                          </Button>
                        </div>

                        <div className="space-y-3">
                          {item.ingredients?.map((ingredient, ingredientIndex) => (
                            <div key={ingredientIndex} className="border rounded-lg p-3 bg-white">
                              {/* Ingredient header with collapse toggle */}
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 flex-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newItems = [...meal.items];
                                      newItems[itemIndex].ingredients[ingredientIndex].isCollapsed = 
                                        !newItems[itemIndex].ingredients[ingredientIndex].isCollapsed;
                                      onUpdateMeal({ ...meal, items: newItems });
                                    }}
                                    className="p-1 h-auto"
                                  >
                                    {ingredient.isCollapsed ? 
                                      <ChevronRight className="h-4 w-4" /> : 
                                      <ChevronDown className="h-4 w-4" />
                                    }
                                  </Button>
                                  
                                  <div className="flex-1">
                                    <Input
                                      value={ingredient.ingredientName || ''}
                                      onChange={(e) => {
                                        const newItems = [...meal.items];
                                        newItems[itemIndex].ingredients[ingredientIndex].ingredientName = e.target.value;
                                        onUpdateMeal({ ...meal, items: newItems });
                                      }}
                                      placeholder="Ingredient name"
                                      className="h-8"
                                    />
                                  </div>
                                  
                                  <div className="flex-shrink-0 ml-2">
                                    <Input
                                      value={ingredient.portionUser || ingredient.portionSI || ''}
                                      onChange={(e) => {
                                        const newItems = [...meal.items];
                                        newItems[itemIndex].ingredients[ingredientIndex].portionUser = e.target.value;
                                        onUpdateMeal({ ...meal, items: newItems });
                                      }}
                                      placeholder="Portion"
                                      className="w-20 h-8"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleAddAlternativeIngredient(itemIndex, ingredientIndex)}
                                    className="text-blue-600 hover:text-blue-800"
                                    disabled={localGenerating}
                                  >
                                    {localGenerating ? 
                                      <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : 
                                      <Plus className="h-4 w-4" />
                                    }
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newItems = [...meal.items];
                                      newItems[itemIndex].ingredients.splice(ingredientIndex, 1);
                                      onUpdateMeal({ ...meal, items: newItems });
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              {/* Collapsible ingredient details */}
                              {!ingredient.isCollapsed && (
                                <div className="grid grid-cols-2 gap-3 mt-3">
                                  <div>
                                    <Label>Brand</Label>
                                    <Input
                                      value={ingredient.brand || ''}
                                      onChange={(e) => {
                                        const newItems = [...meal.items];
                                        newItems[itemIndex].ingredients[ingredientIndex].brand = e.target.value;
                                        onUpdateMeal({ ...meal, items: newItems });
                                      }}
                                      placeholder="Brand"
                                    />
                                  </div>
                                  <div>
                                    <Label>Unit Size (SI)</Label>
                                    <Input
                                      value={ingredient.portionSI || ''}
                                      onChange={(e) => {
                                        const newItems = [...meal.items];
                                        newItems[itemIndex].ingredients[ingredientIndex].portionSI = e.target.value;
                                        onUpdateMeal({ ...meal, items: newItems });
                                      }}
                                      placeholder="e.g. 100g"
                                    />
                                  </div>
                                  <div>
                                    <Label>UPC</Label>
                                    <Input
                                      value={ingredient.upc || ''}
                                      onChange={(e) => {
                                        const newItems = [...meal.items];
                                        newItems[itemIndex].ingredients[ingredientIndex].upc = e.target.value;
                                        onUpdateMeal({ ...meal, items: newItems });
                                      }}
                                      placeholder="UPC Code"
                                    />
                                  </div>
                                  <div>
                                    <Label>Protein</Label>
                                    <Input
                                      value={ingredient.protein || ''}
                                      onChange={(e) => {
                                        const newItems = [...meal.items];
                                        newItems[itemIndex].ingredients[ingredientIndex].protein = e.target.value;
                                        onUpdateMeal({ ...meal, items: newItems });
                                      }}
                                      placeholder="e.g. 5g"
                                    />
                                  </div>
                                  <div>
                                    <Label>Fat</Label>
                                    <Input
                                      value={ingredient.fat || ''}
                                      onChange={(e) => {
                                        const newItems = [...meal.items];
                                        newItems[itemIndex].ingredients[ingredientIndex].fat = e.target.value;
                                        onUpdateMeal({ ...meal, items: newItems });
                                      }}
                                      placeholder="e.g. 2g"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Alternative ingredients */}
                              {ingredient.alternatives && ingredient.alternatives.length > 0 && (
                                <div className="mt-2 pl-6 border-l-2 border-blue-200">
                                  <p className="text-xs text-blue-600 mb-1">Alternative Options:</p>
                                  {ingredient.alternatives.map((alt, altIndex) => (
                                    <div key={altIndex} className="bg-blue-50 rounded p-2 mb-2">
                                      {/* Alternative Ingredient Header with collapse */}
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 flex-1">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              const newItems = [...meal.items];
                                              newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].isCollapsed = 
                                                !newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].isCollapsed;
                                              onUpdateMeal({ ...meal, items: newItems });
                                            }}
                                            className="p-1 h-auto"
                                          >
                                            {alt.isCollapsed ? 
                                              <ChevronRight className="h-3 w-3" /> : 
                                              <ChevronDown className="h-3 w-3" />
                                            }
                                          </Button>
                                          
                                          <div className="flex-1">
                                            <Input
                                              value={alt.ingredientName || ''}
                                              onChange={(e) => {
                                                const newItems = [...meal.items];
                                                newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].ingredientName = e.target.value;
                                                onUpdateMeal({ ...meal, items: newItems });
                                              }}
                                              placeholder="Alt. ingredient"
                                              className="h-7 text-sm"
                                            />
                                          </div>
                                          
                                          <div className="flex-shrink-0 ml-1">
                                            <Input
                                              value={alt.portionUser || alt.portionSI || ''}
                                              onChange={(e) => {
                                                const newItems = [...meal.items];
                                                newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].portionUser = e.target.value;
                                                onUpdateMeal({ ...meal, items: newItems });
                                              }}
                                              placeholder="Portion"
                                              className="w-16 h-7 text-sm"
                                            />
                                          </div>
                                        </div>

                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            const newItems = [...meal.items];
                                            newItems[itemIndex].ingredients[ingredientIndex].alternatives.splice(altIndex, 1);
                                            onUpdateMeal({ ...meal, items: newItems });
                                          }}
                                          className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                                        >
                                          <Trash className="h-3 w-3" />
                                        </Button>
                                      </div>

                                      {/* Collapsible alternative ingredient details */}
                                      {!alt.isCollapsed && (
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                          <div>
                                            <Label className="text-xs">Brand</Label>
                                            <Input
                                              value={alt.brand || ''}
                                              onChange={(e) => {
                                                const newItems = [...meal.items];
                                                newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].brand = e.target.value;
                                                onUpdateMeal({ ...meal, items: newItems });
                                              }}
                                              className="h-7 text-xs"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">Unit Size (SI)</Label>
                                            <Input
                                              value={alt.portionSI || ''}
                                              onChange={(e) => {
                                                const newItems = [...meal.items];
                                                newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].portionSI = e.target.value;
                                                onUpdateMeal({ ...meal, items: newItems });
                                              }}
                                              className="h-7 text-xs"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">UPC</Label>
                                            <Input
                                              value={alt.upc || ''}
                                              onChange={(e) => {
                                                const newItems = [...meal.items];
                                                newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].upc = e.target.value;
                                                onUpdateMeal({ ...meal, items: newItems });
                                              }}
                                              className="h-7 text-xs"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">Protein</Label>
                                            <Input
                                              value={alt.protein || ''}
                                              onChange={(e) => {
                                                const newItems = [...meal.items];
                                                newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].protein = e.target.value;
                                                onUpdateMeal({ ...meal, items: newItems });
                                              }}
                                              className="h-7 text-xs"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">Fat</Label>
                                            <Input
                                              value={alt.fat || ''}
                                              onChange={(e) => {
                                                const newItems = [...meal.items];
                                                newItems[itemIndex].ingredients[ingredientIndex].alternatives[altIndex].fat = e.target.value;
                                                onUpdateMeal({ ...meal, items: newItems });
                                              }}
                                              className="h-7 text-xs"
                                            />
                                          </div>
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
                      
                      {/* Alternative food items section */}
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-2">
                          <Label>Alternative Options</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddAlternativeItem(itemIndex)}
                            disabled={localGenerating}
                            className="bg-blue-50 text-blue-700 border-blue-200"
                          >
                            {localGenerating ? (
                              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                            ) : (
                              <Plus className="h-4 w-4 mr-2" />
                            )}
                            Add Alternative
                          </Button>
                        </div>
                        
                        {item.alternatives && item.alternatives.length > 0 ? (
                          <div className="space-y-4 pl-4 border-l-2 border-blue-200">
                            {item.alternatives.map((alt, altIndex) => (
                              <div key={altIndex} className="bg-blue-50 rounded-lg p-3">
                                {/* Alternative item header */}
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2 flex-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newItems = [...meal.items];
                                        newItems[itemIndex].alternatives[altIndex].isCollapsed = 
                                          !newItems[itemIndex].alternatives[altIndex].isCollapsed;
                                        onUpdateMeal({ ...meal, items: newItems });
                                      }}
                                      className="p-1 h-auto"
                                    >
                                      {alt.isCollapsed ? 
                                        <ChevronRight className="h-4 w-4" /> : 
                                        <ChevronDown className="h-4 w-4" />
                                      }
                                    </Button>
                                    <span className="font-medium">Alternative {altIndex + 1}</span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newItems = [...meal.items];
                                      newItems[itemIndex].alternatives.splice(altIndex, 1);
                                      onUpdateMeal({ ...meal, items: newItems });
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                </div>

                                {/* Alternative item details */}
                                <div className={alt.isCollapsed ? 'hidden' : 'space-y-3 mt-3'}>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <Label>Name</Label>
                                      <Input
                                        value={alt.itemName || ''}
                                        onChange={(e) => {
                                          const newItems = [...meal.items];
                                          newItems[itemIndex].alternatives[altIndex].itemName = e.target.value;
                                          onUpdateMeal({ ...meal, items: newItems });
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <Label>Calories</Label>
                                      <Input
                                        type="number"
                                        value={alt.itemCalories || 0}
                                        onChange={(e) => {
                                          const newItems = [...meal.items];
                                          newItems[itemIndex].alternatives[altIndex].itemCalories = parseInt(e.target.value) || 0;
                                          onUpdateMeal({ ...meal, items: newItems });
                                        }}
                                      />
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label>Protein</Label>
                                      <Input
                                        value={alt.itemProtein || '0g'}
                                        onChange={(e) => {
                                          const newItems = [...meal.items];
                                          newItems[itemIndex].alternatives[altIndex].itemProtein = e.target.value;
                                          onUpdateMeal({ ...meal, items: newItems });
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <Label>Fat</Label>
                                      <Input
                                        value={alt.itemFat || '0g'}
                                        onChange={(e) => {
                                          const newItems = [...meal.items];
                                          newItems[itemIndex].alternatives[altIndex].itemFat = e.target.value;
                                          onUpdateMeal({ ...meal, items: newItems });
                                        }}
                                      />
                                    </div>
                                  </div>

                                  {/* Alternative item ingredients */}
                                  <div className="space-y-2 mt-2">
                                    <div className="flex justify-between items-center">
                                      <Label className="text-sm">Ingredients</Label>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleAddAltItemIngredient(itemIndex, altIndex)}
                                        disabled={localGenerating}
                                      >
                                        {localGenerating ? (
                                          <div className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full mr-1" />
                                        ) : (
                                          <Plus className="h-3 w-3 mr-1" />
                                        )}
                                        Add
                                      </Button>
                                    </div>
                                    
                                    <div className="space-y-2">
                                      {alt.ingredients?.map((ingredient, ingredientIndex) => (
                                        <div key={ingredientIndex} className="bg-white rounded p-2 border">
                                          {/* Alt Item Ingredient header with collapse toggle */}
                                          <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2 flex-1">
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                  const newItems = [...meal.items];
                                                  newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].isCollapsed = 
                                                    !newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].isCollapsed;
                                                  onUpdateMeal({ ...meal, items: newItems });
                                                }}
                                                className="p-1 h-auto"
                                              >
                                                {ingredient.isCollapsed ? 
                                                  <ChevronRight className="h-3 w-3" /> : 
                                                  <ChevronDown className="h-3 w-3" />
                                                }
                                              </Button>
                                              
                                              <div className="flex-1">
                                                <Input
                                                  value={ingredient.ingredientName || ''}
                                                  onChange={(e) => {
                                                    const newItems = [...meal.items];
                                                    newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].ingredientName = e.target.value;
                                                    onUpdateMeal({ ...meal, items: newItems });
                                                  }}
                                                  placeholder="Ingredient"
                                                  className="h-7 text-sm"
                                                />
                                              </div>
                                              
                                              <div className="flex-shrink-0 ml-1">
                                                <Input
                                                  value={ingredient.portionUser || ingredient.portionSI || ''}
                                                  onChange={(e) => {
                                                    const newItems = [...meal.items];
                                                    newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].portionUser = e.target.value;
                                                    onUpdateMeal({ ...meal, items: newItems });
                                                  }}
                                                  placeholder="Portion"
                                                  className="w-16 h-7 text-sm"
                                                />
                                              </div>
                                            </div>

                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => {
                                                const newItems = [...meal.items];
                                                newItems[itemIndex].alternatives[altIndex].ingredients.splice(ingredientIndex, 1);
                                                onUpdateMeal({ ...meal, items: newItems });
                                              }}
                                              className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                                            >
                                              <Trash className="h-3 w-3" />
                                            </Button>
                                          </div>

                                          {/* Collapsible alt item ingredient details */}
                                          {!ingredient.isCollapsed && (
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                              <div>
                                                <Label className="text-xs">Brand</Label>
                                                <Input
                                                  value={ingredient.brand || ''}
                                                  onChange={(e) => {
                                                    const newItems = [...meal.items];
                                                    newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].brand = e.target.value;
                                                    onUpdateMeal({ ...meal, items: newItems });
                                                  }}
                                                  className="h-7 text-xs"
                                                />
                                              </div>
                                              <div>
                                                <Label className="text-xs">Unit Size</Label>
                                                <Input
                                                  value={ingredient.portionSI || ''}
                                                  onChange={(e) => {
                                                    const newItems = [...meal.items];
                                                    newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].portionSI = e.target.value;
                                                    onUpdateMeal({ ...meal, items: newItems });
                                                  }}
                                                  className="h-7 text-xs"
                                                />
                                              </div>
                                              <div>
                                                <Label className="text-xs">UPC</Label>
                                                <Input
                                                  value={ingredient.upc || ''}
                                                  onChange={(e) => {
                                                    const newItems = [...meal.items];
                                                    newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].upc = e.target.value;
                                                    onUpdateMeal({ ...meal, items: newItems });
                                                  }}
                                                  className="h-7 text-xs"
                                                />
                                              </div>
                                              <div>
                                                <Label className="text-xs">Protein</Label>
                                                <Input
                                                  value={ingredient.protein || ''}
                                                  onChange={(e) => {
                                                    const newItems = [...meal.items];
                                                    newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].protein = e.target.value;
                                                    onUpdateMeal({ ...meal, items: newItems });
                                                  }}
                                                  className="h-7 text-xs"
                                                />
                                              </div>
                                              <div>
                                                <Label className="text-xs">Fat</Label>
                                                <Input
                                                  value={ingredient.fat || ''}
                                                  onChange={(e) => {
                                                    const newItems = [...meal.items];
                                                    newItems[itemIndex].alternatives[altIndex].ingredients[ingredientIndex].fat = e.target.value;
                                                    onUpdateMeal({ ...meal, items: newItems });
                                                  }}
                                                  className="h-7 text-xs"
                                                />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                      
                                      {!alt.ingredients?.length && (
                                        <p className="text-xs text-gray-500 italic p-2">
                                          No ingredients added
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 italic">
                            No alternatives added. Click "Add Alternative" to create one.
                          </p>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
