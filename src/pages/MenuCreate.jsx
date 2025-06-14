import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader, Save, Clock, Utensils, CalendarRange, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNavigate } from 'react-router-dom';
import { Menu } from '@/api/entities';
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";

const MenuCreate = () => {
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchMenu = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:5000/api/menu');
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      let processedMenu;
      if (typeof data === 'string') {
        try {
          processedMenu = JSON.parse(data);
        } catch (e) {
          console.error('Failed to parse string response:', e);
          throw new Error('Invalid menu data format');
        }
      } else if (data.generated_menu) {
        try {
          processedMenu = typeof data.generated_menu === 'string'
            ? JSON.parse(data.generated_menu)
            : data.generated_menu;
        } catch (e) {
          console.error('Failed to parse generated_menu:', e);
          throw new Error('Invalid generated menu format');
        }
      } else {
        processedMenu = data;
      }

      if (!processedMenu) {
        throw new Error('Invalid menu structure');
      }

      const meals = processedMenu.meal_plan || processedMenu.meals;
      if (!meals || !Array.isArray(meals)) {
        throw new Error('Invalid menu structure - missing meals array');
      }

      setMenu({
        meals,
        dailyTotals: processedMenu.daily_totals || null,
        note: processedMenu.note || ''
      });
    } catch (err) {
      console.error('Error fetching menu:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMenu = async () => {
    if (!menu) return;

    try {
      setSaving(true);
      setError(null);

      const newMenu = await Menu.create({
        programName: "Generated Menu Plan",
        status: "draft",
        meals: menu.meals || [],
        dailyTotalCalories: menu.dailyTotals?.calories || 2000,
        macros: {
          protein: menu.dailyTotals?.protein || 30,
          carbs: menu.dailyTotals?.carbs || 40,
          fat: menu.dailyTotals?.fat || 30
        }
      });

      navigate(`/MenuEdit?id=${newMenu.id}`);
    } catch (err) {
      console.error('Error saving menu:', err);
      setError(err.message || 'Failed to save menu');
    } finally {
      setSaving(false);
    }
  };

  const renderMealOption = (option, isAlternative = false) => {
    console.log("DEBUG - Ingredients for", option.name, option.ingredients);
    if (!option) return null;

    return (
      <div className={`p-4 rounded-lg ${isAlternative ? 'bg-blue-50' : 'bg-green-50'}`}>
        <div className="flex justify-between items-start mb-3">
          <h4 className="font-medium text-gray-900">{option.name}</h4>
          <div className="flex gap-2">
            <Badge variant="outline" className={`${isAlternative ? 'bg-blue-100 border-blue-200' : 'bg-green-100 border-green-200'}`}>
              {option.nutrition?.calories} kcal
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div>
            <p className="text-gray-500">Protein</p>
            <p className="font-medium">{option.nutrition?.protein}g</p>
          </div>
          <div>
            <p className="text-gray-500">Fat</p>
            <p className="font-medium">{option.nutrition?.fat}g</p>
          </div>
          <div>
            <p className="text-gray-500">Carbs</p>
            <p className="font-medium">
              {option.nutrition?.carbs !== undefined ? `${option.nutrition.carbs}g` : 'N/A'}
            </p>
          </div>
        </div>

        {option.ingredients && option.ingredients.length > 0 && (
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Ingredients:</h5>
            <ul className="space-y-1">
              {option.ingredients.map((ingredient, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2" />
                  <span className="text-gray-600">
                    {ingredient.item}: {ingredient.quantity} {ingredient.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Generated Menu Plan</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Generate a New Menu Plan</CardTitle>
          <CardDescription>
            Click the button below to generate a personalized menu plan based on your preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-6">
          <Button
            onClick={fetchMenu}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? <Loader className="animate-spin h-4 w-4 mr-2" /> : null}
            {loading ? 'Generating...' : 'Generate Menu'}
          </Button>
        </CardContent>
      </Card>

      {menu && menu.meals && menu.meals.length > 0 && (
        <>
          {menu.dailyTotals && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarRange className="h-5 w-5 text-green-600" />
                  Daily Totals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600 font-medium">Calories</p>
                    <p className="text-2xl font-bold text-green-700">
                      {menu.dailyTotals.calories}
                      <span className="text-sm font-normal text-green-600 ml-1">kcal</span>
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-600 font-medium">Protein</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {menu.dailyTotals?.protein}
                      <span className="text-sm font-normal text-blue-600 ml-1">g</span>
                    </p>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-600 font-medium">Fat</p>
                    <p className="text-2xl font-bold text-yellow-700">
                      {menu.dailyTotals?.fat}
                      <span className="text-sm font-normal text-yellow-600 ml-1">g</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {menu.meals.map((meal, index) => (
              <Card key={index} className="overflow-hidden">
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
                          <Badge variant="outline" className="bg-green-100 border-green-200">Main Option</Badge>
                        </div>
                        {renderMealOption(meal.main)}
                      </div>
                    )}

                    {meal.alternative && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Badge variant="outline" className="bg-blue-100 border-blue-200">Alternative</Badge>
                        </div>
                        {renderMealOption(meal.alternative, true)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {menu.note && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 whitespace-pre-line">{menu.note}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleSaveMenu}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? (
                <Loader className="animate-spin h-4 w-4 mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saving ? 'Saving...' : 'Save Menu'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default MenuCreate;

