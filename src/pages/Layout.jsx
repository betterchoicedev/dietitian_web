import React, { useState } from 'react';
import { Link, useNavigate, Outlet } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
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
  ClipboardList,
  Globe
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

export default function Layout() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { language, toggleLanguage, translations } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);

  React.useEffect(() => {
    const loadUserData = async () => {
      if (!user) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Get or create user profile
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError) {
          if (profileError.code === 'PGRST116') {
            // Profile doesn't exist, create it
            const defaultProfile = {
              id: user.id,
              email: user.email,
              specialization: "Weight Management and Sports Nutrition",
              certification: "Registered Dietitian, MS in Clinical Nutrition",
              years_of_experience: 8,
              clinic_name: "BetterChoice Nutrition Center",
              clinic_address: "123 Health Street, Suite 450, San Francisco, CA 94110",
              profile_bio: "I'm a certified nutritionist with over 8 years of experience helping clients achieve their health goals through personalized nutrition plans.",
              languages: ["English"],
              consultation_fee: 120,
              available_times: ["Monday 9-5", "Wednesday 9-5", "Friday 9-5"]
            };

            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert([defaultProfile])
              .select()
              .single();

            if (createError) throw createError;
            profile = newProfile;
          } else {
            throw profileError;
          }
        }

        setUserData(profile);

        // Get clients
        const { data: clientList, error: clientsError } = await supabase
          .from('clients')
          .select('*')
          .eq('dietitian_id', user.id);

        if (clientsError) throw clientsError;

        setClients(clientList || []);

        // Handle selected client
        if (profile.selected_client_id) {
          setSelectedClient(profile.selected_client_id);
        } else if (clientList && clientList.length > 0) {
          const { data: updateData, error: updateError } = await supabase
            .from('profiles')
            .update({ selected_client_id: clientList[0].id })
            .eq('id', user.id)
            .select()
            .single();

          if (updateError) throw updateError;
          setSelectedClient(clientList[0].id);
        }

      } catch (error) {
        console.error('Error loading user data:', error);
        setError("Failed to load user data. Please try refreshing the page.");
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [user]);

  const handleClientChange = async (clientId) => {
    try {
      setSelectedClient(clientId);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ selected_client_id: clientId })
        .eq('id', user.id);

      if (updateError) throw updateError;
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
          <h2 className="text-xl font-semibold text-red-800 mb-2">{translations.connectionError}</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            {translations.retry}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="flex h-16 items-center px-4 gap-4">
          <Button
            variant="ghost"
            className="md:hidden"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon className="h-6 w-6" />
          </Button>
          
          <div className="flex-1">
            {clients.length > 0 && (
              <Select value={selectedClient} onValueChange={handleClientChange}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder={translations.selectClient} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLanguage}
            className="mr-2"
          >
            <Globe className="h-5 w-5" />
            <span className="ml-2">{translations.switchLanguage}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{userData?.email?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuItem className="flex-col items-start">
                <div className="text-sm font-medium">{userData?.email}</div>
                <div className="text-xs text-gray-500">{userData?.specialization}</div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>{translations.signOut}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out z-20",
        {
          'translate-x-0': sidebarOpen,
          '-translate-x-full': !sidebarOpen,
          'md:translate-x-0': true,
          'left-0': language === 'en',
          'right-0': language === 'he',
          'border-r': language === 'en',
          'border-l': language === 'he'
        }
      )}>
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <h1 className="text-xl font-semibold">BetterChoice</h1>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
        
        <nav className="space-y-2 p-4">
          <Link to="/">
            <Button variant="ghost" className="w-full justify-start">
              <Activity className="mr-2 h-4 w-4" />
              {translations.home}
            </Button>
          </Link>
          <Link to={createPageUrl('Users')}>
            <Button variant="ghost" className="w-full justify-start">
              <Users className="mr-2 h-4 w-4" />
              {translations.users}
            </Button>
          </Link>
          <Link to={createPageUrl('Chat')}>
            <Button variant="ghost" className="w-full justify-start">
              <MessageSquare className="mr-2 h-4 w-4" />
              {translations.chat}
            </Button>
          </Link>
          <Link to={createPageUrl('DataGenerator')}>
            <Button variant="ghost" className="w-full justify-start">
              <ListChecks className="mr-2 h-4 w-4" />
              {translations.dataGenerator}
            </Button>
          </Link>
          <Link to={createPageUrl('Nutrition-Plan')}>
            <Button variant="ghost" className="w-full justify-start">
              <ListChecks className="mr-2 h-4 w-4" />
              {translations.nutritionPlan}
            </Button>
          </Link>
        </nav>
      </div>

      {/* Main content */}
      <main className={cn(
        "min-h-[calc(100vh-4rem)] transition-all duration-200 ease-in-out",
        {
          'md:pl-64': language === 'en',
          'md:pr-64': language === 'he'
        }
      )}>
        <div className="container mx-auto p-4">
          <Outlet />
        </div>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
