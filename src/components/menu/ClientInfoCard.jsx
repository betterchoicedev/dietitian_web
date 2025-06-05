import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function ClientInfoCard({ client }) {
  const [isExpanded, setIsExpanded] = useState(true); // Start expanded
  
  if (!client) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>{client.full_name}</CardTitle>
          <CardDescription>Client Code: {client.code}</CardDescription>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-8 w-8 p-0"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Age</p>
              <p className="font-medium">{client.age || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Gender</p>
              <p className="font-medium">{client.gender ? (client.gender.charAt(0).toUpperCase() + client.gender.slice(1)) : '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Height/Weight</p>
              <p className="font-medium">{client.height ? `${client.height}cm, ${client.weight}kg` : '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Goal</p>
              <p className="font-medium">{client.goal ? (client.goal.charAt(0).toUpperCase() + client.goal.slice(1)) : '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Activity Level</p>
              <p className="font-medium">{client.activity_level ? (client.activity_level.charAt(0).toUpperCase() + client.activity_level.slice(1)) : '—'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm text-gray-500">Dietary Restrictions</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {client.dietary_restrictions?.length > 0 ? (
                  client.dietary_restrictions.map((restriction, index) => (
                    <Badge key={index} variant="outline">{restriction}</Badge>
                  ))
                ) : (
                  <span className="text-sm text-gray-400">None specified</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Food Preferences</p>
              <div className="grid grid-cols-2 gap-4 mt-1">
                <div>
                  <p className="text-xs text-gray-400">Likes</p>
                  <div className="flex flex-wrap gap-1">
                    {client.food_likes?.length > 0 ? (
                      client.food_likes.map((like, index) => (
                        <Badge key={index} variant="outline" className="bg-green-50">
                          {like}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-gray-400">None specified</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Dislikes</p>
                  <div className="flex flex-wrap gap-1">
                    {client.food_dislikes?.length > 0 ? (
                      client.food_dislikes.map((dislike, index) => (
                        <Badge key={index} variant="outline" className="bg-red-50">
                          {dislike}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-gray-400">None specified</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {client.notes && (
              <div>
                <p className="text-sm text-gray-500">Additional Notes</p>
                <p className="text-sm mt-1">{client.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}