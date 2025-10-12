
import React from 'react';
import MealItem from './MealItem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function MealList({ menu }) {
  // Transform recommendations array to object for easier display
  const recommendationsObj = menu.recommendations?.reduce((acc, rec) => {
    acc[rec.recommendation_key] = rec.recommendation_value;
    return acc;
  }, {}) || {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{menu.programName}</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Daily Calories: {menu.base_daily_total_calories} kcal
              </p>
            </div>
            <Badge 
              variant="outline" 
              className={
                menu.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
                menu.status === 'published' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                'bg-gray-100 text-gray-800 border-gray-200'
              }
            >
              {menu.status.charAt(0).toUpperCase() + menu.status.slice(1)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-500">Protein</p>
              <p className="text-xl font-semibold">{menu.macros?.protein}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Carbs</p>
              <p className="text-xl font-semibold">{menu.macros?.carbs}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Fat</p>
              <p className="text-xl font-semibold">{menu.macros?.fat}</p>
            </div>
          </div>

          {Object.keys(recommendationsObj).length > 0 && (
            <div className="space-y-2 mb-6">
              <h3 className="font-medium">Recommendations</h3>
              <div className="grid gap-3">
                {Object.entries(recommendationsObj).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm font-medium capitalize mb-1">{key}</p>
                    <p className="text-sm text-gray-600">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {menu.meals?.map((meal) => (
              <MealItem key={meal.meal_id} meal={meal} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
