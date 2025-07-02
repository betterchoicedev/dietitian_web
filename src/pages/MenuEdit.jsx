
import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Save } from 'lucide-react';
import { Card, CardFooter } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Import new components
import MenuHeader from '../components/menu/MenuHeader';
import MenuBasicDetails from '../components/menu/MenuBasicDetails';
import ClientInfoCard from '../components/menu/ClientInfoCard';
import MenuRecommendations from '../components/menu/MenuRecommendations';
import MealCard from '../components/menu/MealCard';
import MenuGenerator from '../components/menu/MenuGenerator';

export default function MenuEdit() {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [client, setClient] = useState(null);
  const [error, setError] = useState(null);
  const [menuData, setMenuData] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadMenuData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const urlParams = new URLSearchParams(window.location.search);
      const menuId = urlParams.get('id');
      
      if (!menuId) {
        navigate(createPageUrl('Menus'));
        return;
      }

      try {
        const menu = await Menu.get(menuId);
        if (!menu) {
          setError("Menu not found");
          return;
        }
        
        console.log("Loaded menu data:", {
          id: menu.id,
          record_type: menu.record_type,
          user_code: menu.user_code,
          meal_plan_name: menu.meal_plan_name
        });
        
        // Handle the new schema structure
        if (menu.record_type === 'schema') {
          setError("Cannot edit a schema template. Convert to meal plan first.");
          return;
        }
        
        // Extract meals from meal_plan JSON
        if (menu.meal_plan && menu.meal_plan.meals) {
          menu.meals = menu.meal_plan.meals;
        } else if (!menu.meals) {
          menu.meals = [];
        }
        
        // Normalize recommendations structure
        if (!menu.recommendations) {
          menu.recommendations = [];
        } else if (typeof menu.recommendations === 'object' && !Array.isArray(menu.recommendations)) {
          // Convert from object to array format
          menu.recommendations = Object.entries(menu.recommendations).map(([key, value]) => ({
            recommendation_key: key,
            recommendation_value: value
          }));
        }

        if (!menu.menu_code || menu.menu_code.length !== 9 || !/^\d{9}$/.test(menu.menu_code)) {
          menu.menu_code = generateMenuCode();
          try {
            await Menu.update(menuId, { 
              menu_code: menu.menu_code,
              recommendations: menu.recommendations
            });
          } catch (updateError) {
            console.error("Error updating menu code:", updateError);
          }
        }
        
        setMenuData(menu);

        // Load client data using user_code from the new schema
        if (menu.user_code) {
          try {
            const clients = await Client.filter({ user_code: menu.user_code });
            if (clients && clients.length > 0) {
              setClient(clients[0]);
            } else {
              console.warn("No client found for user_code:", menu.user_code);
            }
          } catch (clientErr) {
            console.error("Error loading client:", clientErr);
          }
        }
      } catch (menuErr) {
        console.error("Error fetching menu:", menuErr);
        setError("Failed to load menu. Please try again.");
      }
    } catch (error) {
      console.error("Error in menu loading process:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateMenuCode = () => {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
      code += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return code;
  };

  useEffect(() => {
    loadMenuData();
  }, []);

  const handleDelete = async () => {
    try {
      await Menu.delete(menuData.id);
      navigate(createPageUrl('Menus'));
    } catch (error) {
      console.error("Error deleting menu:", error);
      setError("Failed to delete menu");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updatedMenu = {...menuData};
      
      if (updatedMenu.recommendations && typeof updatedMenu.recommendations === 'object' && !Array.isArray(updatedMenu.recommendations)) {
        updatedMenu.recommendations = Object.entries(updatedMenu.recommendations).map(([key, value]) => ({
          recommendation_key: key,
          recommendation_value: value
        }));
      }
      
      // Update the meal_plan JSON with the current meals
      updatedMenu.meal_plan = {
        ...updatedMenu.meal_plan,
        meals: updatedMenu.meals,
        totals: updatedMenu.totals
      };
      
      // Ensure user_code is preserved
      if (client && client.user_code && !updatedMenu.user_code) {
        updatedMenu.user_code = client.user_code;
      }
      
      console.log("Updating menu with:", {
        id: updatedMenu.id,
        record_type: updatedMenu.record_type,
        user_code: updatedMenu.user_code,
        meal_plan_name: updatedMenu.meal_plan_name
      });
      
      const result = await Menu.update(updatedMenu.id, updatedMenu);
      console.log("Menu updated successfully:", result);
      navigate(createPageUrl('Menus'));
    } catch (error) {
      console.error("Error saving menu:", error);
      setError("Failed to save menu changes. Please ensure all fields are in the correct format.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!menuData) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Menu not found</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <MenuHeader 
          onBack={() => navigate(createPageUrl('Menus'))}
        />
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
      <MenuHeader 
        status={menuData.status}
        onStatusChange={(value) => setMenuData({...menuData, status: value})}
        onBack={() => navigate(createPageUrl('Menus'))}
        onDelete={() => setDeleteDialogOpen(true)}
      />
      
      <ClientInfoCard client={client} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <MenuBasicDetails 
          menuData={menuData}
          onUpdate={setMenuData}
        />

        <MenuRecommendations
          recommendations={menuData.recommendations}
          onChange={(newRecommendations) => {
            setMenuData(prev => ({
              ...prev,
              recommendations: newRecommendations
            }));
          }}
          calorieTarget={menuData.dailyTotalCalories}
          onCalorieTargetChange={(value) => {
            setMenuData(prev => ({
              ...prev,
              dailyTotalCalories: value
            }));
          }}
        />

        <div className="space-y-4">
          {menuData.meals?.map((meal, index) => (
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
                  // Implement single meal generation
                  console.log("Single meal generation to be implemented");
                } catch (error) {
                  setError("Failed to generate meal");
                } finally {
                  setIsGenerating(false);
                }
              }}
              isGenerating={isGenerating}
              colorScheme={index % 2 === 0 ? "green" : "blue"}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setMenuData({
              ...menuData,
              meals: [
                ...(menuData.meals || []),
                {
                  mealName: '',
                  mealCalories: 0,
                  mealProtein: '0g',
                  mealFat: '0g',
                  items: []
                }
              ]
            });
          }}
          className="w-full border-dashed border-green-200 text-green-700 hover:bg-green-50"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Meal
        </Button>

        <MenuGenerator
          client={client}
          menuData={menuData}
          onMenuGenerated={setMenuData}
          onError={setError}
          isGenerating={isGenerating}
          setIsGenerating={setIsGenerating}
        />

        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(createPageUrl('Menus'))}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-green-600 hover:bg-green-700"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this menu plan. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete Menu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
