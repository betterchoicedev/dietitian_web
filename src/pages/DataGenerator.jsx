
import React, { useState, useEffect } from 'react';
import { User } from '@/api/entities';
import { Client } from '@/api/entities';
import { Menu } from '@/api/entities';
import { Chat } from '@/api/entities';
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
  Database,
  Users,
  FileText,
  MessageSquare,
  Check,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function DataGenerator() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [user, setUser] = useState(null);
  const [generated, setGenerated] = useState({
    users: false,
    clients: false,
    menus: false,
    chats: false
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await User.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const updateExistingUsers = async () => {
    setIsLoading(true);
    setMessage("Updating existing users...");
    
    try {
      const userData = await User.me();
      const myClients = await Client.filter({ dietitian_id: userData.id });
      
      if (myClients.length > 0 && !userData.selectedClientId) {
        await User.updateMyUserData({ selectedClientId: myClients[0].id });
        setMessage("Updated current user with selected client!");
      }
      
      setGenerated(prev => ({ ...prev, users: true }));
    } catch (error) {
      console.error("Error updating existing users:", error);
      setMessage("Error updating users. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateUserData = async () => {
    setIsLoading(true);
    setMessage("Updating user profile data...");
    
    try {
      const userProfileData = {
        specialization: "Weight Management and Sports Nutrition",
        certification: "Registered Dietitian, MS in Clinical Nutrition",
        years_of_experience: 8,
        clinic_name: "BetterChoice Nutrition Center",
        clinic_address: "123 Health Street, Suite 450, San Francisco, CA 94110",
        profile_bio: "I'm a certified nutritionist with over 8 years of experience helping clients achieve their health goals through personalized nutrition plans. My approach focuses on sustainable lifestyle changes rather than quick fixes.",
        languages: ["English", "Spanish", "French"],
        consultation_fee: 120,
        available_times: ["Monday 9-5", "Wednesday 9-5", "Friday 9-5", "Tuesday Evenings"],
        social_media: {
          linkedin: "linkedin.com/in/yourprofile",
          twitter: "@nutritionist",
          instagram: "@betterchoice.nutrition"
        }
      };
      
      await User.updateMyUserData(userProfileData);
      await updateExistingUsers();
      
      setGenerated(prev => ({ ...prev, users: true }));
      setMessage("User profile updated successfully!");
    } catch (error) {
      console.error("Error updating user data:", error);
      setMessage("Error updating user profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateClients = async () => {
    if (!user) {
      setMessage("Please wait for user data to load first");
      return;
    }

    setIsLoading(true);
    setMessage("Generating clients...");
    
    try {
      const clientsToCreate = [
        {
          code: "XPRGDY",
          user_id_number: 123456,
          full_name: "Emily Johnson",
          email: "emily.j@example.com",
          phone: "555-0101",
          height: 165,
          weight: 62,
          age: 29,
          gender: "female",
          activity_level: "moderate",
          goal: "lose",
          notes: "Wants to lose 5kg for wedding in 3 months",
          dietary_restrictions: ["dairy-free"],
          dietitian_id: user.id
        },
        {
          code: "MNKFQA",
          user_id_number: 234567,
          full_name: "James Wilson",
          email: "j.wilson@example.com",
          phone: "555-0102",
          height: 182,
          weight: 88,
          age: 35,
          gender: "male",
          activity_level: "very",
          goal: "maintain",
          notes: "Fitness enthusiast, trains 5x weekly",
          dietary_restrictions: [],
          dietitian_id: user.id
        },
        {
          code: "BCPLVZ",
          user_id_number: 345678,
          full_name: "Sophia Martinez",
          email: "s.martinez@example.com",
          phone: "555-0103",
          height: 170,
          weight: 75,
          age: 42,
          gender: "female",
          activity_level: "light",
          goal: "lose",
          notes: "Thyroid condition, needs low sodium diet",
          dietary_restrictions: ["low-sodium"],
          dietitian_id: user.id
        }
      ];
      
      for (const client of clientsToCreate) {
        await Client.create(client);
      }
      
      setGenerated(prev => ({ ...prev, clients: true }));
      setMessage("Clients generated successfully!");
    } catch (error) {
      console.error("Error generating clients:", error);
      setMessage("Error generating clients. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateMenus = async () => {
    if (!user) {
      setMessage("Please wait for user data to load first");
      return;
    }

    setIsLoading(true);
    setMessage("Generating menus...");
    
    try {
      const clients = await Client.filter({ dietitian_id: user.id });
      
      for (const client of clients) {
        const menu = {
          name: `Weekly Menu Plan for ${client.full_name}`,
          user_code: client.code,
          client_id: client.id,
          status: "published",
          total_calories: 2000,
          total_protein: 150,
          total_carbs: 200,
          total_fat: 67,
          meals: [
            {
              name: "Breakfast",
              time: "8:00 AM",
              calories: 500,
              items: [
                {
                  name: "Oatmeal with Berries",
                  quantity: "1 bowl",
                  calories: 300,
                  protein: 10,
                  carbs: 45,
                  fat: 6
                },
                {
                  name: "Greek Yogurt",
                  quantity: "1 cup",
                  calories: 200,
                  protein: 20,
                  carbs: 8,
                  fat: 4
                }
              ]
            },
            {
              name: "Lunch",
              time: "1:00 PM",
              calories: 700,
              items: [
                {
                  name: "Grilled Chicken Salad",
                  quantity: "1 large bowl",
                  calories: 450,
                  protein: 40,
                  carbs: 20,
                  fat: 22
                },
                {
                  name: "Whole Grain Bread",
                  quantity: "2 slices",
                  calories: 250,
                  protein: 8,
                  carbs: 48,
                  fat: 4
                }
              ]
            }
          ],
          notes: "Focus on protein-rich foods and complex carbohydrates. Stay hydrated throughout the day."
        };
        
        await Menu.create(menu);
      }
      
      setGenerated(prev => ({ ...prev, menus: true }));
      setMessage("Menus generated successfully!");
    } catch (error) {
      console.error("Error generating menus:", error);
      setMessage("Error generating menus. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateChats = async () => {
    if (!user) {
      setMessage("Please wait for user data to load first");
      return;
    }

    setIsLoading(true);
    setMessage("Generating chats...");
    
    try {
      const clients = await Client.filter({ dietitian_id: user.id });
      
      for (const client of clients) {
        const chat = {
          client_id: client.id,
          user_code: client.code,
          messages: [
            {
              role: "user",
              content: "Hi! I wanted to ask about my new meal plan."
            },
            {
              role: "assistant",
              content: "Hello! Of course, I'd be happy to help you with your meal plan. What specific questions do you have?"
            },
            {
              role: "user",
              content: "I'm finding it hard to hit my protein goals. Any suggestions?"
            },
            {
              role: "assistant",
              content: "I understand. Here are some easy ways to increase your protein intake:\n1. Add Greek yogurt to your breakfast\n2. Include lean protein like chicken or fish in your meals\n3. Keep protein-rich snacks handy\n4. Consider a post-workout protein shake\n\nWould you like me to suggest specific protein-rich recipes?"
            }
          ]
        };
        
        await Chat.create(chat);
      }
      
      setGenerated(prev => ({ ...prev, chats: true }));
      setMessage("Chats generated successfully!");
    } catch (error) {
      console.error("Error generating chats:", error);
      setMessage("Error generating chats. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Generator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate sample data for your nutrition platform
        </p>
      </div>

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Profile
            </CardTitle>
            <CardDescription>
              Generate your professional profile data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              This will create sample professional data for your user profile, including specialization, certifications, and clinic details.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={generateUserData}
              disabled={isLoading || generated.users}
            >
              {generated.users ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Generated
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Generate User Data
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Clients
            </CardTitle>
            <CardDescription>
              Generate sample client data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              This will create sample clients with various health goals and dietary requirements.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={generateClients}
              disabled={isLoading || !user || generated.clients}
            >
              {generated.clients ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Generated
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Generate Clients
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Menus
            </CardTitle>
            <CardDescription>
              Generate sample menu plans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              This will create sample menu plans for each client with detailed meal information.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={generateMenus}
              disabled={isLoading || !user || !generated.clients || generated.menus}
            >
              {generated.menus ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Generated
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Generate Menus
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Chats
            </CardTitle>
            <CardDescription>
              Generate sample chat conversations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              This will create sample chat conversations with clients including various nutrition-related queries.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={generateChats}
              disabled={isLoading || !user || !generated.clients || generated.chats}
            >
              {generated.chats ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Generated
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Generate Chats
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Update Existing Users
            </CardTitle>
            <CardDescription>
              Update existing users with selected clients
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              This will ensure all users have a selectedClientId set if they have clients.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={updateExistingUsers}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Update Users
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {Object.values(generated).some(value => value) && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="mt-4"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Page
          </Button>
        </div>
      )}
    </div>
  );
}
