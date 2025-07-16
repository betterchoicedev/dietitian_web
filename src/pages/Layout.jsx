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
import { LanguageToggle } from '@/components/ui/language-toggle';
import { EventBus } from '@/utils/EventBus';

export default function Layout() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { language, toggleLanguage, translations } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  // Debug sidebar state changes
  React.useEffect(() => {
    console.log('Sidebar state changed to:', sidebarOpen, 'isMobile:', isMobile, 'language:', language);
  }, [sidebarOpen, isMobile, language]);
  
  // Check if mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
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
      // don't run twice
      if (dataLoadedRef.current) return;
  
      console.log('Loading auth user data (id & email)…');
      setIsLoading(true);
      setError(null);
  
      try {
        // Only id & email are available on the auth user
        const authData = {
          id:    user.id,
          email: user.email,
        };
  
        console.log('Auth user loaded:', authData);
        setUserData(authData);
        dataLoadedRef.current = true;
      } catch (err) {
        console.error('Error loading auth user data:', err);
        setError('Failed to load user data. Please refresh.');
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
      navigate('/dashboard');
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 bg-mesh">
      {/* Header */}
      <header className="border-b border-border/40 glass-premium shadow-premium backdrop-blur-xl bg-white/60">
        <div className="flex h-16 items-center px-4 md:px-6 gap-2 md:gap-4">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            className="md:hidden hover:bg-primary/10 mr-2"
            size="icon"
            onClick={() => {
              console.log('Open button clicked, current sidebarOpen:', sidebarOpen);
              setSidebarOpen(true);
              console.log('setSidebarOpen(true) called');
            }}
          >
            <MenuIcon className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <div className="hidden md:flex items-center mr-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img src="/logo-placeholder.png" alt="BetterChoice Logo" className="w-10 h-10 drop-shadow-md" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-bold text-gradient-primary">BetterChoice</h1>
                <p className="text-xs text-muted-foreground/60">Professional Nutrition</p>
              </div>
            </div>
          </div>

          {/* Mobile Logo */}
          <div className="md:hidden flex items-center mr-2">
            <div className="flex items-center gap-2">
              <div className="relative">
                <img src="/logo-placeholder.png" alt="BetterChoice Logo" className="w-8 h-8 drop-shadow-md" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
              </div>
              <h1 className="text-base font-bold text-gradient-primary">BetterChoice</h1>
            </div>
          </div>
          
          <div className="flex-1 flex justify-center">
            {clients.length > 0 && (
              <Select value={selectedClient} onValueChange={handleClientChange}>
                <SelectTrigger className="w-full max-w-[320px] md:w-[320px] bg-white/80 backdrop-blur-sm border-border/60 shadow-sm hover:border-primary/40 transition-all duration-300">
                  <SelectValue placeholder={translations.selectClient} />
                </SelectTrigger>
                <SelectContent className="bg-white/95 backdrop-blur-xl border-border/60">
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id} className="hover:bg-primary/5">
                      {client.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-primary/10 transition-all duration-300">
                  <Avatar className="h-9 w-9 shadow-sm ring-2 ring-primary/10">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary-lighter text-white font-semibold">
                      {userData?.email?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 bg-white/95 backdrop-blur-xl border-border/60 shadow-xl" align="end" forceMount>
                <DropdownMenuItem className="flex-col items-start p-4 hover:bg-primary/5">
                  <div className="text-sm font-semibold text-foreground">{userData?.email}</div>
                  <div className="text-xs text-muted-foreground/70">{userData?.specialization}</div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="hover:bg-destructive/5 text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{translations.signOut}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 md:hidden backdrop-blur-sm"
          onClick={() => {
            console.log('Overlay clicked, closing sidebar');
            setSidebarOpen(false);
          }}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 w-64 md:w-72 glass-premium bg-white/90 border-r border-border/40 shadow-xl backdrop-blur-2xl z-[60] transition-transform duration-300 ease-out mobile-sidebar",
        {
          'translate-x-0': sidebarOpen || !isMobile, // Show on desktop or when open on mobile
          '-translate-x-full': !sidebarOpen && isMobile && language === 'en', // Hide on mobile when closed (LTR)
          'translate-x-full': !sidebarOpen && isMobile && language === 'he', // Hide on mobile when closed (RTL)
          'left-0': language === 'en',
          'right-0': language === 'he',
          'border-r': language === 'en',
          'border-l': language === 'he'
        }
      )}>
        <div className="flex h-16 items-center justify-between px-6 border-b border-border/30">
          {/* Sidebar Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src="/logo-placeholder.png" alt="BetterChoice Logo" className="w-8 h-8 drop-shadow-sm" />
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-gradient-primary">BetterChoice</h1>
              <p className="text-xs text-muted-foreground/60">Professional Platform</p>
            </div>
          </div>
          <button
            className="md:hidden p-2 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors duration-200"
            onClick={() => {
              console.log('Close button clicked, current sidebarOpen:', sidebarOpen, 'language:', language, 'isMobile:', isMobile);
              setSidebarOpen(false);
              console.log('setSidebarOpen(false) called');
            }}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <nav className="space-y-1 p-4 pb-8 md:pb-4">
          <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
            <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
              <Activity className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
              <span className="font-medium">{translations.home}</span>
            </Button>
          </Link>
          <Link to={createPageUrl('Users')} onClick={() => setSidebarOpen(false)}>
            <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
              <Users className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
              <span className="font-medium">{translations.users}</span>
            </Button>
          </Link>
          <Link to={createPageUrl('Chat')} onClick={() => setSidebarOpen(false)}>
            <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
              <MessageSquare className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
              <span className="font-medium">{translations.chat}</span>
            </Button>
          </Link>
          <Link to={createPageUrl('MenuCreate')} onClick={() => setSidebarOpen(false)}>
            <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-success/8 hover:text-success-darker transition-all duration-300 group">
              <ListChecks className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
              <span className="font-medium">{translations.menuCreate}</span>
            </Button>
          </Link>
          <Link to="/recipes" onClick={() => setSidebarOpen(false)}>
            <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-warning/8 hover:text-warning transition-all duration-300 group">
              <FileText className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
              <span className="font-medium">{translations.recipes}</span>
            </Button>
          </Link>
          <Link to="/menuload" onClick={() => setSidebarOpen(false)}>
            <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-info/8 hover:text-info transition-all duration-300 group">
              <FileText className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
              <span className="font-medium">{translations.menuload}</span>
            </Button>
          </Link>
        </nav>
        
        {/* Sidebar Footer */}
        <div className="absolute bottom-4 left-4 right-4 hidden md:block">
          <div className="bg-gradient-to-r from-primary/10 to-success/10 rounded-xl p-4 border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse-glow"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground/80">System Status</p>
                <p className="text-xs text-muted-foreground/60">All systems operational</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className={cn(
        "min-h-[calc(100vh-4rem)] transition-all duration-300 ease-out",
        {
          'md:pl-64 xl:pl-72': language === 'en',
          'md:pr-64 xl:pr-72': language === 'he'
        }
      )}>
        {/* Mobile content overlay when sidebar is open */}
        {sidebarOpen && isMobile && (
          <div className="fixed inset-0 bg-black/20 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <div className="container mx-auto p-4 md:p-6 max-w-7xl">
          <div className="animate-slide-up">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
