import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
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
  Globe,
  Scale,
  User,
  Badge,
  Search,
  Apple,
  LayoutDashboard
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
import { Badge as BadgeComponent } from "@/components/ui/badge";
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LanguageToggle } from '@/components/ui/language-toggle';
import { EventBus } from '@/utils/EventBus';
import { Input } from '@/components/ui/input';
import SystemMessageModal from '@/components/SystemMessageModal';
import { useSystemMessages } from '@/hooks/useSystemMessages';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { language, translations, toggleLanguage } = useLanguage();
  const { clients, selectedUserCode, selectClient, isLoading: clientsLoading } = useClient();
  const { unreadCount, refreshCount } = useSystemMessages();
  
  // Debug: log unread count changes
  useEffect(() => {
    console.log('Unread count changed:', unreadCount);
  }, [unreadCount]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [hasOpenDialog, setHasOpenDialog] = useState(false);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [isClientSelectOpen, setIsClientSelectOpen] = useState(false);
  const dataLoadedRef = useRef(false);

  // Debug sidebar state changes
  useEffect(() => {
    console.log('Sidebar state changed to:', sidebarOpen, 'isMobile:', isMobile, 'language:', language);
  }, [sidebarOpen, isMobile, language]);
  
  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check if any dialog is open and close sidebar if needed
  useEffect(() => {
    const checkForDialogs = () => {
      const dialogs = document.querySelectorAll('[role="dialog"], .dialog, [data-state="open"]');
      const hasOpenDialog = Array.from(dialogs).some(dialog => {
        const rect = dialog.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      
      setHasOpenDialog(hasOpenDialog);
      
      if (hasOpenDialog && sidebarOpen) {
        console.log('Dialog detected, closing sidebar');
        setSidebarOpen(false);
      }
    };

    // Check immediately
    checkForDialogs();
    
    // Set up observer to watch for dialog changes
    const observer = new MutationObserver(checkForDialogs);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-state']
    });

    return () => observer.disconnect();
  }, [sidebarOpen]);

  // Add visibility change listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      console.log('Visibility changed:', document.visibilityState);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Listen for system messages updates
  useEffect(() => {
    const handleSystemMessagesUpdate = () => {
      refreshCount();
    };

    EventBus.on('systemMessagesUpdated', handleSystemMessagesUpdate);
    return () => {
      EventBus.off('systemMessagesUpdated', handleSystemMessagesUpdate);
    };
  }, [refreshCount]);

  useEffect(() => {
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

  const handleClientChange = (userCode) => {
    selectClient(userCode);
    setIsClientSelectOpen(false);
    setClientSearchTerm(''); // Clear search when client is selected
    // Close sidebar on mobile when client is selected
    if (isMobile) {
      setSidebarOpen(false);
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

  // Filter clients based on search term (search both name and user_code)
  const filteredClients = clients.filter(client => {
    const searchTerm = clientSearchTerm.toLowerCase();
    const name = client.full_name?.toLowerCase() || '';
    const userCode = client.user_code?.toLowerCase() || '';
    return name.includes(searchTerm) || userCode.includes(searchTerm);
  });

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* System Message Modal */}
      <SystemMessageModal />
      
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="flex h-16 items-center px-2 md:px-6 gap-1 md:gap-4">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            className="md:hidden hover:bg-primary/10 flex-shrink-0"
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
          <div className="hidden md:flex items-center mr-6 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img src="/images/logos/logo-placeholder.png" alt="BetterChoice Logo" className="w-10 h-10 drop-shadow-md" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-bold text-gradient-primary">BetterChoice</h1>
                <p className="text-xs text-muted-foreground/60">{translations.professionalNutrition || 'Professional Nutrition'}</p>
              </div>
            </div>
          </div>

          {/* Mobile Logo */}
          <div className="md:hidden flex items-center mr-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative">
                <img src="/images/logos/logo-placeholder.png" alt="BetterChoice Logo" className="w-8 h-8 drop-shadow-md" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
              </div>
              <h1 className="text-base font-bold text-gradient-primary">BetterChoice</h1>
            </div>
          </div>
          
          {/* Client Selection */}
          <div className="flex-1 flex justify-center min-w-0">
            {clients.length > 0 && (
              <Select 
                value={selectedUserCode || ''} 
                onValueChange={handleClientChange}
                open={isClientSelectOpen}
                onOpenChange={setIsClientSelectOpen}
              >
                <SelectTrigger className="w-full max-w-[150px] sm:max-w-[200px] md:max-w-[280px] bg-white/90 backdrop-blur-sm border border-border/60 shadow-sm hover:border-primary/40 transition-all duration-300 text-xs sm:text-sm md:text-base h-9 sm:h-10 md:h-11 px-3 md:px-4 rounded-lg">
                  <SelectValue placeholder={translations.selectClient || 'Select Client'} />
                </SelectTrigger>
                <SelectContent className="bg-white/95 backdrop-blur-xl border-border/60 shadow-lg rounded-lg w-[280px] max-w-[90vw]">
                  {/* Search Input */}
                  <div className="p-3 border-b border-border/30">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or code..."
                        value={clientSearchTerm}
                        onChange={(e) => setClientSearchTerm(e.target.value)}
                        className="pl-10 h-9 bg-white/80 border-border/40 focus:border-primary/60"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  
                  {/* Client List */}
                  <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client) => (
                        <SelectItem 
                          key={client.user_code} 
                          value={client.user_code} 
                          className="hover:bg-primary/5 rounded-md mx-2 mb-1"
                        >
                          <div className="flex items-center gap-3 w-full min-w-0">
                            <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="h-3 w-3 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="font-medium text-gray-800 truncate">
                                {client.full_name || 'No Name'}
                              </div>
                              <div className="text-xs text-gray-500 truncate">
                                {translations.clientCode}: {client.user_code}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        {clientSearchTerm ? 'No clients found matching your search.' : 'No clients available.'}
                      </div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Right side - Language toggle and user menu */}
          <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
            <LanguageToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 md:h-10 md:w-10 rounded-full hover:bg-primary/10 transition-all duration-300">
                  <Avatar className="h-7 w-7 md:h-9 md:w-9 shadow-sm ring-2 ring-primary/10">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary-lighter text-white font-semibold text-xs md:text-sm">
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
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center w-full">
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>{translations.profile || 'Profile'}</span>
                  </Link>
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
          'translate-x-0': (sidebarOpen || !isMobile) && !hasOpenDialog, // Show on desktop or when open on mobile, but not when dialog is open
          '-translate-x-full': (!sidebarOpen && isMobile && language === 'en') || (hasOpenDialog && language === 'en'), // Hide on mobile when closed (LTR) or when dialog is open (LTR)
          'translate-x-full': (!sidebarOpen && isMobile && language === 'he') || (hasOpenDialog && language === 'he'), // Hide on mobile when closed (RTL) or when dialog is open (RTL)
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
              <img src="/images/logos/logo-placeholder.png" alt="BetterChoice Logo" className="w-8 h-8 drop-shadow-sm" />
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-gradient-primary">BetterChoice</h1>
              <p className="text-xs text-muted-foreground/60">{translations.professionalPlatform || 'Professional Platform'}</p>
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

        <nav className="space-y-6 p-4 pb-8 md:pb-4">
          {/* Client Management Group */}
          <div className="space-y-1">
            <div className="px-3 mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {translations.clientManagement || 'Client Management'}
              </h3>
            </div>
            <Link to="/dietitian-profile" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group relative">
                <LayoutDashboard className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.dietitianDashboard || 'Dietitian Dashboard'}</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-md animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to={createPageUrl('Users')} onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
                <Users className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.users}</span>
              </Button>
            </Link>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/30"></div>
            </div>
          </div>

          {/* Client Tools Group */}
          <div className="space-y-1">
            <div className="px-3 mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {translations.clientTools || 'Client Tools'}
              </h3>
            </div>
            <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
                <Activity className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.home}</span>
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
            <Link to="/weight-logs" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-purple/8 hover:text-purple transition-all duration-300 group">
                <Scale className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.weightLogs || 'Weight & Body Fat Logs'}</span>
              </Button>
            </Link>
            <Link to="/nutrition-analytics" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-emerald/8 hover:text-emerald transition-all duration-300 group">
                <Apple className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.nutritionAnalytics || 'Nutrition Analytics'}</span>
              </Button>
            </Link>
            <Link to="/menuload" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-info/8 hover:text-info transition-all duration-300 group">
                <FileText className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.menuload}</span>
              </Button>
            </Link>
          </div>
        </nav>
        
        {/* Sidebar Footer */}
        <div className="absolute bottom-4 left-4 right-4 hidden md:block">
          <div className="bg-gradient-to-r from-primary/10 to-success/10 rounded-xl p-4 border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse-glow"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground/80">{translations.systemStatus || 'System Status'}</p>
                <p className="text-xs text-muted-foreground/60">{translations.allSystemsOperational || 'All systems operational'}</p>
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
