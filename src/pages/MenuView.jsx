import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter 
} from '@/components/ui/card';
import { 
  ArrowLeft, 
  Download, 
  Edit, 
  Calendar,
  AlertCircle,
  Clock,
  ChevronRight,
  FileText,
  Utensils,
  GlassWater,
  Moon,
  Pill,
  MessageCircle
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

export default function MenuView() {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMenuData();
  }, []);

  const loadMenuData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const urlParams = new URLSearchParams(window.location.search);
      const menuId = urlParams.get('id');
      
      if (!menuId) {
        navigate(createPageUrl('ClientMenu'));
        return;
      }

      const menuData = await Menu.get(menuId);
      if (!menuData) {
        setError("Menu not found");
        return;
      }
      
      setMenu(menuData);

      // Load client data if available
      if (menuData.client_id) {
        const clientData = await Client.get(menuData.client_id);
        setClient(clientData);
      }
    } catch (error) {
      console.error("Error loading menu:", error);
      setError("Failed to load menu data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportMenu = () => {
    const exportData = {
      ...menu,
      clientName: client?.full_name || 'N/A',
      exportDate: new Date().toLocaleDateString()
    };

    const exportContent = `
${exportData.programName}
Generated for: ${exportData.clientName}
Date: ${exportData.exportDate}

Daily Targets:
- Total Calories: ${exportData.dailyTotalCalories} kcal
- Protein: ${exportData.macros?.protein || '0g'}
- Carbs: ${exportData.macros?.carbs || '0g'}
- Fat: ${exportData.macros?.fat || '0g'}

${exportData.meals?.map(meal => `
${meal.mealName}
Total: ${meal.mealCalories} kcal | Protein: ${meal.mealProtein} | Fat: ${meal.mealFat}

Items:
${meal.items?.map(item => `
• ${item.itemName}
  - Calories: ${item.itemCalories} kcal
  - Protein: ${item.itemProtein}
  - Fat: ${item.itemFat}
  
  Ingredients:
  ${item.ingredients?.map(ing => `  - ${ing.ingredientName} (${ing.portionUser})`).join('\n')}
`).join('\n')}
`).join('\n')}

Recommendations:
${Object.entries(exportData.recommendations || {}).map(([key, value]) => `
${key}: ${value}`).join('\n')}
    `.trim();

    const blob = new Blob([exportContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportData.programName.replace(/\s+/g, '_')}_${exportData.exportDate.replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!menu) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => navigate(createPageUrl('ClientMenu'))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{menu.programName}</h1>
            <p className="text-sm text-gray-500">Menu Code: {menu.menu_code}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportMenu}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Menu
          </Button>
          <Button 
            onClick={() => navigate(createPageUrl('MenuEdit') + `?id=${menu.id}`)}
            className="bg-green-600 hover:bg-green-700"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit Menu
          </Button>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              Menu Overview
            </CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge className={menu.status === 'active' ? 'bg-green-100 text-green-800' : 
                             menu.status === 'published' ? 'bg-blue-100 text-blue-800' : 
                             'bg-yellow-100 text-yellow-800'}>
                {menu.status?.charAt(0).toUpperCase() + menu.status?.slice(1)}
              </Badge>
              {menu.active_from && menu.active_until && (
                <Badge variant="outline">
                  {format(new Date(menu.active_from), 'MMM d')} - {format(new Date(menu.active_until), 'MMM d, yyyy')}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Total Calories</p>
                <p className="text-xl font-semibold text-green-700">{menu.dailyTotalCalories} kcal</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Protein</p>
                <p className="text-xl font-semibold text-blue-700">{menu.macros?.protein}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Carbs</p>
                <p className="text-xl font-semibold text-amber-700">{menu.macros?.carbs}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Fat</p>
                <p className="text-xl font-semibold text-purple-700">{menu.macros?.fat}</p>
              </div>
            </div>

            <div className="space-y-6">
              {menu.meals?.map((meal, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium">{meal.mealName}</h3>
                    <div className="text-sm text-gray-500">
                      {meal.mealCalories} kcal | P: {meal.mealProtein} | F: {meal.mealFat}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {meal.items?.map((item, itemIndex) => (
                      <div key={itemIndex} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{item.itemName}</h4>
                          <div className="text-sm text-gray-500">
                            {item.itemCalories} kcal | P: {item.itemProtein} | F: {item.itemFat}
                          </div>
                        </div>
                        
                        {item.ingredients && item.ingredients.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm text-gray-500 mb-1">Ingredients:</p>
                            <ul className="text-sm space-y-1">
                              {item.ingredients.map((ing, ingIndex) => (
                                <li key={ingIndex} className="flex items-center gap-2">
                                  <ChevronRight className="h-3 w-3 text-gray-400" />
                                  {ing.ingredientName} ({ing.portionUser})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {item.alternatives && item.alternatives.length > 0 && (
                          <div className="mt-3 border-t pt-2">
                            <p className="text-sm text-gray-500 mb-1">Alternatives:</p>
                            {item.alternatives.map((alt, altIndex) => (
                              <div key={altIndex} className="text-sm text-gray-600 pl-2 border-l-2 border-gray-200 mt-2">
                                {alt.itemName} ({alt.itemCalories} kcal | P: {alt.itemProtein} | F: {alt.itemFat})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-600" />
                Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {menu.recommendations && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">General Comments</span>
                    </div>
                    <p className="text-sm pl-6">{menu.recommendations.generalComments}</p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <GlassWater className="h-4 w-4" />
                      <span className="font-medium">Hydration</span>
                    </div>
                    <p className="text-sm pl-6">{menu.recommendations.hydration}</p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Moon className="h-4 w-4" />
                      <span className="font-medium">Sleep</span>
                    </div>
                    <p className="text-sm pl-6">{menu.recommendations.sleep}</p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Pill className="h-4 w-4" />
                      <span className="font-medium">Supplements</span>
                    </div>
                    <p className="text-sm pl-6">{menu.recommendations.supplements}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {client && (
            <Card>
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name</span>
                    <span className="font-medium">{client.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Code</span>
                    <span className="font-medium">{client.code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Age</span>
                    <span className="font-medium">{client.age}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Height/Weight</span>
                    <span className="font-medium">{client.height}cm / {client.weight}kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Goal</span>
                    <span className="font-medium">{client.goal}</span>
                  </div>
                  {client.dietary_restrictions && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Dietary Restrictions</span>
                      <span className="font-medium">{client.dietary_restrictions.join(', ')}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}