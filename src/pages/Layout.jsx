import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { User } from '@/api/entities';
import { Client } from '@/api/entities';
import { 
  FileText, 
  Users, 
  MessageSquare,
  Settings,
  Menu as MenuIcon,
  X,
  ChevronDown,
  User as UserIcon,
  LogOut,
  ListChecks,
  Activity,
  ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [clients, setClients] = React.useState([]);
  const [selectedClient, setSelectedClient] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loadAttempt, setLoadAttempt] = React.useState(0);

  React.useEffect(() => {
    const loadUser = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const userData = await User.me();
        setUser(userData);
        
        // Set up initial data for the dietitian if needed
        await setupDietitian(userData);
        
        // Load clients after user data is loaded
        try {
          const clientList = await Client.filter({ dietitian_id: userData.id });
          setClients(clientList);
          
          // Handle selectedClientId
          if (!userData.selectedClientId && clientList.length > 0) {
            // If no client is selected but we have clients, select the first one
            await User.updateMyUserData({ selectedClientId: clientList[0].id });
            setSelectedClient(clientList[0].id);
          } else if (userData.selectedClientId) {
            // If a client is already selected, use that
            setSelectedClient(userData.selectedClientId);
          }
        } catch (clientError) {
          console.error('Error loading clients:', clientError);
        }
        
      } catch (error) {
        console.log('User not authenticated or network error:', error);
        setError("Failed to load user data. Please try refreshing the page.");
        
        // Only redirect to login if it's an authentication error, not a network error
        if (error.message && error.message.includes('authentication')) {
          await User.login();
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    loadUser();
  }, [loadAttempt]);

  // Setup default profile data for new dietitians
  const setupDietitian = async (userData) => {
    // Only set up profile if basic fields are missing
    if (!userData.specialization || !userData.clinic_name) {
      try {
        const userProfileData = {
          specialization: "Weight Management and Sports Nutrition",
          certification: "Registered Dietitian, MS in Clinical Nutrition",
          years_of_experience: 8,
          clinic_name: "BetterChoice Nutrition Center",
          clinic_address: "123 Health Street, Suite 450, San Francisco, CA 94110",
          profile_bio: "I'm a certified nutritionist with over 8 years of experience helping clients achieve their health goals through personalized nutrition plans. My approach focuses on sustainable lifestyle changes rather than quick fixes.",
          languages: ["English", "Spanish"],
          consultation_fee: 120,
          available_times: ["Monday 9-5", "Wednesday 9-5", "Friday 9-5"]
        };
        
        await User.updateMyUserData(userProfileData);
        console.log("Created initial profile for new dietitian");
        
        // For new users, also create a default client
        const clients = await Client.filter({ dietitian_id: userData.id });
        if (clients.length === 0) {
          await createDefaultClient(userData.id);
        }
      } catch (error) {
        console.error("Error setting up dietitian profile:", error);
      }
    }
  };
  
  // Create a default client for new users
  const createDefaultClient = async (dietitianId) => {
    try {
      const defaultClient = {
        code: generateCode(),
        user_id_number: Math.floor(100000 + Math.random() * 900000),
        full_name: "Sample Client",
        email: "sample.client@example.com",
        phone: "555-0100",
        height: 170,
        weight: 70,
        age: 35,
        gender: "female",
        activity_level: "moderate",
        goal: "maintain",
        notes: "This is a sample client to help you get started.",
        dietitian_id: dietitianId
      };
      
      const client = await Client.create(defaultClient);
      console.log("Created default client for new dietitian");
      return client;
    } catch (error) {
      console.error("Error creating default client:", error);
    }
  };
  
  // Generate a random 6-letter code
  const generateCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return code;
  };

  const handleRetry = () => {
    setLoadAttempt(prev => prev + 1);
  };

  const handleClientChange = async (clientId) => {
    setSelectedClient(clientId);
    
    try {
      await User.updateMyUserData({ selectedClientId: clientId });
      navigate(createPageUrl('Dashboard'));
    } catch (error) {
      console.error('Error updating selected client:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-red-800 mb-2">Connection Error</h2>
          <p className="text-red-700 mb-4">
            {error || "Failed to connect to the server. Please check your internet connection and try again."}
          </p>
          <Button 
            onClick={handleRetry}
            className="bg-green-600 hover:bg-green-700"
          >
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  const clientNavigation = [
    { name: 'Client Dashboard', href: createPageUrl('Dashboard'), icon: Activity },
    { name: 'Client Profile', href: createPageUrl('ClientProfile'), icon: UserIcon },
    { name: 'Client Chat', href: createPageUrl('Chat'), icon: MessageSquare },
    { name: 'Client Menu', href: createPageUrl('ClientMenu'), icon: ClipboardList },
  ];

  const dietitianNavigation = [
    { name: 'All Clients', href: createPageUrl('Clients'), icon: Users },
    { name: 'All Menus', href: createPageUrl('Menus'), icon: FileText },
    { name: 'All Chats', href: createPageUrl('AllChats'), icon: MessageSquare },
    { name: 'Settings', href: createPageUrl('Settings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <style>
        {`
          :root {
            --color-primary: #378C3F;
            --color-primary-light: #50B848;
            --color-primary-dark: #2A6A31;
            --color-accent: #50B848;
          }
          
          .btn-primary {
            background-color: var(--color-primary);
          }
          
          .btn-primary:hover {
            background-color: var(--color-primary-dark);
          }
          
          .text-primary {
            color: var(--color-primary);
          }
          
          .border-primary {
            border-color: var(--color-primary);
          }
          
          .bg-primary {
            background-color: var(--color-primary);
          }
          
          .bg-primary-light {
            background-color: var(--color-primary-light);
          }
        `}
      </style>

      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-lg transform transition-transform duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between p-4 border-b">
          <Link to={createPageUrl('Dashboard')} className="flex items-center space-x-2">
            <span className="text-xl font-semibold text-primary">BetterChoice</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 border-b">
          <div className="text-sm font-medium text-gray-500 mb-2">Current Client</div>
          <Select value={selectedClient} onValueChange={handleClientChange}>
            <SelectTrigger className="w-full border-green-200">
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.full_name} ({client.code})
                </SelectItem>
              ))}
              {clients.length === 0 && (
                <SelectItem value="none" disabled>
                  No clients added yet
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {selectedClient && (
          <div className="p-4 border-b">
            <div className="text-xs font-medium uppercase text-gray-500 mb-3">Client Management</div>
            <nav className="space-y-1">
              {clientNavigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center px-4 py-2 text-sm font-medium rounded-lg",
                    currentPageName === item.name
                      ? "bg-green-50 text-green-600"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        )}

        <div className="p-4">
          <div className="text-xs font-medium uppercase text-gray-500 mb-3">General Management</div>
          <nav className="space-y-1">
            {dietitianNavigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center px-4 py-2 text-sm font-medium rounded-lg",
                  currentPageName === item.name
                    ? "bg-green-50 text-green-600"
                    : "text-gray-600 hover:bg-gray-50"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t mt-auto">
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-gray-500">Total Clients</div>
                <div className="text-xl font-bold">{clients.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-gray-500">Active Plans</div>
                <div className="text-xl font-bold">
                  <Badge variant="outline" className="bg-green-50 text-green-700">
                    {clients.length} Active
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {user && (
          <div className="p-4 border-t bg-gray-50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center space-x-3 w-full rounded-lg p-2 hover:bg-gray-100 transition-colors">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-green-600 flex items-center justify-center">
                      <span className="text-sm font-medium text-white">
                        {user.full_name?.[0]?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.full_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user.email}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate(createPageUrl('Settings'))}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="lg:pl-64">
        <div className="sticky top-0 z-10 flex h-16 flex-shrink-0 bg-white shadow-sm lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="px-4"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon className="h-6 w-6" />
          </Button>
          <div className="flex items-center ml-4">
            <span className="text-lg font-semibold text-primary">BetterChoice</span>
          </div>
        </div>

        <main className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            {!selectedClient && currentPageName !== 'All Clients' && currentPageName !== 'Settings' ? (
              <div className="max-w-3xl mx-auto mt-8 text-center">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-amber-800 mb-2">
                    No Client Selected
                  </h2>
                  <p className="text-amber-700 mb-4">
                    Please select a client from the sidebar or create a new client to continue.
                  </p>
                  <Button 
                    onClick={() => navigate(createPageUrl('Clients'))}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Manage Clients
                  </Button>
                </div>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
