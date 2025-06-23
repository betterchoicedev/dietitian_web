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
import { EventBus } from '@/utils/EventBus';

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
  const dataLoadedRef = React.useRef(false);

  // Add visibility change listener
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      console.log('Visibility changed:', document.visibilityState);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  React.useEffect(() => {
    const loadUserData = async () => {
      if (!user) return;
      
      // Don't reload if we already have the data
      if (dataLoadedRef.current) {
        return;
      }
      
      console.log('Loading user data...');
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

        console.log('Profile loaded:', profile?.id);
        setUserData(profile);

        // Get clients
        const { data: clientList, error: clientsError } = await supabase
          .from('clients')
          .select('*')
          .eq('dietitian_id', user.id);

        if (clientsError) throw clientsError;

        console.log('Clients loaded:', clientList?.length);
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

        dataLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading user data:', error);
        setError("Failed to load user data. Please try refreshing the page.");
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [user]); // Only depend on user

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

  const handleLanguageSwitch = (lang) => {
    toggleLanguage();
    if (lang === 'he') {
      EventBus.emit('translateMenu', 'he');
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
    <div className="min-h-screen bg-gradient-to-br from-green-100 via-green-200 to-green-300">
      {/* Header */}
      <header className="border-b glass shadow-md backdrop-blur-md bg-white/40">
        <div className="flex h-16 items-center px-4 gap-4">
          {/* Logo placeholder replaced with image */}
          <div className="hidden md:flex items-center mr-4">
            <img src="/nutrition-logo.png" alt="BetterChoice Logo" className="w-10 h-10" />
          </div>
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
            onClick={() => handleLanguageSwitch(language === 'en' ? 'he' : 'en')}
            className="border border-green-400 text-green-700 bg-white/80 shadow-sm hover:bg-green-50 hover:text-green-800 font-semibold px-4 py-2 rounded-lg transition"
          >
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
        "fixed inset-y-0 w-64 glass bg-white/60 border-r shadow-lg backdrop-blur-md z-20 transition-transform duration-200 ease-in-out",
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
          {/* Logo in sidebar replaced with image */}
          <div className="flex items-center gap-2">
            <img src="/nutrition-logo.png" alt="BetterChoice Logo" className="w-8 h-8" />
            <h1 className="text-xl font-semibold text-green-800">BetterChoice</h1>
          </div>
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
          <Link to={createPageUrl('MenuCreate')}>
            <Button variant="ghost" className="w-full justify-start">
              <ListChecks className="mr-2 h-4 w-4" />
              {translations.menuCreate}
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
