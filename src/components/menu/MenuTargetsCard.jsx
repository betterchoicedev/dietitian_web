import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash, CalendarClock } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

export default function MenuTargetsCard({
  menuData,
  onUpdateMenuData,
  isGenerating,
  onGenerate,
  onAddMeal,
  onRemoveMeal,
  onUpdateMealTime
}) {
  const [mealName, setMealName] = useState('');
  const [locked, setLocked] = useState(false);

  // Calculate total meal scale
  const totalScale = menuData.meals.reduce((sum, meal) => sum + (meal.importanceScale || 0), 0);

  // Get the default time windows based on meal name and position
  const getDefaultTimeWindow = (mealName, mealIndex, totalMeals) => {
    const nameLower = mealName.toLowerCase();
    
    if (nameLower.includes('breakfast')) return { start: '06:00', end: '11:00' };
    if (nameLower.includes('lunch')) return { start: '11:00', end: '15:00' };
    if (nameLower.includes('dinner')) return { start: '16:00', end: '21:00' };
    
    // For snacks, place them in 3-hour windows between main meals
    if (nameLower.includes('snack')) {
      // Find position relative to main meals
      const isAfterBreakfast = menuData.meals.findIndex((m, i) => 
        i < mealIndex && m.mealName.toLowerCase().includes('breakfast')
      ) !== -1;
      
      const isBeforeLunch = menuData.meals.findIndex((m, i) => 
        i > mealIndex && m.mealName.toLowerCase().includes('lunch')
      ) !== -1;
      
      const isAfterLunch = menuData.meals.findIndex((m, i) => 
        i < mealIndex && m.mealName.toLowerCase().includes('lunch')
      ) !== -1;
      
      const isBeforeDinner = menuData.meals.findIndex((m, i) => 
        i > mealIndex && m.mealName.toLowerCase().includes('dinner')
      ) !== -1;
      
      // Based on position, create 3-hour windows
      if (isAfterBreakfast && isBeforeLunch) return { start: '11:00', end: '14:00' };
      if (isAfterLunch && isBeforeDinner) return { start: '15:00', end: '18:00' };
      if (mealIndex === 0) return { start: '06:00', end: '09:00' }; // First meal
      
      // For other snacks, create reasonable windows
      return { start: '14:00', end: '17:00' };
    }
    
    return { start: '00:00', end: '23:59' }; // Default all day
  };

  // Extract numeric values from macros
  const extractNumeric = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const match = value.toString().match(/(\d+)/);
    return match ? parseInt(match[0], 10) : 0;
  };

  // Recalculate macros based on meal scales
  const recalculateMacroDistribution = () => {
    if (totalScale === 0) return;
    
    const totalProtein = extractNumeric(menuData.macros.protein);
    const totalFat = extractNumeric(menuData.macros.fat);
    const totalCarbs = extractNumeric(menuData.macros.carbs);
    
    // Update each meal's macros based on their scale
    const updatedMeals = menuData.meals.map(meal => {
      const ratio = (meal.importanceScale || 0) / totalScale;
      
      // For new meals without time windows, generate them
      const mealIndex = menuData.meals.indexOf(meal);
      if (!meal.timeWindow) {
        meal.timeWindow = getDefaultTimeWindow(meal.mealName, mealIndex, menuData.meals.length);
      }
      
      return {
        ...meal,
        mealCalories: Math.round(menuData.base_daily_total_calories * ratio),
        mealProtein: `${Math.round(totalProtein * ratio)}g`,
        mealFat: `${Math.round(totalFat * ratio)}g`,
        mealCarbs: `${Math.round(totalCarbs * ratio)}g`
      };
    });
    
    onUpdateMenuData({
      ...menuData,
      meals: updatedMeals
    });
  };

  // Handle changes to macro percentages
  const handleMacroDistributionChange = (macro, percentage) => {
    // Calculate other macros to ensure they all add up to 100%
    let proteinPct = macro === 'protein' ? percentage : extractNumeric(menuData.macroPercentages?.protein) || 30;
    let fatPct = macro === 'fat' ? percentage : extractNumeric(menuData.macroPercentages?.fat) || 30;
    let carbsPct = macro === 'carbs' ? percentage : extractNumeric(menuData.macroPercentages?.carbs) || 40;
    
    // Adjust to ensure sum is 100%
    const total = proteinPct + fatPct + carbsPct;
    if (total !== 100) {
      if (macro === 'protein') {
        // Adjust fat and carbs proportionally
        const otherTotal = fatPct + carbsPct;
        if (otherTotal > 0) {
          const factor = (100 - proteinPct) / otherTotal;
          fatPct = Math.round(fatPct * factor);
          carbsPct = 100 - proteinPct - fatPct;
        } else {
          fatPct = (100 - proteinPct) / 2;
          carbsPct = (100 - proteinPct) / 2;
        }
      } else if (macro === 'fat') {
        // Adjust protein and carbs proportionally
        const otherTotal = proteinPct + carbsPct;
        if (otherTotal > 0) {
          const factor = (100 - fatPct) / otherTotal;
          proteinPct = Math.round(proteinPct * factor);
          carbsPct = 100 - proteinPct - fatPct;
        } else {
          proteinPct = (100 - fatPct) / 2;
          carbsPct = (100 - fatPct) / 2;
        }
      } else {
        // Adjust protein and fat proportionally
        const otherTotal = proteinPct + fatPct;
        if (otherTotal > 0) {
          const factor = (100 - carbsPct) / otherTotal;
          proteinPct = Math.round(proteinPct * factor);
          fatPct = 100 - proteinPct - carbsPct;
        } else {
          proteinPct = (100 - carbsPct) / 2;
          fatPct = (100 - carbsPct) / 2;
        }
      }
    }
    
    // Calculate actual grams based on percentages and total calories
    const proteinGrams = Math.round((menuData.base_daily_total_calories * (proteinPct / 100)) / 4);
    const fatGrams = Math.round((menuData.base_daily_total_calories * (fatPct / 100)) / 9);
    const carbsGrams = Math.round((menuData.base_daily_total_calories * (carbsPct / 100)) / 4);
    
    onUpdateMenuData({
      ...menuData,
      macroPercentages: {
        protein: proteinPct,
        fat: fatPct,
        carbs: carbsPct
      },
      macros: {
        protein: `${proteinGrams}g`,
        fat: `${fatGrams}g`,
        carbs: `${carbsGrams}g`
      }
    });
    
    // Recalculate meal distribution after macro changes
    setTimeout(recalculateMacroDistribution, 10);
  };

  // Handle changes to meal scale
  const handleScaleChange = (mealIndex, newScale) => {
    const updatedMeals = [...menuData.meals];
    updatedMeals[mealIndex] = {
      ...updatedMeals[mealIndex],
      importanceScale: newScale
    };
    
    onUpdateMenuData({
      ...menuData,
      meals: updatedMeals
    });
    
    // Recalculate meal distribution after scale changes
    setTimeout(recalculateMacroDistribution, 10);
  };

  // Handle time window changes
  const handleTimeChange = (mealIndex, type, value) => {
    const updatedMeals = [...menuData.meals];
    if (!updatedMeals[mealIndex].timeWindow) {
      updatedMeals[mealIndex].timeWindow = { start: '00:00', end: '23:59' };
    }
    
    updatedMeals[mealIndex].timeWindow[type] = value;
    
    onUpdateMenuData({
      ...menuData,
      meals: updatedMeals
    });
  };

  // Add default meal
  const handleAddDefaultMeal = () => {
    if (!mealName.trim()) return;
    
    const newMeal = {
      mealName: mealName.trim(),
      mealCalories: 0,
      mealProtein: '0g',
      mealFat: '0g',
      mealCarbs: '0g',
      importanceScale: 15, // Default importance
      items: []
    };
    
    onAddMeal(newMeal);
    setMealName('');
    
    // Recalculate distribution after adding meal
    setTimeout(recalculateMacroDistribution, 10);
  };

  // Initialize macro percentages if not already set
  React.useEffect(() => {
    if (!menuData.macroPercentages) {
      const protein = 30; // 30%
      const fat = 30; // 30%
      const carbs = 40; // 40%
      
      onUpdateMenuData({
        ...menuData,
        macroPercentages: {
          protein,
          fat,
          carbs
        }
      });
    }
  }, []);

  // Recalculate when scales change
  React.useEffect(() => {
    if (!locked) {
      recalculateMacroDistribution();
    }
  }, [totalScale, locked]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meal Plan Targets</CardTitle>
        <CardDescription>Set calorie and macro targets for this meal plan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Calorie Target */}
        <div className="space-y-2">
          <Label htmlFor="dailyCalories">Daily Calories</Label>
          <Input
            id="dailyCalories"
            type="number"
            value={menuData.base_daily_total_calories}
            onChange={(e) => {
              onUpdateMenuData({
                ...menuData,
                base_daily_total_calories: parseInt(e.target.value) || 0
              });
              // Recalculate macros based on percentages when calories change
              if (menuData.macroPercentages) {
                const proteinGrams = Math.round(((parseInt(e.target.value) || 0) * menuData.macroPercentages.protein) / 400);
                const fatGrams = Math.round(((parseInt(e.target.value) || 0) * menuData.macroPercentages.fat) / 900);
                const carbsGrams = Math.round(((parseInt(e.target.value) || 0) * menuData.macroPercentages.carbs) / 400);
                
                onUpdateMenuData(prev => ({
                  ...prev,
                  macros: {
                    protein: `${proteinGrams}g`,
                    fat: `${fatGrams}g`,
                    carbs: `${carbsGrams}g`
                  }
                }));
                
                setTimeout(recalculateMacroDistribution, 10);
              }
            }}
            disabled={locked}
          />
        </div>

        {/* Macro Distribution Sliders */}
        <div className="space-y-4">
          <Label>Macro Distribution</Label>
          
          {/* Protein Slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Protein</span>
              <span className="text-sm font-medium">{menuData.macroPercentages?.protein || 30}% ({menuData.macros?.protein})</span>
            </div>
            <Slider
              min={10}
              max={60}
              step={5}
              value={[menuData.macroPercentages?.protein || 30]}
              onValueChange={(values) => handleMacroDistributionChange('protein', values[0])}
              disabled={locked}
              className="py-1"
            />
          </div>
          
          {/* Fat Slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Fat</span>
              <span className="text-sm font-medium">{menuData.macroPercentages?.fat || 30}% ({menuData.macros?.fat})</span>
            </div>
            <Slider
              min={10}
              max={60}
              step={5}
              value={[menuData.macroPercentages?.fat || 30]}
              onValueChange={(values) => handleMacroDistributionChange('fat', values[0])}
              disabled={locked}
              className="py-1"
            />
          </div>
          
          {/* Carbs Slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Carbs</span>
              <span className="text-sm font-medium">{menuData.macroPercentages?.carbs || 40}% ({menuData.macros?.carbs})</span>
            </div>
            <Slider
              min={10}
              max={70}
              step={5}
              value={[menuData.macroPercentages?.carbs || 40]}
              onValueChange={(values) => handleMacroDistributionChange('carbs', values[0])}
              disabled={locked}
              className="py-1"
            />
          </div>
        </div>

        <div className="border-t pt-4 mt-4">
          <div className="flex justify-between mb-4">
            <Label>Meal Distribution</Label>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => recalculateMacroDistribution()}
              disabled={locked}
            >
              Recalculate
            </Button>
          </div>
          
          {menuData.meals.map((meal, index) => (
            <div key={index} className="border p-4 rounded-lg mb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <div className="font-medium">{meal.mealName}</div>
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={meal.timeWindow?.start || "00:00"}
                    onChange={(e) => handleTimeChange(index, 'start', e.target.value)}
                    className="w-24"
                    disabled={locked}
                  />
                  <span className="self-center">to</span>
                  <Input
                    type="time"
                    value={meal.timeWindow?.end || "23:59"}
                    onChange={(e) => handleTimeChange(index, 'end', e.target.value)}
                    className="w-24"
                    disabled={locked}
                  />
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => onRemoveMeal(index)}
                    disabled={menuData.meals.length <= 1 || locked}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row gap-4 mb-3">
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Importance</span>
                    <span className="text-sm font-medium">{meal.importanceScale}/100</span>
                  </div>
                  <Slider
                    min={5}
                    max={100}
                    step={5}
                    value={[meal.importanceScale || 0]}
                    onValueChange={(values) => handleScaleChange(index, values[0])}
                    disabled={locked}
                    className="py-1"
                  />
                </div>
              </div>
              
              <div className="text-sm text-gray-500 mt-2">
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span>Calories:</span>
                    <span className="font-medium ml-1">{meal.mealCalories || 0}</span>
                  </div>
                  <div>
                    <span>Protein:</span>
                    <span className="font-medium ml-1">{meal.mealProtein || '0g'}</span>
                  </div>
                  <div>
                    <span>Fat:</span>
                    <span className="font-medium ml-1">{meal.mealFat || '0g'}</span>
                  </div>
                  <div>
                    <span>Carbs:</span>
                    <span className="font-medium ml-1">{meal.mealCarbs || '0g'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          <div className="flex gap-4 mt-4">
            <Input
              placeholder="New Meal Name"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              disabled={locked}
            />
            <Button 
              variant="outline" 
              onClick={handleAddDefaultMeal}
              disabled={!mealName.trim() || locked}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Meal
            </Button>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <Button 
            onClick={() => {
              setLocked(true);
              onGenerate();
            }}
            className="bg-green-600 hover:bg-green-700"
            disabled={isGenerating || locked}
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-opacity-50 border-t-white mr-2" />
                Generating...
              </>
            ) : (
              <>Generate Menu</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}