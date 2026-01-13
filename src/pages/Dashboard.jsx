import React, { useState, useEffect } from 'react';
import { Menu, ChatMessage, ChatConversation, WeightLogs } from '@/api/entities';
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
  const [recentMessages, setRecentMessages] = useState([]);
  const [weightLogs, setWeightLogs] = useState([]);
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
      setRecentMessages([]);
      setWeightLogs([]);
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
      
      // Load weight logs and calculate weight change
      console.log('⚖️ Loading weight logs for user...');
      let weightChange = 0;
      let userWeightLogs = [];
      try {
        userWeightLogs = await WeightLogs.getByUserCode(selectedUserCode);
        console.log('✅ Weight logs loaded:', userWeightLogs?.length || 0, 'records');
        
        // Calculate weight change: most recent vs oldest (or first entry)
        if (userWeightLogs && userWeightLogs.length > 0) {
          // Sort by measurement_date descending (most recent first)
          const sortedLogs = [...userWeightLogs].sort((a, b) => {
            const dateA = new Date(a.measurement_date || a.created_at);
            const dateB = new Date(b.measurement_date || b.created_at);
            return dateB - dateA;
          });
          
          const mostRecent = sortedLogs[0];
          const oldest = sortedLogs[sortedLogs.length - 1];
          
          if (mostRecent.weight_kg && oldest.weight_kg) {
            weightChange = parseFloat((mostRecent.weight_kg - oldest.weight_kg).toFixed(2));
          }
          
          // Store recent weight logs (last 5)
          setWeightLogs(sortedLogs.slice(0, 5));
        } else {
          setWeightLogs([]);
        }
      } catch (weightError) {
        console.warn('⚠️ Error loading weight logs:', weightError);
        setWeightLogs([]);
      }

      setStats({
        totalMenus,
        activeMenus: activeMenus.length,
        totalChats: 0, // TODO: Implement chat tracking
        weightChange
      });

      // Get recent menus for this user
      setRecentMenus(userMenus.slice(0, 5).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

      // Load chat conversation and recent messages
      console.log('💬 Loading chat history for user...');
      try {
        const conversation = await ChatConversation.getByUserCode(selectedUserCode);
        if (conversation) {
          console.log('✅ Conversation found:', conversation.id);
          const messages = await ChatMessage.listByConversation(conversation.id, { limit: 10 });
          console.log('✅ Messages loaded:', messages?.length || 0, 'records');
          
          // Filter valid messages (same logic as in Chat.jsx)
          const validMessages = messages.filter(msg => {
            if (msg.role === 'assistant') {
              return msg.message !== null && msg.message !== undefined;
            }
            return true;
          });
          
          setRecentMessages(validMessages);
          setStats(prev => ({ ...prev, totalChats: validMessages.length }));
        } else {
          console.log('📭 No conversation found for user');
          setRecentMessages([]);
          setStats(prev => ({ ...prev, totalChats: 0 }));
        }
      } catch (chatError) {
        console.warn('⚠️ Error loading chat history:', chatError);
        setRecentMessages([]);
        setStats(prev => ({ ...prev, totalChats: 0 }));
      }

      // Activity from menus and messages
      const allActivity = [
        ...userMenus.map(m => ({ ...m, type: 'meal plan' }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 2);
      
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
      setRecentMessages([]);
      setWeightLogs([]);
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
      change: stats.totalChats > 0 ? `${stats.totalChats} messages` : 'No messages',
      changeColor: stats.totalChats > 0 ? 'text-green-600' : 'text-gray-600'
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
    <div className="space-y-6 min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 p-4">
      {/* Premium Header with Glass Morphism */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white/80 via-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-lg p-6">
        {/* Animated background elements */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5"></div>
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-indigo-400/10 to-pink-400/10 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-800 via-blue-600 to-indigo-700 bg-clip-text text-transparent leading-tight">
              {translations.welcomeToDashboard || 'Welcome to Your Dashboard'}
            </h1>
            <p className="text-lg text-slate-600 font-medium">
              {translations.overviewOfPractice || 'Overview of your nutrition practice'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl shadow-lg">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span className="text-white font-semibold text-sm">
                {translations.liveData || 'Live Data'}
              </span>
            </div>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Premium Client Profile Card */}
      {selectedClient && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 via-blue-50/50 to-indigo-50/50 backdrop-blur-2xl border border-white/20 shadow-lg">
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5"></div>
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-blue-600 bg-clip-text text-transparent">
                  {translations.clientProfile || 'Client Profile'}
                </h2>
                <p className="text-slate-600 font-medium text-sm">Premium client information</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Basic Info */}
              <div className="space-y-3 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg">
                <h4 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <User className="h-3 w-3 text-white" />
                  </div>
                  {translations.basicInformation || 'Basic Information'}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.name || 'Name'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.full_name}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.clientCode || 'Code'}:</span>
                    <span className="font-bold text-blue-600">{selectedClient.user_code}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.age || 'Age'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.age || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.gender || 'Gender'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.gender || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Physical Stats */}
              <div className="space-y-3 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg">
                <h4 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                    <Scale className="h-3 w-3 text-white" />
                  </div>
                  {translations.physicalStats || 'Physical Stats'}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.weightKg || 'Weight'}:</span>
                    <span className="font-bold text-emerald-600">{selectedClient.weight_kg || 'N/A'} kg</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.heightCm || 'Height'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.height_cm || 'N/A'} cm</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">BMI:</span>
                    <span className="font-bold text-purple-600">{
                      selectedClient.weight_kg && selectedClient.height_cm 
                        ? ((selectedClient.weight_kg / Math.pow(selectedClient.height_cm / 100, 2)).toFixed(1))
                        : 'N/A'
                    }</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.goal || 'Goal'}:</span>
                    <span className="font-bold text-red-600">{selectedClient.goal || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Nutrition Targets */}
              <div className="space-y-3 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg">
                <h4 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                    <Target className="h-3 w-3 text-white" />
                  </div>
                  {translations.nutritionTargets || 'Nutrition Targets'}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.targetCalories || 'Target Calories'}:</span>
                    <span className="font-bold text-orange-600">{selectedClient.daily_target_total_calories || 'N/A'} kcal</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.bmrCalories || 'BMR Calories'}:</span>
                    <span className="font-bold text-emerald-600">{selectedClient.base_daily_total_calories || 'N/A'} kcal</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.numberOfMeals || 'Meals'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.number_of_meals || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.activityLevel || 'Activity'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.Activity_level || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-3 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg">
                <h4 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                    <Mail className="h-3 w-3 text-white" />
                  </div>
                  {translations.contactInformation || 'Contact Info'}
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.email || 'Email'}:</span>
                    <span className="font-bold text-purple-600 truncate">{selectedClient.email || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.phoneNumber || 'Phone'}:</span>
                    <span className="font-bold text-slate-800">{selectedClient.phone_number || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white/50 rounded-lg">
                    <span className="font-semibold text-slate-700">{translations.city || 'City'}:</span>
                    <span className="font-bold text-pink-600">{selectedClient.city || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dietary Restrictions */}
            {(() => {
              // Helper functions to check if allergies/limitations have meaningful content
              const hasValidAllergies = () => {
                if (!selectedClient.food_allergies) return false;
                
                if (Array.isArray(selectedClient.food_allergies)) {
                  return selectedClient.food_allergies.length > 0 && 
                         selectedClient.food_allergies.some(allergy => allergy && allergy.trim() !== '');
                }
                
                const str = selectedClient.food_allergies.toString().trim();
                return str !== '' && str !== '[]' && str !== 'null' && str !== 'undefined';
              };
              
              const hasValidLimitations = () => {
                if (!selectedClient.food_limitations) return false;
                
                if (Array.isArray(selectedClient.food_limitations)) {
                  return selectedClient.food_limitations.length > 0 && 
                         selectedClient.food_limitations.some(limitation => limitation && limitation.trim() !== '');
                }
                
                const str = selectedClient.food_limitations.toString().trim();
                return str !== '' && str !== '[]' && str !== 'null' && str !== 'undefined';
              };
              
              return hasValidAllergies() || hasValidLimitations();
            })() && (
              <div className="mt-6 p-4 bg-gradient-to-r from-red-50/80 to-orange-50/80 backdrop-blur-sm rounded-xl border border-red-200/50 shadow-lg">
                <h4 className="font-bold text-base text-slate-800 flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center">
                    <AlertCircle className="h-3 w-3 text-white" />
                  </div>
                  {translations.dietaryRestrictions || 'Dietary Restrictions'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    // Helper function to check if allergies have meaningful content
                    const hasValidAllergies = () => {
                      if (!selectedClient.food_allergies) return false;
                      
                      // Debug logging
                      console.log('🔍 Debug food_allergies:', {
                        value: selectedClient.food_allergies,
                        type: typeof selectedClient.food_allergies,
                        isArray: Array.isArray(selectedClient.food_allergies),
                        length: Array.isArray(selectedClient.food_allergies) ? selectedClient.food_allergies.length : 'N/A'
                      });
                      
                      if (Array.isArray(selectedClient.food_allergies)) {
                        return selectedClient.food_allergies.length > 0 && 
                               selectedClient.food_allergies.some(allergy => allergy && allergy.trim() !== '');
                      }
                      
                      const str = selectedClient.food_allergies.toString().trim();
                      return str !== '' && str !== '[]' && str !== 'null' && str !== 'undefined';
                    };
                    
                    return hasValidAllergies() && (
                      <div className="px-3 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-semibold text-sm shadow-lg">
                        {translations.foodAllergies || 'Allergies'}: {Array.isArray(selectedClient.food_allergies) 
                          ? selectedClient.food_allergies.filter(a => a && a.trim() !== '').join(', ') 
                          : (typeof selectedClient.food_allergies === 'string' 
                              ? selectedClient.food_allergies.replace(/[\[\]"]/g, '').split(',').map(item => item.trim()).filter(item => item).join(', ')
                              : selectedClient.food_allergies)
                        }
                      </div>
                    );
                  })()}
                  {(() => {
                    // Helper function to check if limitations have meaningful content
                    const hasValidLimitations = () => {
                      if (!selectedClient.food_limitations) return false;
                      
                      if (Array.isArray(selectedClient.food_limitations)) {
                        return selectedClient.food_limitations.length > 0 && 
                               selectedClient.food_limitations.some(limitation => limitation && limitation.trim() !== '');
                      }
                      
                      const str = selectedClient.food_limitations.toString().trim();
                      return str !== '' && str !== '[]' && str !== 'null' && str !== 'undefined';
                    };
                    
                    return hasValidLimitations() && (
                      <div className="px-3 py-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg font-semibold text-sm shadow-lg">
                        {translations.foodLimitations || 'Limitations'}: {Array.isArray(selectedClient.food_limitations) 
                          ? selectedClient.food_limitations.filter(l => l && l.trim() !== '').join(', ') 
                          : (typeof selectedClient.food_limitations === 'string' 
                              ? selectedClient.food_limitations.replace(/[\[\]"]/g, '').split(',').map(item => item.trim()).filter(item => item).join(', ')
                              : selectedClient.food_limitations)
                        }
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* User Preferences */}
            <div className="mt-6 p-4 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 backdrop-blur-sm rounded-xl border border-indigo-200/50 shadow-lg">
              <h4 className="font-bold text-base text-slate-800 flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Settings className="h-3 w-3 text-white" />
                </div>
                {translations.userPreferences || 'User Preferences'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Macros */}
                <div className="space-y-3 p-3 bg-white/60 backdrop-blur-sm rounded-lg border border-white/20">
                  <h5 className="font-bold text-slate-800 flex items-center gap-2">
                    <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <BarChart3 className="h-2 w-2 text-white" />
                    </div>
                    {translations.macros || 'Macros'}
                  </h5>
                  <div className="space-y-1 text-sm">
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

                {/* Meal Plan Structure */}
                <div className="space-y-3 p-3 bg-white/60 backdrop-blur-sm rounded-lg border border-white/20">
                  <h5 className="font-bold text-slate-800 flex items-center gap-2">
                    <div className="w-5 h-5 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center">
                      <Utensils className="h-2 w-2 text-white" />
                    </div>
                    {translations.mealPlanStructure || 'Meal Plan Structure'}
                  </h5>
                  <div className="space-y-2 text-sm max-h-64 overflow-y-auto">
                    {(() => {
                      const mealPlanStructure = selectedClient.meal_plan_structure;
                      if (!mealPlanStructure || !Array.isArray(mealPlanStructure) || mealPlanStructure.length === 0) {
                        return (
                          <div className="p-2 bg-white/50 rounded-lg text-center">
                            <p className="text-slate-600 text-xs">{translations.noMealPlanStructure || 'No meal plan structure available'}</p>
                          </div>
                        );
                      }
                      
                      // Handle both string (JSON) and object formats
                      let meals = mealPlanStructure;
                      if (typeof mealPlanStructure === 'string') {
                        try {
                          meals = JSON.parse(mealPlanStructure);
                        } catch (e) {
                          console.error('Error parsing meal_plan_structure:', e);
                          return (
                            <div className="p-2 bg-white/50 rounded-lg text-center">
                              <p className="text-slate-600 text-xs">{translations.invalidMealPlanStructure || 'Invalid meal plan structure'}</p>
                            </div>
                          );
                        }
                      }
                      
                      return meals.map((mealItem, index) => (
                        <div key={index} className="p-2 bg-white/50 rounded-lg border border-white/30">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-bold text-slate-800 text-xs">{mealItem.meal || `Meal ${index + 1}`}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-orange-600 text-xs">{mealItem.calories || 0} {translations.kcal || 'kcal'}</span>
                              {mealItem.calories_pct && (
                                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {mealItem.calories_pct}%
                                </span>
                              )}
                            </div>
                          </div>
                          {mealItem.description && (
                            <p className="text-xs text-slate-600 leading-relaxed mt-1">{mealItem.description}</p>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Client Selected Alert */}
      {!selectedUserCode && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-50/80 to-orange-50/80 backdrop-blur-2xl border border-amber-200/50 shadow-lg p-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-amber-400/10 to-orange-400/10 rounded-full blur-3xl"></div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Client Selection Required</h3>
              <p className="text-slate-600 font-medium text-sm">
                {translations.pleaseSelectClient || 'Please select a client from the sidebar to view their dashboard.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Premium Stats Cards - Only show when client is selected */}
      {selectedUserCode && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, index) => (
            <div key={index} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-lg p-4 hover:shadow-xl transition-all duration-500 group`}>
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 ${
                    index === 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600' :
                    index === 1 ? 'bg-gradient-to-br from-yellow-500 to-orange-600' :
                    index === 2 ? 'bg-gradient-to-br from-purple-500 to-indigo-600' :
                    'bg-gradient-to-br from-blue-500 to-cyan-600'
                  }`}>
                    <stat.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className={`text-xs font-bold ${stat.changeColor} flex items-center gap-1 px-2 py-1 bg-white/60 backdrop-blur-sm rounded-lg border border-white/20`}>
                    <TrendingUp className="h-3 w-3" />
                    {stat.change}
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">{stat.value}</h3>
                  <p className="text-sm font-semibold text-slate-600">{stat.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Content Grid - Only show when client is selected */}
      {selectedUserCode && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Premium Quick Actions */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-lg">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-blue-500/5 to-purple-500/5"></div>
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-green-400/10 to-blue-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-blue-600 bg-clip-text text-transparent">
                    {translations.quickActions || 'Quick Actions'}
                  </h2>
                  <p className="text-slate-600 font-medium text-sm">{translations.commonTasks || 'Access your most common tasks quickly'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {quickActions.map((action, index) => (
                  <Link key={index} to={action.link} className={action.disabled ? 'pointer-events-none opacity-50' : 'group'}>
                    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br from-white/80 to-white/60 backdrop-blur-sm border border-white/20 shadow-lg hover:shadow-xl transition-all duration-500 group-hover:scale-105 cursor-pointer h-full`}>
                      {/* Hover effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      
                      <div className="relative z-10 p-4">
                        <div className="space-y-3">
                          <div className={`w-10 h-10 bg-gradient-to-br ${action.color.replace('text-', 'from-').replace('-600', '-500')} to-${action.color.replace('text-', '').replace('-600', '-600')} rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                            <action.icon className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h4 className="font-bold text-base text-slate-800 mb-1">{action.title}</h4>
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
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-lg">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-rose-500/5"></div>
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-purple-600 bg-clip-text text-transparent">
                    {translations.recentActivity || 'Recent Activity'}
                  </h2>
                  <p className="text-slate-600 font-medium text-sm">{translations.latestUpdates || 'Latest updates from your practice'}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {recentActivity.length > 0 ? (
                  recentActivity.slice(0, 2).map((item, index) => (
                    <div key={index} className="relative overflow-hidden rounded-xl bg-white/60 backdrop-blur-sm border border-white/20 p-3 hover:bg-white/80 transition-all duration-300 group">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 bg-gradient-to-br ${
                          item.type === 'meal plan' ? 'from-green-500 to-emerald-600' : 'from-blue-500 to-indigo-600'
                        } rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                          {item.type === 'meal plan' ? (
                            <ChefHat className="h-5 w-5 text-white" />
                          ) : (
                            <MessageSquare className="h-5 w-5 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 truncate text-sm">
                            {item.type === 'meal plan' ? item.meal_plan_name || item.name || 'Meal Plan' : 'Chat Session'}
                          </p>
                          <p className="text-xs text-slate-600">
                            {new Date(item.created_at).toLocaleDateString()} • 
                            {item.type === 'meal plan' ? ` ${item.daily_total_calories || item.total_calories || 0} cal` : ` ${item.messages?.length || 0} messages`}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 group-hover:scale-110 transition-all duration-300" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gradient-to-br from-slate-300 to-slate-400 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Activity className="h-6 w-6 text-white" />
                    </div>
                    <p className="text-slate-500 font-medium text-sm">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-50/90 to-emerald-50/80 backdrop-blur-2xl border border-green-200/50 shadow-lg">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-emerald-500/5 to-teal-500/5"></div>
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-green-400/10 to-emerald-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                  <ChefHat className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-green-600 bg-clip-text text-transparent">
                    {translations.menuoverview || 'Menu Overview'}
                  </h2>
                  <p className="text-slate-600 font-medium text-sm">{translations.recentNutritionPlans || 'Recent nutrition plans and menus'}</p>
                </div>
              </div>
              
              {recentMenus.length > 0 ? (
                <div className="space-y-3">
                  {recentMenus.slice(0, 3).map((menu, index) => (
                    <div key={index} className="relative overflow-hidden rounded-xl bg-white/60 backdrop-blur-sm border border-white/20 p-3 hover:bg-white/80 transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800 mb-1 text-sm">{menu.meal_plan_name || menu.name || 'Untitled Meal Plan'}</p>
                          <p className="text-xs text-slate-600">{menu.daily_total_calories || menu.total_calories || 0} {translations.kcal || 'kcal'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 mb-1">{new Date(menu.created_at).toLocaleDateString()}</p>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-xs font-semibold text-slate-700">{menu.status || 'Active'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-3">
                    <Link to={createPageUrl('menuload')}>
                      <Button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 text-sm">
                        {translations.viewAllMenus || 'View All Menus'}
                        <ArrowUpRight className="h-3 w-3 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-300 to-emerald-400 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <ChefHat className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-green-700 font-bold text-base mb-2">{translations.noMenusYet || 'No menus created yet'}</p>
                  <Link to={createPageUrl('MenuCreate')}>
                    <Button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 text-sm">
                      <Plus className="h-3 w-3 mr-2" />
                      {translations.createFirstMenu || 'Create Your First Menu'}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50/90 to-indigo-50/80 backdrop-blur-2xl border border-blue-200/50 shadow-lg">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5"></div>
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-blue-600 bg-clip-text text-transparent">
                    {translations.consultations || 'Consultations'}
                  </h2>
                  <p className="text-slate-600 font-medium text-sm">{translations.aiPoweredConsultations || 'AI-powered nutrition consultations'}</p>
                </div>
              </div>
              
              {recentMessages.length > 0 ? (
                <div className="space-y-3">
                  {recentMessages.slice(0, 3).map((message, index) => (
                    <div key={message.id || index} className="relative overflow-hidden rounded-xl bg-white/60 backdrop-blur-sm border border-white/20 p-3 hover:bg-white/80 transition-all duration-300">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${
                          message.role === 'user' 
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                            : 'bg-gradient-to-br from-green-500 to-emerald-600'
                        }`}>
                          {message.role === 'user' ? (
                            <User className="h-4 w-4 text-white" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-bold text-slate-800 text-sm">
                              {message.role === 'user' ? (translations.client || 'Client') : (translations.aiAssistant || 'AI Assistant')}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(message.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {(() => {
                              if (message.role === 'assistant') {
                                const messageText = message.content || message.message || '';
                                // Check if message is JSON with response_text
                                if (messageText.trim().startsWith('{')) {
                                  try {
                                    const parsedData = JSON.parse(messageText);
                                    if (parsedData.response_text) {
                                      return parsedData.response_text;
                                    }
                                  } catch (e) {
                                    // Not valid JSON, use original message text
                                    console.log('Message is not JSON, using original text');
                                  }
                                }
                                return messageText || 'Message content not available';
                              }
                              return message.content || message.message || 'Message content not available';
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-3">
                    <Link to={createPageUrl('Chat')}>
                      <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 text-sm">
                        {translations.viewFullChat || 'View Full Chat'}
                        <ArrowUpRight className="h-3 w-3 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-300 to-indigo-400 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-blue-700 font-bold text-base mb-2">{translations.noChatHistory || 'No chat history yet'}</p>
                  <Link to={createPageUrl('Chat')}>
                    <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 text-sm">
                      <MessageSquare className="h-3 w-3 mr-2" />
                      {translations.startFirstChat || 'Start Your First Chat'}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Weight Logs */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50/90 to-pink-50/80 backdrop-blur-2xl border border-purple-200/50 shadow-lg">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-rose-500/5"></div>
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Scale className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-purple-600 bg-clip-text text-transparent">
                    {translations.weightLogs || 'Weight Logs'}
                  </h2>
                  <p className="text-slate-600 font-medium text-sm">{translations.weightTrackingHistory || 'Weight tracking history'}</p>
                </div>
              </div>
              
              {weightLogs.length > 0 ? (
                <div className="space-y-3">
                  {weightLogs.slice(0, 5).map((log, index) => (
                    <div key={log.id || index} className="relative overflow-hidden rounded-xl bg-white/60 backdrop-blur-sm border border-white/20 p-3 hover:bg-white/80 transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-slate-800 text-sm">
                              {log.weight_kg ? `${log.weight_kg} kg` : 'N/A'}
                            </span>
                            {log.body_fat_percentage && (
                              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {log.body_fat_percentage}% BF
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600">
                            {log.measurement_date 
                              ? new Date(log.measurement_date).toLocaleDateString() 
                              : (log.created_at ? new Date(log.created_at).toLocaleDateString() : 'N/A')}
                          </p>
                          {log.waist_circumference_cm && (
                            <p className="text-xs text-slate-500 mt-1">
                              Waist: {log.waist_circumference_cm} cm
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          {log.measurement_method && (
                            <Badge variant="outline" className="text-xs">
                              {log.measurement_method}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-3">
                    <Link to={createPageUrl('weight-logs')}>
                      <Button className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 text-sm">
                        {translations.viewAllWeightLogs || 'View All Weight Logs'}
                        <ArrowUpRight className="h-3 w-3 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-300 to-pink-400 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Scale className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-purple-700 font-bold text-base mb-2">{translations.noWeightLogs || 'No weight logs yet'}</p>
                  <Link to={createPageUrl('weight-logs')}>
                    <Button className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 text-sm">
                      <Plus className="h-3 w-3 mr-2" />
                      {translations.addFirstWeightLog || 'Add Your First Weight Log'}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}