
import React, { useState, useEffect } from 'react';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
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
  Edit,
  User as UserIcon,
  Phone,
  Mail,
  CalendarRange,
  Ruler,
  Weight,
  Activity as ActivityIcon,
  Target,
  AlertCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ClientProfile() {
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadClientData();
  }, []);

  const loadClientData = async () => {
    try {
      setIsLoading(true);
      const userData = await User.me();
      
      if (!userData.selectedClientId) {
        setError("No client selected. Please select a client first.");
        return;
      }

      const clientData = await Client.get(userData.selectedClientId);
      setClient(clientData);
    } catch (error) {
      console.error("Error loading client data:", error);
      setError("Failed to load client data");
    } finally {
      setIsLoading(false);
    }
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
      <Alert variant="destructive" className="max-w-2xl mx-auto mt-8">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!client) return null;

  const getGoalBadgeColor = (goal) => {
    switch (goal) {
      case 'lose':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'maintain':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'gain':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getActivityLevelText = (level) => {
    const levels = {
      sedentary: 'Sedentary',
      light: 'Light Activity',
      moderate: 'Moderate Activity',
      very: 'Very Active',
      extra: 'Extra Active'
    };
    return levels[level] || level;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Client Profile</h1>
        <Button 
          onClick={() => navigate(createPageUrl('EditClient') + `?id=${client.id}`)}
          className="bg-green-600 hover:bg-green-700"
        >
          <Edit className="w-4 h-4 mr-2" />
          Edit Profile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <UserIcon className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-2xl">{client.full_name}</CardTitle>
              <CardDescription>User Code: {client.user_code}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Information */}
          <div>
            <h3 className="font-medium mb-3">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <span>{client.email || 'No email provided'}</span>
              </div>
              <div className="flex items-center space-x-3">
                <Phone className="h-5 w-5 text-gray-400" />
                <span>{client.phone || 'No phone provided'}</span>
              </div>
            </div>
          </div>

          {/* Physical Information */}
          <div>
            <h3 className="font-medium mb-3">Physical Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center space-x-3">
                <CalendarRange className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Age</div>
                  <div>{client.age || '—'}</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Ruler className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Height</div>
                  <div>{client.height ? `${client.height} cm` : '—'}</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Weight className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Weight</div>
                  <div>{client.weight ? `${client.weight} kg` : '—'}</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <UserIcon className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Gender</div>
                  <div className="capitalize">{client.gender || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Health Information */}
          <div>
            <h3 className="font-medium mb-3">Health Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <ActivityIcon className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Activity Level</div>
                  <div>{getActivityLevelText(client.activity_level)}</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Target className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-500">Goal</div>
                  <Badge className={getGoalBadgeColor(client.goal)}>
                    {client.goal === 'lose' ? 'Weight Loss' :
                     client.goal === 'maintain' ? 'Weight Maintenance' :
                     client.goal === 'gain' ? 'Weight Gain' : '—'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Dietary Restrictions */}
          {client.dietary_restrictions && client.dietary_restrictions.length > 0 && (
            <div>
              <h3 className="font-medium mb-3">Dietary Restrictions</h3>
              <div className="flex flex-wrap gap-2">
                {client.dietary_restrictions.map((restriction, index) => (
                  <Badge key={index} variant="outline">
                    {restriction}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {client.notes && (
            <div>
              <h3 className="font-medium mb-3">Additional Notes</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
