import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MenuRecommendations({ 
  recommendations, 
  onChange, 
  calorieTarget, 
  onCalorieTargetChange,
  aiServiceError = false
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Helper to get the correct value from recommendations object or array
  const getRecommendation = (key) => {
    if (!recommendations) return '';
    
    if (Array.isArray(recommendations)) {
      const rec = recommendations.find(r => r.recommendation_key === key);
      return rec ? rec.recommendation_value : '';
    } else {
      return recommendations[key] || '';
    }
  };

  // Handle changes to the recommendations
  const handleRecommendationChange = (key, value) => {
    let updatedRecommendations;
    
    if (Array.isArray(recommendations)) {
      updatedRecommendations = [...recommendations];
      const existingIndex = updatedRecommendations.findIndex(r => r.recommendation_key === key);
      
      if (existingIndex >= 0) {
        updatedRecommendations[existingIndex] = {
          ...updatedRecommendations[existingIndex],
          recommendation_value: value
        };
      } else {
        updatedRecommendations.push({
          recommendation_key: key,
          recommendation_value: value
        });
      }
    } else {
      // If we currently have an object, convert to array format
      if (typeof recommendations === 'object' && !Array.isArray(recommendations)) {
        updatedRecommendations = Object.keys(recommendations).map(k => ({
          recommendation_key: k,
          recommendation_value: recommendations[k]
        }));
        
        const existingIndex = updatedRecommendations.findIndex(r => r.recommendation_key === key);
        if (existingIndex >= 0) {
          updatedRecommendations[existingIndex].recommendation_value = value;
        } else {
          updatedRecommendations.push({
            recommendation_key: key,
            recommendation_value: value
          });
        }
      } else {
        // Create a new array with this recommendation
        updatedRecommendations = [{
          recommendation_key: key,
          recommendation_value: value
        }];
      }
    }
    
    onChange(updatedRecommendations);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recommendations & Targets</CardTitle>
          <CardDescription>Set nutritional targets and add recommendations</CardDescription>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4">
          {aiServiceError && (
            <Alert variant="warning" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                AI service is currently unavailable. Using standard recommendations template. 
                Feel free to modify these recommendations manually.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="calorie-target">Daily Calorie Target</Label>
              <Input
                id="calorie-target"
                type="number"
                value={calorieTarget}
                onChange={(e) => onCalorieTargetChange(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div>
              <Label htmlFor="general-comments">General Comments</Label>
              <Textarea
                id="general-comments"
                placeholder="General nutrition advice and recommendations..."
                value={getRecommendation('generalComments')}
                onChange={(e) => handleRecommendationChange('generalComments', e.target.value)}
                className="mt-1 h-24"
              />
            </div>
            <div>
              <Label htmlFor="supplements">Supplements</Label>
              <Textarea
                id="supplements"
                placeholder="Recommended supplements..."
                value={getRecommendation('supplements')}
                onChange={(e) => handleRecommendationChange('supplements', e.target.value)}
                className="mt-1 h-24"
              />
            </div>
            <div>
              <Label htmlFor="hydration">Hydration</Label>
              <Textarea
                id="hydration"
                placeholder="Hydration recommendations..."
                value={getRecommendation('hydration')}
                onChange={(e) => handleRecommendationChange('hydration', e.target.value)}
                className="mt-1 h-24"
              />
            </div>
            <div>
              <Label htmlFor="sleep">Sleep</Label>
              <Textarea
                id="sleep"
                placeholder="Sleep recommendations..."
                value={getRecommendation('sleep')}
                onChange={(e) => handleRecommendationChange('sleep', e.target.value)}
                className="mt-1 h-24"
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}