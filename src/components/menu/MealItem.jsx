
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, Plus, Trash } from 'lucide-react';

export default function MealItem({
  item,
  index,
  onUpdate,
  onDelete,
  onGenerateAlternative,
  isGenerating
}) {
  const [showIngredients, setShowIngredients] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [isGeneratingAlternative, setIsGeneratingAlternative] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Helper function to extract numeric values from macros
  const extractNumeric = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const match = value.toString().match(/(\d+)/);
    return match ? parseInt(match[0], 10) : 0;
  };

  // Ensure macro formatting is consistent
  const formatMacro = (value) => {
    if (!value) return '0g';
    if (typeof value === 'number') return `${value}g`;
    if (typeof value === 'string' && !value.endsWith('g')) return `${value}g`;
    return value;
  };

  // Calculate item-level macros if they aren't set but ingredients exist
  useEffect(() => {
    if (item.ingredients && item.ingredients.length > 0 &&
      (!item.itemCalories || item.itemCalories === 0)) {
      
      // If ingredient-level nutrition data is available, calculate totals
      let totalCalories = 0;
      let totalProtein = 0;
      let totalFat = 0;
      
      item.ingredients.forEach(ing => {
        // Ingredients might have calorie data
        totalProtein += extractNumeric(ing.protein);
        totalFat += extractNumeric(ing.fat);
      });
      
      // If we found values, update the item
      if (totalProtein > 0 || totalFat > 0) {
        onUpdate({
          ...item,
          itemProtein: totalProtein > 0 ? `${totalProtein}g` : item.itemProtein,
          itemFat: totalFat > 0 ? `${totalFat}g` : item.itemFat
        });
      }
    }
  }, [item.ingredients, item.itemProtein, item.itemFat, item.itemCalories, onUpdate, item]);

  const displayMacros = {
    calories: item.itemCalories || 0,
    protein: formatMacro(item.itemProtein),
    fat: formatMacro(item.itemFat),
    carbs: formatMacro(item.itemCarbs)
  };

  const IngredientFields = ({ ingredient, onIngredientUpdate, onIngredientDelete }) => (
    <div className="bg-white p-4 rounded-lg border space-y-4">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 flex-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onIngredientUpdate({
                ...ingredient,
                isCollapsed: !ingredient.isCollapsed
              });
            }}
          >
            {ingredient.isCollapsed ?
              <ChevronRight className="h-4 w-4" /> :
              <ChevronDown className="h-4 w-4" />
            }
          </Button>
          <div className="flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={ingredient.ingredientName || ''}
                  onChange={(e) => onIngredientUpdate({
                    ...ingredient,
                    ingredientName: e.target.value
                  })}
                />
              </div>
              <div>
                <Label>Portion</Label>
                <Input
                  value={ingredient.portionUser || ''}
                  onChange={(e) => onIngredientUpdate({
                    ...ingredient,
                    portionUser: e.target.value,
                    portionSI: e.target.value
                  })}
                />
              </div>
            </div>

            {!ingredient.isCollapsed && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label>Brand</Label>
                    <Input
                      value={ingredient.brand || ''}
                      onChange={(e) => onIngredientUpdate({
                        ...ingredient,
                        brand: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <Label>UPC</Label>
                    <Input
                      value={ingredient.upc || ''}
                      onChange={(e) => onIngredientUpdate({
                        ...ingredient,
                        upc: e.target.value
                      })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label>Protein</Label>
                    <Input
                      value={ingredient.protein || ''}
                      onChange={(e) => onIngredientUpdate({
                        ...ingredient,
                        protein: e.target.value
                      })}
                    />
                  </div>
                  <div>
                    <Label>Fat</Label>
                    <Input
                      value={ingredient.fat || ''}
                      onChange={(e) => onIngredientUpdate({
                        ...ingredient,
                        fat: e.target.value
                      })}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onIngredientDelete()}
            className="text-red-500 hover:text-red-700"
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="border rounded-lg mb-2 overflow-hidden bg-white">
      {/* Item header with name, macros, and actions */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex-1">
          <Input
            className="font-medium"
            value={item.itemName || ''}
            onChange={(e) => onUpdate({ ...item, itemName: e.target.value })}
          />
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
            <span>{displayMacros.calories} kcal</span>
            <span>|</span>
            <span>P: {displayMacros.protein}</span>
            <span>|</span>
            <span>F: {displayMacros.fat}</span>
            <span>|</span>
            <span>C: {displayMacros.carbs}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowIngredients(!showIngredients)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowAlternatives(!showAlternatives)}
            disabled={isGeneratingAlternative}
          >
            {isGeneratingAlternative ? (
              "Generating..."
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-red-500 hover:text-red-700"
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content: Name, Calories, Macros, and Ingredients */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={item.itemName || ''}
                onChange={(e) => onUpdate({ ...item, itemName: e.target.value })}
              />
            </div>
            <div>
              <Label>Calories</Label>
              <Input
                type="number"
                value={item.itemCalories || ''}
                onChange={(e) => onUpdate({ ...item, itemCalories: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Protein</Label>
              <Input
                value={item.itemProtein || ''}
                onChange={(e) => onUpdate({ ...item, itemProtein: e.target.value })}
              />
            </div>
            <div>
              <Label>Fat</Label>
              <Input
                value={item.itemFat || ''}
                onChange={(e) => onUpdate({ ...item, itemFat: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Ingredients</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newIngredient = {
                    ingredientName: "",
                    brand: "",
                    upc: "",
                    portionSI: "",
                    portionUser: "",
                    protein: "",
                    fat: "",
                    isCollapsed: true // Start collapsed by default
                  };

                  onUpdate({
                    ...item,
                    ingredients: [...(item.ingredients || []), newIngredient]
                  });
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Ingredient
              </Button>
            </div>

            {item.ingredients?.map((ingredient, index) => (
              <IngredientFields
                key={index}
                ingredient={ingredient}
                onIngredientUpdate={(updatedIngredient) => {
                  const newIngredients = [...(item.ingredients || [])];
                  newIngredients[index] = updatedIngredient;
                  onUpdate({ ...item, ingredients: newIngredients });
                }}
                onIngredientDelete={() => {
                  const newIngredients = [...(item.ingredients || [])];
                  newIngredients.splice(index, 1);
                  onUpdate({ ...item, ingredients: newIngredients });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
