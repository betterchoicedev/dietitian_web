import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Users,
  FileText, 
  Plus, 
  MessageSquare, 
  CalendarClock, 
  BarChart3,
  ArrowUpRight,
  TrendingUp,
  Activity,
  Clock,
  Star,
  ChefHat,
  Heart,
  Target,
  User,
  Scale,
  Ruler,
  Calendar,
  MapPin,
  Phone,
  Mail,
  AlertCircle,
  Settings,
  Coffee,
  Utensils,
  Clock3,
  Palette
} from 'lucide-react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export default function Dashboard() {
  const { translations } = useLanguage();
  const { selectedUserCode, selectedClient, isLoading: clientsLoading } = useClient();
  const [stats, setStats] = useState({
    totalMenus: 0,
    activeMenus: 0,
    totalChats: 0,
    weightChange: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [recentMenus, setRecentMenus] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (selectedUserCode) {
      loadDashboardData();
    } else {
      // Reset data when no user is selected
      setStats({
        totalMenus: 0,
        activeMenus: 0,
        totalChats: 0,
        weightChange: 0
      });
      setRecentActivity([]);
      setRecentMenus([]);
      setRecentChats([]);
    }
  }, [selectedUserCode]);

  const loadDashboardData = async () => {
    if (!selectedUserCode) return;

    try {
      setIsLoading(true);
      console.log('🔄 Starting dashboard data load for user:', selectedUserCode);
      
      // Load user-specific menus
      console.log('🍽️ Loading menus for user...');
      const allMenus = await Menu.list();
      const userMenus = allMenus.filter(menu => menu.user_code === selectedUserCode);
      console.log('✅ User menus loaded:', userMenus?.length || 0, 'records');

      // Calculate user-specific stats
      const activeMenus = userMenus.filter(menu => menu.status === 'active');
      const totalMenus = userMenus.length;
      
      // Calculate weight change (placeholder - would need weight history table)
      const weightChange = 0; // TODO: Implement weight tracking

      setStats({
        totalMenus,
        activeMenus: activeMenus.length,
        totalChats: 0, // TODO: Implement chat tracking
        weightChange
      });

      // Get recent menus for this user
      setRecentMenus(userMenus.slice(0, 5).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setRecentChats([]); // TODO: Implement chat history

      // Activity from menus
      const allActivity = [
        ...userMenus.map(m => ({ ...m, type: 'meal plan' }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
      
      setRecentActivity(allActivity);

    } catch (error) {
      console.error("❌ Error loading dashboard data:", error);
      console.error("❌ Error details:", error.message);
      // Set empty data on error to prevent crashes
      setStats({
        totalMenus: 0,
        activeMenus: 0,
        totalChats: 0,
        weightChange: 0
      });
      setRecentActivity([]);
      setRecentMenus([]);
      setRecentChats([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (clientsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  const statCards = [
    {
      title: translations.totalMenus || 'Total Menus',
      value: stats.totalMenus,
      icon: ChefHat,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      change: stats.totalMenus > 0 ? '+1' : '0',
      changeColor: 'text-green-600'
    },
    {
      title: translations.activeMenus || 'Active Menus',
      value: stats.activeMenus,
      icon: Star,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      change: stats.activeMenus > 0 ? 'Active' : 'None',
      changeColor: stats.activeMenus > 0 ? 'text-green-600' : 'text-gray-600'
    },
    {
      title: translations.chatSessions || 'Chat Sessions',
      value: stats.totalChats,
      icon: MessageSquare,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      change: '+0',
      changeColor: 'text-gray-600'
    },
    {
      title: translations.weightChange || 'Weight Change',
      value: `${stats.weightChange > 0 ? '+' : ''}${stats.weightChange}kg`,
      icon: Scale,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      change: 'This month',
      changeColor: 'text-gray-600'
    }
  ];

  const quickActions = [
    {
      title: translations.createMenu || 'Create Menu',
      description: translations.generateNutritionPlan || 'Generate a nutrition plan',
      icon: ChefHat,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      hoverColor: 'hover:bg-green-100',
      borderColor: 'border-green-200',
      link: createPageUrl('MenuCreate'),
      disabled: !selectedUserCode
    },
    {
      title: translations.startChat || 'Start Chat',
      description: translations.consultWithAI || 'Consult with AI assistant',
      icon: MessageSquare,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      hoverColor: 'hover:bg-purple-100',
      borderColor: 'border-purple-200',
      link: createPageUrl('Chat'),
      disabled: !selectedUserCode
    },
    
  ];

  return (
    <div className="space-y-8 min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      {/* Premium Header with Glass Morphism */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-white/80 via-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)] p-8">
        {/* Animated background elements */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5"></div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-indigo-400/10 to-pink-400/10 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-3">
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-slate-800 via-blue-600 to-indigo-700 bg-clip-text text-transparent leading-tight">
              {translations.welcomeToDashboard || 'Welcome to Your Dashboard'}
            </h1>
            <p className="text-xl text-slate-600 font-medium">
              {translations.overviewOfPractice || 'Overview of your nutrition practice'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl shadow-lg">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              <span className="text-white font-semibold">
                {translations.liveData || 'Live Data'}
              </span>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Premium Client Profile Card */}
      {selectedClient && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/90 via-blue-50/50 to-indigo-50/50 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5"></div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-blue-600 bg-clip-text text-transparent">
                  {translations.clientProfile || 'Client Profile'}
                </h2>
                <p className="text-slate-600 font-medium">Premium client information</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {/* Basic Info */}
              <div className="space-y-4 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg">
                <h4 className="font-bold text-lg text-slate-800 flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  {translations.basicInformation || 'Basic Information'}
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.name || 'Name'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.full_name}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.clientCode || 'Code'}:</span>
                    <span className="font-bold text-blue-600">{selectedClient.user_code}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.age || 'Age'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.age || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.gender || 'Gender'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.gender || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Physical Stats */}
              <div className="space-y-4 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg">
                <h4 className="font-bold text-lg text-slate-800 flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                    <Scale className="h-4 w-4 text-white" />
                  </div>
                  {translations.physicalStats || 'Physical Stats'}
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.weightKg || 'Weight'}:</span>
                    <span className="font-bold text-emerald-600">{selectedClient.weight_kg || 'N/A'} kg</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.heightCm || 'Height'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.height_cm || 'N/A'} cm</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">BMI:</span>
                    <span className="font-bold text-purple-600">{
                      selectedClient.weight_kg && selectedClient.height_cm 
                        ? ((selectedClient.weight_kg / Math.pow(selectedClient.height_cm / 100, 2)).toFixed(1))
                        : 'N/A'
                    }</span>
                  </div>
                </div>
              </div>

              {/* Nutrition Targets */}
              <div className="space-y-4 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg">
                <h4 className="font-bold text-lg text-slate-800 flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                    <Target className="h-4 w-4 text-white" />
                  </div>
                  {translations.nutritionTargets || 'Nutrition Targets'}
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.dailyTotalCalories || 'Daily Calories'}:</span>
                    <span className="font-bold text-orange-600">{selectedClient.dailyTotalCalories || 'N/A'} kcal</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.numberOfMeals || 'Meals'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.number_of_meals || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.goal || 'Goal'}:</span>
                    <span className="font-bold text-red-600">{selectedClient.goal || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.activityLevel || 'Activity'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.Activity_level || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-4 p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg">
                <h4 className="font-bold text-lg text-slate-800 flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                    <Mail className="h-4 w-4 text-white" />
                  </div>
                  {translations.contactInformation || 'Contact Info'}
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.email || 'Email'}:</span>
                    <span className="font-bold text-purple-600 truncate">{selectedClient.email || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.phoneNumber || 'Phone'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.phone_number || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                    <span className="font-semibold text-slate-700">{translations.city || 'City'}:</span>
                    <span className="font-bold text-pink-600">{selectedClient.city || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dietary Restrictions */}
            {(selectedClient.food_allergies || selectedClient.food_limitations) && (
              <div className="mt-8 p-6 bg-gradient-to-r from-red-50/80 to-orange-50/80 backdrop-blur-sm rounded-2xl border border-red-200/50 shadow-lg">
                <h4 className="font-bold text-lg text-slate-800 flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-white" />
                  </div>
                  {translations.dietaryRestrictions || 'Dietary Restrictions'}
                </h4>
                <div className="flex flex-wrap gap-3">
                  {selectedClient.food_allergies && (
                    <div className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold shadow-lg">
                      {translations.foodAllergies || 'Allergies'}: {Array.isArray(selectedClient.food_allergies) ? selectedClient.food_allergies.join(', ') : selectedClient.food_allergies}
                    </div>
                  )}
                  {selectedClient.food_limitations && (
                    <div className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold shadow-lg">
                      {translations.foodLimitations || 'Limitations'}: {Array.isArray(selectedClient.food_limitations) ? selectedClient.food_limitations.join(', ') : selectedClient.food_limitations}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* User Preferences */}
            <div className="mt-8 p-6 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 backdrop-blur-sm rounded-2xl border border-indigo-200/50 shadow-lg">
              <h4 className="font-bold text-lg text-slate-800 flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Settings className="h-4 w-4 text-white" />
                </div>
                {translations.userPreferences || 'User Preferences'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Macros */}
                <div className="space-y-4 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20">
                  <h5 className="font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <BarChart3 className="h-3 w-3 text-white" />
                    </div>
                    {translations.macros || 'Macros'}
                  </h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                      <span className="font-semibold text-slate-700">{translations.protein || 'Protein'}:</span>
                      <span className="font-bold text-indigo-600">{selectedClient.macros?.protein || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                      <span className="font-semibold text-slate-700">{translations.carbs || 'Carbs'}:</span>
                      <span className="font-bold text-purple-600">{selectedClient.macros?.carbs || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                      <span className="font-semibold text-slate-700">{translations.fat || 'Fat'}:</span>
                      <span className="font-bold text-slate-800">{selectedClient.macros?.fat || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                      <span className="font-semibold text-slate-700">{translations.region || 'Region'}:</span>
                      <span className="font-bold text-slate-800">{selectedClient.region || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Client Preferences */}
                <div className="space-y-4 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20">
                  <h5 className="font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-6 h-6 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
                      <Heart className="h-3 w-3 text-white" />
                    </div>
                    {translations.clientPreferences || 'Client Preferences'}
                  </h5>
                  <div className="space-y-2 text-sm">
                    <div className="p-3 bg-white/50 rounded-lg">
                      <span className="font-semibold text-slate-700">{translations.preferences || 'Preferences'}:</span>
                      <p className="font-bold text-slate-800 mt-1">{
                        selectedClient.client_preference ? 
                          (typeof selectedClient.client_preference === 'object' ? 
                            Object.entries(selectedClient.client_preference).map(([key, value]) => {
                              if (Array.isArray(value)) {
                                return value.join(', ');
                              }
                              return value;
                            }).join(', ') : 
                            selectedClient.client_preference) : 
                          'None specified'
                      }</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Client Selected Alert */}
      {!selectedUserCode && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-50/80 to-orange-50/80 backdrop-blur-2xl border border-amber-200/50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)] p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-400/10 to-orange-400/10 rounded-full blur-3xl"></div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-1">Client Selection Required</h3>
              <p className="text-slate-600 font-medium">
                {translations.pleaseSelectClient || 'Please select a client from the sidebar to view their dashboard.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Premium Stats Cards - Only show when client is selected */}
      {selectedUserCode && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <div key={index} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)] p-6 hover:shadow-[0_35px_60px_-12px_rgba(0,0,0,0.15)] transition-all duration-500 group`}>
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 ${
                    index === 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600' :
                    index === 1 ? 'bg-gradient-to-br from-yellow-500 to-orange-600' :
                    index === 2 ? 'bg-gradient-to-br from-purple-500 to-indigo-600' :
                    'bg-gradient-to-br from-blue-500 to-cyan-600'
                  }`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className={`text-sm font-bold ${stat.changeColor} flex items-center gap-2 px-3 py-1 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20`}>
                    <TrendingUp className="h-3 w-3" />
                    {stat.change}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">{stat.value}</h3>
                  <p className="text-sm font-semibold text-slate-600">{stat.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Content Grid - Only show when client is selected */}
      {selectedUserCode && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Premium Quick Actions */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-blue-500/5 to-purple-500/5"></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-green-400/10 to-blue-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl">
                  <Activity className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-blue-600 bg-clip-text text-transparent">
                    {translations.quickActions || 'Quick Actions'}
                  </h2>
                  <p className="text-slate-600 font-medium">{translations.commonTasks || 'Access your most common tasks quickly'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {quickActions.map((action, index) => (
                  <Link key={index} to={action.link} className={action.disabled ? 'pointer-events-none opacity-50' : 'group'}>
                    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/80 to-white/60 backdrop-blur-sm border border-white/20 shadow-lg hover:shadow-xl transition-all duration-500 group-hover:scale-105 cursor-pointer h-full`}>
                      {/* Hover effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      
                      <div className="relative z-10 p-6">
                        <div className="space-y-4">
                          <div className={`w-12 h-12 bg-gradient-to-br ${action.color.replace('text-', 'from-').replace('-600', '-500')} to-${action.color.replace('text-', '').replace('-600', '-600')} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                            <action.icon className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <h4 className="font-bold text-lg text-slate-800 mb-2">{action.title}</h4>
                            <p className="text-sm text-slate-600 leading-relaxed">{action.description}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Premium Recent Activity */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-rose-500/5"></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl">
                  <Clock className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-purple-600 bg-clip-text text-transparent">
                    {translations.recentActivity || 'Recent Activity'}
                  </h2>
                  <p className="text-slate-600 font-medium">{translations.latestUpdates || 'Latest updates from your practice'}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.map((item, index) => (
                    <div key={index} className="relative overflow-hidden rounded-2xl bg-white/60 backdrop-blur-sm border border-white/20 p-4 hover:bg-white/80 transition-all duration-300 group">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 bg-gradient-to-br ${
                          item.type === 'meal plan' ? 'from-green-500 to-emerald-600' : 'from-blue-500 to-indigo-600'
                        } rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                          {item.type === 'meal plan' ? (
                            <ChefHat className="h-6 w-6 text-white" />
                          ) : (
                            <MessageSquare className="h-6 w-6 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 truncate">
                            {item.type === 'meal plan' ? item.meal_plan_name || item.name || 'Meal Plan' : 'Chat Session'}
                          </p>
                          <p className="text-sm text-slate-600">
                            {new Date(item.created_at).toLocaleDateString()} • 
                            {item.type === 'meal plan' ? ` ${item.daily_total_calories || item.total_calories || 0} cal` : ` ${item.messages?.length || 0} messages`}
                          </p>
                        </div>
                        <ArrowUpRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600 group-hover:scale-110 transition-all duration-300" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gradient-to-br from-slate-300 to-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Activity className="h-8 w-8 text-white" />
                    </div>
                    <p className="text-slate-500 font-medium">
                      {translations.noRecentActivity || 'No recent activity'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Premium Summary Cards - Only show when client is selected */}
      {selectedUserCode && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-50/90 to-emerald-50/80 backdrop-blur-2xl border border-green-200/50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-emerald-500/5 to-teal-500/5"></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-green-400/10 to-emerald-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-xl">
                  <ChefHat className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-green-600 bg-clip-text text-transparent">
                    {translations.menuoverview || 'Menu Overview'}
                  </h2>
                  <p className="text-slate-600 font-medium">Recent nutrition plans and menus</p>
                </div>
              </div>
              
              {recentMenus.length > 0 ? (
                <div className="space-y-4">
                  {recentMenus.slice(0, 3).map((menu, index) => (
                    <div key={index} className="relative overflow-hidden rounded-2xl bg-white/60 backdrop-blur-sm border border-white/20 p-4 hover:bg-white/80 transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800 mb-1">{menu.meal_plan_name || menu.name || 'Untitled Meal Plan'}</p>
                          <p className="text-sm text-slate-600">{menu.daily_total_calories || menu.total_calories || 0} {translations.kcal || 'kcal'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 mb-1">{new Date(menu.created_at).toLocaleDateString()}</p>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-xs font-semibold text-slate-700">{menu.status || 'Active'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-4">
                    <Link to={createPageUrl('menuload')}>
                      <Button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                        {translations.viewAllMenus || 'View All Menus'}
                        <ArrowUpRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-300 to-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <ChefHat className="h-8 w-8 text-white" />
                  </div>
                  <p className="text-green-700 font-bold text-lg mb-2">{translations.noMenusYet || 'No menus created yet'}</p>
                  <Link to={createPageUrl('MenuCreate')}>
                    <Button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                      <Plus className="h-4 w-4 mr-2" />
                      {translations.createFirstMenu || 'Create Your First Menu'}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50/90 to-indigo-50/80 backdrop-blur-2xl border border-blue-200/50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5"></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
                  <MessageSquare className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-800 to-blue-600 bg-clip-text text-transparent">
                    {translations.consultations || 'Consultations'}
                  </h2>
                  <p className="text-slate-600 font-medium">AI-powered nutrition consultations</p>
                </div>
              </div>
              
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-300 to-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-8 w-8 text-white" />
                </div>
                <p className="text-blue-700 font-bold text-lg mb-2">{translations.noChatHistory || 'No chat history yet'}</p>
                <Link to={createPageUrl('Chat')}>
                  <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {translations.startFirstChat || 'Start Your First Chat'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}