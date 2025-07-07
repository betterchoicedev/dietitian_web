import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { ChatUser } from '@/api/entities';
import { useLanguage } from '@/contexts/LanguageContext';
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
  Target
} from 'lucide-react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';

export default function Dashboard() {
  const { translations } = useLanguage();
  const [stats, setStats] = useState({
    totalClients: 0,
    totalMenus: 0,
    totalChats: 0,
    activeThisWeek: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [recentMenus, setRecentMenus] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Starting dashboard data load...');
      
      // Load clients first
      console.log('👥 Loading clients from chat_users table...');
      const clients = await ChatUser.list();
      console.log('✅ Clients loaded:', clients?.length || 0, 'records');
      
      // Load menus
      console.log('🍽️ Loading menus from meal_plans_and_schemas table...');
      const menus = await Menu.list();
      console.log('✅ Menus loaded:', menus?.length || 0, 'records');

      console.log('📊 Final dashboard data:', {
        totalClients: clients?.length || 0,
        totalMenus: menus?.length || 0
      });

      // Calculate stats - only show the two working ones
      setStats({
        totalClients: clients?.length || 0,
        totalMenus: menus?.length || 0,
        totalChats: 0,        // Keep as 0
        activeThisWeek: 0     // Keep as 0
      });

      // Get recent menus only
      setRecentMenus((menus || []).slice(0, 5).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setRecentChats([]);  // Empty

      // Activity only from menus
      const allActivity = [
        ...(menus || []).map(m => ({ ...m, type: 'menu' }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
      
      setRecentActivity(allActivity);

    } catch (error) {
      console.error("❌ Error loading dashboard data:", error);
      console.error("❌ Error details:", error.message);
      // Set empty data on error to prevent crashes
      setStats({
        totalClients: 0,
        totalMenus: 0,
        totalChats: 0,
        activeThisWeek: 0
      });
      setRecentActivity([]);
      setRecentMenus([]);
      setRecentChats([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Simplified - not calculating weekly activity for now

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  const statCards = [
    {
      title: translations.totalClients || 'Total Clients',
      value: stats.totalClients,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      change: '+12%',
      changeColor: 'text-green-600'
    },
    {
      title: translations.menusCreated || 'Menus Created',
      value: stats.totalMenus,
      icon: ChefHat,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      change: '+8%',
      changeColor: 'text-green-600'
    },
    {
      title: translations.chatSessions || 'Chat Sessions',
      value: stats.totalChats,
      icon: MessageSquare,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      change: '+23%',
      changeColor: 'text-green-600'
    },
    {
      title: translations.weeklyActivity || 'Weekly Activity',
      value: stats.activeThisWeek,
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      change: '+15%',
      changeColor: 'text-green-600'
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
      link: createPageUrl('MenuCreate')
    },
    {
      title: translations.manageClients || 'Manage Clients',
      description: translations.viewEditClients || 'View and edit client profiles',
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      hoverColor: 'hover:bg-blue-100',
      borderColor: 'border-blue-200',
      link: createPageUrl('Clients')
    },
    {
      title: translations.startChat || 'Start Chat',
      description: translations.consultWithAI || 'Consult with AI assistant',
      icon: MessageSquare,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      hoverColor: 'hover:bg-purple-100',
      borderColor: 'border-purple-200',
      link: createPageUrl('Chat')
    },
    {
      title: translations.viewAnalytics || 'View Analytics',
      description: translations.analyzeNutrition || 'Analyze nutrition data',
      icon: BarChart3,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      hoverColor: 'hover:bg-orange-100',
      borderColor: 'border-orange-200',
      link: createPageUrl('MenuAnalysis')
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

      {/* Stats Cards */}
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

      {/* Main Content Grid */}
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
                <Link key={index} to={action.link}>
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
                      item.type === 'menu' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {item.type === 'menu' ? (
                        <ChefHat className="h-5 w-5" />
                      ) : (
                        <MessageSquare className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                                             <p className="text-sm font-medium text-gray-900 truncate">
                         {item.type === 'menu' ? item.meal_plan_name || item.name || 'Menu Plan' : 'Chat Session'}
                       </p>
                                             <p className="text-xs text-gray-500">
                         {new Date(item.created_at).toLocaleDateString()} • 
                         {item.type === 'menu' ? ` ${item.daily_total_calories || item.total_calories || 0} cal` : ` ${item.messages?.length || 0} messages`}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-2 border-green-200 bg-green-50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-white" />
              </div>
              {translations.menuOverview || 'Menu Overview'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentMenus.length > 0 ? (
              <div className="space-y-3">
                {recentMenus.slice(0, 3).map((menu, index) => (
                  <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg">
                    <div>
                                             <p className="font-medium text-gray-900">{menu.meal_plan_name || menu.name || 'Untitled Menu'}</p>
                                             <p className="text-sm text-gray-500">{menu.daily_total_calories || menu.total_calories || 0} {translations.kcal || 'kcal'}</p>
                    </div>
                                         <div className="text-right">
                       <p className="text-xs text-gray-500">{new Date(menu.created_at).toLocaleDateString()}</p>
                       <div className="flex items-center gap-1">
                         <Star className="h-3 w-3 text-yellow-500 fill-current" />
                         <span className="text-xs text-gray-600">Active</span>
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
    </div>
  );
}