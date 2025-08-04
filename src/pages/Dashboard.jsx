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
    {
      title: translations.editProfile || 'Edit Profile',
      description: translations.updateClientInfo || 'Update client information',
      icon: User,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      hoverColor: 'hover:bg-blue-100',
      borderColor: 'border-blue-200',
      link: createPageUrl('EditClient'),
      disabled: !selectedUserCode
    },
    {
      title: translations.recipeManagement || 'Recipe Management',
      description: translations.browseRecipes || 'Browse and manage recipes',
      icon: Heart,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      hoverColor: 'hover:bg-red-100',
      borderColor: 'border-red-200',
      link: createPageUrl('RecipesPage')
    },
    {
      title: translations.nutritionPlans || 'Nutrition Plans',
      description: translations.managePlans || 'Manage client nutrition plans',
      icon: Target,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      hoverColor: 'hover:bg-indigo-100',
      borderColor: 'border-indigo-200',
      link: createPageUrl('NutritionPlan')
    }
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
            {translations.welcomeToDashboard || 'Welcome to Your Dashboard'}
          </h1>
          <p className="text-lg text-gray-600">
            {translations.overviewOfPractice || 'Overview of your nutrition practice'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-green-700">
              {translations.liveData || 'Live Data'}
            </span>
          </div>
        </div>
      </div>

      {/* Client Profile Card - Show when client is selected */}
      {selectedClient && (
        <Card className="border-2 border-blue-200 bg-blue-50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              {translations.clientProfile || 'Client Profile'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Basic Info */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {translations.basicInformation || 'Basic Information'}
                </h4>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">{translations.name || 'Name'}:</span> {selectedClient.full_name}</p>
                  <p><span className="font-medium">{translations.clientCode || 'Code'}:</span> {selectedClient.user_code}</p>
                  <p><span className="font-medium">{translations.age || 'Age'}:</span> {selectedClient.age || 'N/A'}</p>
                  <p><span className="font-medium">{translations.gender || 'Gender'}:</span> {selectedClient.gender || 'N/A'}</p>
                </div>
              </div>

              {/* Physical Stats */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  {translations.physicalStats || 'Physical Stats'}
                </h4>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">{translations.weightKg || 'Weight'}:</span> {selectedClient.weight_kg || 'N/A'} kg</p>
                  <p><span className="font-medium">{translations.heightCm || 'Height'}:</span> {selectedClient.height_cm || 'N/A'} cm</p>
                  <p><span className="font-medium">BMI:</span> {
                    selectedClient.weight_kg && selectedClient.height_cm 
                      ? ((selectedClient.weight_kg / Math.pow(selectedClient.height_cm / 100, 2)).toFixed(1))
                      : 'N/A'
                  }</p>
                </div>
              </div>

              {/* Nutrition Targets */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  {translations.nutritionTargets || 'Nutrition Targets'}
                </h4>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">{translations.dailyTotalCalories || 'Daily Calories'}:</span> {selectedClient.dailyTotalCalories || 'N/A'} kcal</p>
                  <p><span className="font-medium">{translations.numberOfMeals || 'Meals'}:</span> {selectedClient.number_of_meals || 'N/A'}</p>
                  <p><span className="font-medium">{translations.goal || 'Goal'}:</span> {selectedClient.goal || 'N/A'}</p>
                  <p><span className="font-medium">{translations.activityLevel || 'Activity'}:</span> {selectedClient.Activity_level || 'N/A'}</p>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {translations.contactInformation || 'Contact Info'}
                </h4>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">{translations.email || 'Email'}:</span> {selectedClient.email || 'N/A'}</p>
                  <p><span className="font-medium">{translations.phoneNumber || 'Phone'}:</span> {selectedClient.phone_number || 'N/A'}</p>
                  <p><span className="font-medium">{translations.city || 'City'}:</span> {selectedClient.city || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Dietary Restrictions */}
            {(selectedClient.food_allergies || selectedClient.food_limitations) && (
              <div className="mt-6 pt-6 border-t border-blue-200">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <AlertCircle className="h-4 w-4" />
                  {translations.dietaryRestrictions || 'Dietary Restrictions'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedClient.food_allergies && (
                    <Badge variant="destructive">
                      {translations.foodAllergies || 'Allergies'}: {Array.isArray(selectedClient.food_allergies) ? selectedClient.food_allergies.join(', ') : selectedClient.food_allergies}
                    </Badge>
                  )}
                  {selectedClient.food_limitations && (
                    <Badge variant="secondary">
                      {translations.foodLimitations || 'Limitations'}: {Array.isArray(selectedClient.food_limitations) ? selectedClient.food_limitations.join(', ') : selectedClient.food_limitations}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* User Preferences */}
            <div className="mt-6 pt-6 border-t border-blue-200">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <Settings className="h-4 w-4" />
                {translations.userPreferences || 'User Preferences'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Macros */}
                <div className="space-y-2">
                  <h5 className="font-medium text-gray-800 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-600" />
                    {translations.macros || 'Macros'}
                  </h5>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">{translations.protein || 'Protein'}:</span> {selectedClient.macros?.protein || 'N/A'}</p>
                    <p><span className="font-medium">{translations.carbs || 'Carbs'}:</span> {selectedClient.macros?.carbs || 'N/A'}</p>
                    <p><span className="font-medium">{translations.fat || 'Fat'}:</span> {selectedClient.macros?.fat || 'N/A'}</p>
                    <p><span className="font-medium">{translations.region || 'Region'}:</span> {selectedClient.region || 'N/A'}</p>
                  </div>
                </div>

                {/* Client Preferences */}
                <div className="space-y-2">
                  <h5 className="font-medium text-gray-800 flex items-center gap-2">
                    <Heart className="h-4 w-4 text-pink-600" />
                    {translations.clientPreferences || 'Client Preferences'}
                  </h5>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">{translations.preferences || 'Preferences'}:</span> {
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
          </CardContent>
        </Card>
      )}

      {/* No Client Selected Alert */}
      {!selectedUserCode && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {translations.pleaseSelectClient || 'Please select a client from the sidebar to view their dashboard.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards - Only show when client is selected */}
      {selectedUserCode && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <Card key={index} className={`border-2 ${stat.borderColor} ${stat.bgColor} hover:shadow-lg transition-all duration-300`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <div className={`text-sm font-semibold ${stat.changeColor} flex items-center gap-1`}>
                    <TrendingUp className="h-3 w-3" />
                    {stat.change}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
                  <p className="text-sm text-gray-600">{stat.title}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Main Content Grid - Only show when client is selected */}
      {selectedUserCode && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Quick Actions */}
          <Card className="lg:col-span-2 border-2 border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                {translations.quickActions || 'Quick Actions'}
              </CardTitle>
              <CardDescription>
                {translations.commonTasks || 'Access your most common tasks quickly'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {quickActions.map((action, index) => (
                  <Link key={index} to={action.link} className={action.disabled ? 'pointer-events-none opacity-50' : ''}>
                    <Card className={`border-2 ${action.borderColor} ${action.bgColor} ${action.hoverColor} transition-all duration-300 hover:shadow-md cursor-pointer group`}>
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className={`p-2 rounded-lg ${action.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                            <action.icon className={`h-6 w-6 ${action.color}`} />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{action.title}</h4>
                            <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-2 border-gray-200 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                {translations.recentActivity || 'Recent Activity'}
              </CardTitle>
              <CardDescription>
                {translations.latestUpdates || 'Latest updates from your practice'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        item.type === 'meal plan' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {item.type === 'meal plan' ? (
                          <ChefHat className="h-5 w-5" />
                        ) : (
                          <MessageSquare className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.type === 'meal plan' ? item.meal_plan_name || item.name || 'Meal Plan' : 'Chat Session'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(item.created_at).toLocaleDateString()} • 
                          {item.type === 'meal plan' ? ` ${item.daily_total_calories || item.total_calories || 0} cal` : ` ${item.messages?.length || 0} messages`}
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-gray-400" />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Activity className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">
                      {translations.noRecentActivity || 'No recent activity'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary Cards - Only show when client is selected */}
      {selectedUserCode && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-2 border-green-200 bg-green-50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                  <ChefHat className="w-4 h-4 text-white" />
                </div>
                {translations.menuoverview || 'Menu Overview'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentMenus.length > 0 ? (
                <div className="space-y-3">
                  {recentMenus.slice(0, 3).map((menu, index) => (
                    <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{menu.meal_plan_name || menu.name || 'Untitled Meal Plan'}</p>
                        <p className="text-sm text-gray-500">{menu.daily_total_calories || menu.total_calories || 0} {translations.kcal || 'kcal'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{new Date(menu.created_at).toLocaleDateString()}</p>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500 fill-current" />
                          <span className="text-xs text-gray-600">{menu.status || 'Active'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-2">
                    <Link to={createPageUrl('menuload')}>
                      <Button variant="outline" size="sm" className="text-green-600 border-green-300 hover:bg-green-100">
                        {translations.viewAllMenus || 'View All Menus'}
                        <ArrowUpRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <ChefHat className="h-12 w-12 text-green-300 mx-auto mb-3" />
                  <p className="text-green-700 font-medium mb-1">{translations.noMenusYet || 'No menus created yet'}</p>
                  <Link to={createPageUrl('MenuCreate')}>
                    <Button className="bg-green-600 hover:bg-green-700 text-white">
                      <Plus className="h-4 w-4 mr-2" />
                      {translations.createFirstMenu || 'Create Your First Menu'}
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-200 bg-blue-50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                {translations.consultations || 'Consultations'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6">
                <MessageSquare className="h-12 w-12 text-blue-300 mx-auto mb-3" />
                <p className="text-blue-700 font-medium mb-1">{translations.noChatHistory || 'No chat history yet'}</p>
                <Link to={createPageUrl('Chat')}>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {translations.startFirstChat || 'Start Your First Chat'}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}