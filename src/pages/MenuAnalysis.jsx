import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { ArrowUpRight, FileText, PieChart, Activity, BarChart3, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RPieChart, Pie, Cell, Legend } from 'recharts';

export default function MenuAnalysis() {
  const [client, setClient] = useState(null);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [menus, setMenus] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dailyRequirements, setDailyRequirements] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const userData = await User.me();
      
      if (!userData.selectedClientId) {
        setError("No client selected. Please select a client first.");
        setIsLoading(false);
        return;
      }
      
      // Load client data
      const clientData = await Client.get(userData.selectedClientId);
      setClient(clientData);
      
      // Calculate daily requirements
      const requirements = calculateDailyRequirements(clientData);
      setDailyRequirements(requirements);
      
      // Load menus for this client
      const clientMenus = await Menu.filter({ client_id: clientData.id });
      setMenus(clientMenus);
      
      if (clientMenus.length > 0) {
        setSelectedMenu(clientMenus[0]);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Failed to load client data. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate approximate daily nutritional requirements
  const calculateDailyRequirements = (client) => {
    if (!client || !client.gender || !client.weight || !client.height || !client.age) {
      return null;
    }
    
    // Calculate BMR (Basal Metabolic Rate)
    let bmr = 0;
    if (client.gender === 'male') {
      bmr = 88.362 + (13.397 * client.weight) + (4.799 * client.height) - (5.677 * client.age);
    } else {
      bmr = 447.593 + (9.247 * client.weight) + (3.098 * client.height) - (4.330 * client.age);
    }
    
    // Apply activity multiplier
    let activityMultiplier = 1.2; // Sedentary as default
    switch (client.activity_level) {
      case 'sedentary': activityMultiplier = 1.2; break;
      case 'light': activityMultiplier = 1.375; break;
      case 'moderate': activityMultiplier = 1.55; break;
      case 'very': activityMultiplier = 1.725; break;
      case 'extra': activityMultiplier = 1.9; break;
    }
    
    // Calculate TDEE (Total Daily Energy Expenditure)
    let tdee = bmr * activityMultiplier;
    
    // Adjust for goal
    switch (client.goal) {
      case 'lose': tdee -= 500; break;
      case 'gain': tdee += 500; break;
    }
    
    // Calculate macros
    // Standard distribution: 40% carbs, 30% protein, 30% fat
    let proteinRatio = 0.3;
    let carbsRatio = 0.4;
    let fatRatio = 0.3;
    
    // Adjust for goal
    if (client.goal === 'gain') {
      proteinRatio = 0.35;
      carbsRatio = 0.45;
      fatRatio = 0.2;
    } else if (client.goal === 'lose') {
      proteinRatio = 0.4;
      carbsRatio = 0.3;
      fatRatio = 0.3;
    }
    
    // Calculate grams of each macro
    // Protein & carbs = 4 calories per gram, fat = 9 calories per gram
    const proteinGrams = Math.round((tdee * proteinRatio) / 4);
    const carbsGrams = Math.round((tdee * carbsRatio) / 4);
    const fatGrams = Math.round((tdee * fatRatio) / 9);
    
    return {
      calories: Math.round(tdee),
      protein: proteinGrams,
      carbs: carbsGrams,
      fat: fatGrams
    };
  };

  const getComparisonData = () => {
    if (!selectedMenu || !dailyRequirements) return [];
    
    return [
      {
        name: 'Calories',
        actual: selectedMenu.total_calories,
        recommended: dailyRequirements.calories,
        unit: 'kcal'
      },
      {
        name: 'Protein',
        actual: selectedMenu.total_protein,
        recommended: dailyRequirements.protein,
        unit: 'g'
      },
      {
        name: 'Carbs',
        actual: selectedMenu.total_carbs,
        recommended: dailyRequirements.carbs,
        unit: 'g'
      },
      {
        name: 'Fat',
        actual: selectedMenu.total_fat,
        recommended: dailyRequirements.fat,
        unit: 'g'
      }
    ];
  };

  const getMacroDistributionData = () => {
    if (!selectedMenu) return [];
    
    const totalCaloriesFromMacros = 
      (selectedMenu.total_protein * 4) + 
      (selectedMenu.total_carbs * 4) + 
      (selectedMenu.total_fat * 9);
    
    return [
      {
        name: 'Protein',
        value: Math.round((selectedMenu.total_protein * 4 / totalCaloriesFromMacros) * 100),
        calories: selectedMenu.total_protein * 4
      },
      {
        name: 'Carbs',
        value: Math.round((selectedMenu.total_carbs * 4 / totalCaloriesFromMacros) * 100),
        calories: selectedMenu.total_carbs * 4
      },
      {
        name: 'Fat',
        value: Math.round((selectedMenu.total_fat * 9 / totalCaloriesFromMacros) * 100),
        calories: selectedMenu.total_fat * 9
      }
    ];
  };

  const getMealDistributionData = () => {
    if (!selectedMenu || !selectedMenu.meals) return [];
    
    return selectedMenu.meals.map(meal => ({
      name: meal.name,
      value: meal.calories,
      percentage: Math.round((meal.calories / selectedMenu.total_calories) * 100)
    }));
  };

  const getComparisonIcon = (actual, recommended) => {
    const threshold = 0.1; // 10% variance threshold
    
    if (actual > recommended * (1 + threshold)) {
      return <ArrowUp className="text-red-500 h-5 w-5" />;
    } else if (actual < recommended * (1 - threshold)) {
      return <ArrowDown className="text-yellow-500 h-5 w-5" />;
    } else {
      return <Minus className="text-green-500 h-5 w-5" />;
    }
  };

  const getComparisonText = (actual, recommended) => {
    const threshold = 0.1; // 10% variance threshold
    const percentDiff = ((actual - recommended) / recommended) * 100;
    
    if (actual > recommended * (1 + threshold)) {
      return `${Math.round(percentDiff)}% above target`;
    } else if (actual < recommended * (1 - threshold)) {
      return `${Math.abs(Math.round(percentDiff))}% below target`;
    } else {
      return "On target";
    }
  };

  // Data visualization colors
  const COLORS = ['#4ade80', '#60a5fa', '#f97316'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-lg mx-auto mt-8">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!selectedMenu) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Meal Plan Analysis</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <FileText className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-xl font-medium mb-2">No Meal Plans Available</h3>
            <p className="text-gray-500 mb-6">
              You need to create a meal plan for this client first.
            </p>
            <Link to={createPageUrl('MenuCreate')}>
              <Button className="bg-green-600 hover:bg-green-700">
                Create Meal Plan
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meal Plan Analysis</h1>
        <p className="text-gray-500">
          Analyzing {client?.full_name}'s meal plan
        </p>
      </div>

      {menus.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Select Menu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {menus.map(menu => (
                <Button
                  key={menu.id}
                  variant={selectedMenu.id === menu.id ? "default" : "outline"}
                  onClick={() => setSelectedMenu(menu)}
                  className={selectedMenu.id === menu.id ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  {menu.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {getComparisonData().map((item, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{item.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-2xl font-bold">
                    {item.actual} <span className="text-sm font-normal">{item.unit}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Target: {item.recommended} {item.unit}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  {getComparisonIcon(item.actual, item.recommended)}
                  <p className="text-xs font-medium">
                    {getComparisonText(item.actual, item.recommended)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="macros">
        <TabsList>
          <TabsTrigger value="macros">Macro Distribution</TabsTrigger>
          <TabsTrigger value="meals">Meal Distribution</TabsTrigger>
          <TabsTrigger value="comparison">Target Comparison</TabsTrigger>
        </TabsList>
        
        <TabsContent value="macros">
          <Card>
            <CardHeader>
              <CardTitle>Macronutrient Distribution</CardTitle>
              <CardDescription>
                Breakdown of calories from protein, carbs, and fat
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RPieChart>
                    <Pie
                      data={getMacroDistributionData()}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({name, value}) => `${name}: ${value}%`}
                    >
                      {getMacroDistributionData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name, props) => [`${value}% (${props.payload.calories} kcal)`, name]}
                    />
                    <Legend />
                  </RPieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {getMacroDistributionData().map((item, index) => (
                  <div key={index} className="p-3 rounded-lg bg-gray-50">
                    <p className="text-sm font-medium" style={{ color: COLORS[index % COLORS.length] }}>
                      {item.name}
                    </p>
                    <p className="text-xl font-bold">{item.value}%</p>
                    <p className="text-sm text-gray-500">{item.calories} kcal</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="meals">
          <Card>
            <CardHeader>
              <CardTitle>Calories By Meal</CardTitle>
              <CardDescription>
                How calories are distributed across meals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getMealDistributionData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value} kcal`, 'Calories']} />
                    <Bar dataKey="value" fill="#4ade80" name="Calories" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {getMealDistributionData().map((item, index) => (
                  <div key={index} className="p-3 rounded-lg bg-gray-50 text-center">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {item.name}
                    </p>
                    <p className="text-lg font-bold">{item.value} <span className="text-sm font-normal">kcal</span></p>
                    <p className="text-xs text-gray-500">{item.percentage}% of total</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="comparison">
          <Card>
            <CardHeader>
              <CardTitle>Target vs Actual</CardTitle>
              <CardDescription>
                Comparing meal plan to nutritional targets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getComparisonData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="actual" fill="#4ade80" name="Actual" />
                    <Bar dataKey="recommended" fill="#60a5fa" name="Target" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-6 space-y-4">
                <h3 className="font-medium">Analysis Summary</h3>
                <div className="space-y-2">
                  {getComparisonData().map((item, index) => {
                    const diff = item.actual - item.recommended;
                    const percentDiff = Math.round((diff / item.recommended) * 100);
                    return (
                      <div key={index} className="flex items-center justify-between p-2 border-b">
                        <span className="font-medium">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <span>{item.actual} vs {item.recommended} {item.unit}</span>
                          <span className={`text-sm font-medium ${
                            Math.abs(percentDiff) < 10 
                              ? "text-green-600" 
                              : (percentDiff > 0 ? "text-red-600" : "text-yellow-600")
                          }`}>
                            {percentDiff > 0 ? '+' : ''}{percentDiff}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Link to={createPageUrl('MenuEdit') + `?id=${selectedMenu.id}`}>
                <Button>
                  Edit Menu
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}