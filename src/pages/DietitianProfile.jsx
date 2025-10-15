import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useClient } from '@/contexts/ClientContext';
import { EventBus } from '@/utils/EventBus';
import { useNavigate } from 'react-router-dom';
import { entities } from '@/api/client';
import { 
  Search,
  AlertCircle,
  Info,
  AlertTriangle,
  Megaphone,
  Wrench,
  Calendar,
  X,
  User,
  Bell,
  Clock,
  CheckCircle,
  Eye,
  LayoutDashboard,
  MessageSquare,
  Users,
  FileText,
  TrendingUp,
  Activity,
  ArrowRight,
  ChefHat,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

const messageTypeIcons = {
  info: Info,
  warning: AlertTriangle,
  alert: AlertCircle,
  announcement: Megaphone,
  maintenance: Wrench
};

const messageTypeColors = {
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  alert: 'bg-red-100 text-red-800 border-red-200',
  announcement: 'bg-purple-100 text-purple-800 border-purple-200',
  maintenance: 'bg-gray-100 text-gray-800 border-gray-200'
};

const priorityColors = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700'
};

const { Menu, ChatConversation, ChatMessage, ChatUser } = entities;

export default function DietitianProfile() {
  const { translations, language, dir } = useLanguage();
  const { user } = useAuth();
  const { clients, selectClient } = useClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [messages, setMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [showHistory, setShowHistory] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Dashboard state
  const [dashboardStats, setDashboardStats] = useState({
    totalClients: 0,
    activeMealPlans: 0,
    totalMessages: 0,
    recentActivity: 0
  });
  const [recentMessages, setRecentMessages] = useState([]);
  const [clientActivity, setClientActivity] = useState([]);
  const [recentMealPlans, setRecentMealPlans] = useState([]);
  const [recentlyActivatedPlans, setRecentlyActivatedPlans] = useState([]);
  const [recentWeightLogs, setRecentWeightLogs] = useState([]);
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [messageFilterClient, setMessageFilterClient] = useState('all');
  const [messageFilterDate, setMessageFilterDate] = useState('all');
  
  // Pagination state for each section
  const [sectionLimits, setSectionLimits] = useState({
    messages: 5,
    activity: 5,
    mealPlans: 5,
    statusChanges: 5,
    weightLogs: 5,
    mealPlansManagement: 25
  });
  
  // Meal plans management state
  const [mealPlansFilter, setMealPlansFilter] = useState('all');
  const [mealPlansSortBy, setMealPlansSortBy] = useState('created_at');
  const [mealPlansSortOrder, setMealPlansSortOrder] = useState('desc');
  const [mealPlansSearchTerm, setMealPlansSearchTerm] = useState('');
  
  // Client Activity filters
  const [activitySortBy, setActivitySortBy] = useState('lastActivity');
  const [activitySortOrder, setActivitySortOrder] = useState('desc');
  const [activitySearchTerm, setActivitySearchTerm] = useState('');
  
  // Recent Meal Plans filters
  const [recentMealPlansSortBy, setRecentMealPlansSortBy] = useState('created_at');
  const [recentMealPlansSortOrder, setRecentMealPlansSortOrder] = useState('desc');
  const [recentMealPlansStatusFilter, setRecentMealPlansStatusFilter] = useState('all');
  const [recentMealPlansSearchTerm, setRecentMealPlansSearchTerm] = useState('');
  
  // Status Changes filters
  const [statusChangesSortBy, setStatusChangesSortBy] = useState('updated_at');
  const [statusChangesSortOrder, setStatusChangesSortOrder] = useState('desc');
  const [statusChangesFilter, setStatusChangesFilter] = useState('all');
  const [statusChangesSearchTerm, setStatusChangesSearchTerm] = useState('');
  
  // Weight Logs filters
  const [weightLogsSortBy, setWeightLogsSortBy] = useState('measurement_date');
  const [weightLogsSortOrder, setWeightLogsSortOrder] = useState('desc');
  const [weightLogsSearchTerm, setWeightLogsSearchTerm] = useState('');

  useEffect(() => {
    loadCurrentUser();
    loadMessages();
    loadDashboardData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [messages, searchTerm, filterType, filterPriority, filterStatus, showHistory]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('system_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
      alert(translations.failedToLoadMessages || 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      console.log('🔄 Loading dietitian dashboard data...');
      
      // Load all menus (we need all for stats calculation)
      const allMenus = await Menu.list();
      const activeMealPlans = allMenus.filter(menu => menu.status === 'active');
      
      // Get recent meal plans (all created) - sorted for display
      const recentPlans = [...allMenus]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setRecentMealPlans(recentPlans);
      
      // Get ALL recent status changes (activated, expired, drafted, etc.) - sorted for display
      const statusChanges = [...allMenus]
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      setRecentlyActivatedPlans(statusChanges);
      
      // Load recent messages from all conversations
      console.log('🔍 Loading conversations...');
      const { data: conversationsData, error: convError } = await supabase
        .from('chat_conversations')
        .select('id, user_id, started_at')
        .order('started_at', { ascending: false });
      
      if (convError) {
        console.error('❌ Error loading conversations:', convError);
        throw convError;
      }
      
      console.log('✅ Conversations loaded:', conversationsData?.length || 0, 'records');
      
      // Load user data separately to avoid foreign key conflicts
      console.log('🔍 Loading user data...');
      const { data: usersData, error: usersError } = await supabase
        .from('chat_users')
        .select('id, user_code, full_name');
      
      if (usersError) {
        console.error('❌ Error loading users:', usersError);
        throw usersError;
      }
      
      // Create a map of user_id to user data
      const userMap = {};
      usersData?.forEach(user => {
        userMap[user.id] = user;
      });
      
      console.log('✅ Users loaded:', usersData?.length || 0, 'records');
      
      // Get messages from all conversations
      const allMessages = [];
      const conversationMap = {};
      const clientLastMessageMap = {};
      
      for (const conv of conversationsData || []) {
        const userData = userMap[conv.user_id];
        const userCode = userData?.user_code;
        const userName = userData?.full_name;
        
        if (!userCode) {
          console.warn('⚠️ No user_code found for conversation:', conv.id, 'user_id:', conv.user_id);
          continue;
        }
        
        conversationMap[conv.id] = userCode;
        console.log('📨 Loading messages for conversation:', conv.id, 'user:', userCode, 'name:', userName);
        
        try {
          const msgs = await ChatMessage.listByConversation(conv.id, { limit: 3 }); // Reduced for performance
          console.log('📨 Messages loaded for conversation', conv.id, ':', msgs?.length || 0);
          
          const validMessages = msgs.filter(msg => {
            if (msg.role === 'assistant') {
              return msg.message !== null && msg.message !== undefined;
            }
            return true;
          });
          
          console.log('✅ Valid messages for conversation', conv.id, ':', validMessages.length);
          
          // Track last message time per client
          if (validMessages.length > 0) {
            const lastMsg = validMessages[0]; // Already sorted by date
            if (!clientLastMessageMap[userCode] || 
                new Date(lastMsg.created_at) > new Date(clientLastMessageMap[userCode].created_at)) {
              clientLastMessageMap[userCode] = {
                ...lastMsg,
                user_code: userCode
              };
              console.log('📝 Updated last message for user:', userCode, 'at:', lastMsg.created_at);
            }
          }
          
          allMessages.push(...validMessages.map(m => ({ ...m, user_code: userCode })));
        } catch (msgError) {
          console.warn('⚠️ Error loading messages for conversation:', conv.id, msgError);
        }
      }
      
      // Sort all messages by date and take the most recent (limit for performance)
      const sortedMessages = allMessages
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 30); // Increased limit but still reasonable
      
      console.log('📋 Total messages loaded:', allMessages.length);
      console.log('📋 Recent messages set:', sortedMessages.length);
      setRecentMessages(sortedMessages);
      
      // Skip chat activity section - removed per user request
      
      // Load recent weight logs (limit to reasonable amount for performance)
      try {
        const { data: weightLogs, error: weightError } = await supabase
          .from('weight_logs')
          .select('*')
          .order('measurement_date', { ascending: false })
          .limit(50); // Load more but not all
        
        if (weightError) throw weightError;
        setRecentWeightLogs(weightLogs || []);
      } catch (weightError) {
        console.warn('Error loading weight logs:', weightError);
        setRecentWeightLogs([]);
      }
      
      // Calculate client activity
      const activityMap = {};
      
      // Add menu activity
      allMenus.forEach(menu => {
        if (!activityMap[menu.user_code]) {
          activityMap[menu.user_code] = {
            user_code: menu.user_code,
            menus: 0,
            messages: 0,
            lastActivity: menu.created_at
          };
        }
        activityMap[menu.user_code].menus++;
        if (new Date(menu.created_at) > new Date(activityMap[menu.user_code].lastActivity)) {
          activityMap[menu.user_code].lastActivity = menu.created_at;
        }
      });
      
      // Add message activity
      allMessages.forEach(msg => {
        if (!activityMap[msg.user_code]) {
          activityMap[msg.user_code] = {
            user_code: msg.user_code,
            menus: 0,
            messages: 0,
            lastActivity: msg.created_at
          };
        }
        activityMap[msg.user_code].messages++;
        if (new Date(msg.created_at) > new Date(activityMap[msg.user_code].lastActivity)) {
          activityMap[msg.user_code].lastActivity = msg.created_at;
        }
      });
      
      // Convert to array and sort by last activity
      const activityArray = Object.values(activityMap)
        .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
        .slice(0, 10);
      
      setClientActivity(activityArray);
      
      // Update stats
      setDashboardStats({
        totalClients: clients.length,
        activeMealPlans: activeMealPlans.length,
        totalMessages: allMessages.length,
        recentActivity: activityArray.length
      });
      
      console.log('✅ Dashboard data loaded successfully');
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...messages];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(msg => 
        msg.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(msg => msg.message_type === filterType);
    }

    // Priority filter
    if (filterPriority !== 'all') {
      filtered = filtered.filter(msg => msg.priority === filterPriority);
    }

    // Status filter - if showing history, show all; otherwise filter by status
    if (!showHistory && filterStatus !== 'all') {
      filtered = filtered.filter(msg => 
        filterStatus === 'active' ? msg.is_active : !msg.is_active
      );
    }

    setFilteredMessages(filtered);
  };



  const toggleActive = async (message) => {
    try {
      const { error } = await supabase
        .from('system_messages')
        .update({ is_active: !message.is_active })
        .eq('id', message.id);

      if (error) throw error;
      await loadMessages();
      // Notify other components that system messages were updated
      EventBus.emit('systemMessagesUpdated');
    } catch (error) {
      console.error('Error toggling message status:', error);
      alert(translations.failedToUpdateMessageStatus || 'Failed to update message status');
    }
  };


  const getMessageIcon = (type) => {
    const Icon = messageTypeIcons[type] || Info;
    return <Icon className="h-5 w-5" />;
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setFilterPriority('all');
    setFilterStatus('active');
  };

  const hasActiveFilters = searchTerm || filterType !== 'all' || filterPriority !== 'all' || filterStatus !== 'all';

  const activeMessages = messages.filter(msg => msg.is_active);
  const urgentMessages = activeMessages.filter(msg => msg.priority === 'urgent');
  const recentSystemMessages = activeMessages.slice(0, 5);
  
  // Helper function to get client name by user_code
  const getClientName = (userCode) => {
    const client = clients.find(c => c.user_code === userCode);
    return client?.full_name || userCode;
  };
  
  // Helper function to set client and navigate to a page
  const setClientAndNavigate = (userCode, path) => {
    if (userCode) {
      selectClient(userCode);
    }
    navigate(path);
  };
  
  // Helper function to navigate to chat with a specific client
  const navigateToChat = (userCode) => {
    setClientAndNavigate(userCode, '/chat');
  };
  
  // Helper function to navigate to client details
  const navigateToClientDetails = (userCode) => {
    setClientAndNavigate(userCode, '/users');
  };
  
  // Helper function to navigate to menu view with specific meal plan
  const navigateToMenuView = (userCode, menuId = null) => {
    if (userCode) {
      selectClient(userCode);
    }
    const url = menuId ? `/menuload?menuId=${menuId}` : '/menuload';
    navigate(url);
  };
  
  // Load more items for a specific section
  const loadMoreItems = (section) => {
    setSectionLimits(prev => ({
      ...prev,
      [section]: prev[section] + 5
    }));
  };
  
  // Filter recent messages
  const filteredRecentMessages = recentMessages.filter(msg => {
    if (messageFilterClient !== 'all' && msg.user_code !== messageFilterClient) {
      return false;
    }
    if (messageSearchTerm) {
      const content = msg.content || msg.message || '';
      return content.toLowerCase().includes(messageSearchTerm.toLowerCase());
    }
    return true;
  });
  
  // Get display items for each section based on current limit
  const getDisplayItems = (items, section) => {
    return items.slice(0, sectionLimits[section]);
  };
  
  // Filter and sort meal plans (management section)
  const getFilteredAndSortedMealPlans = () => {
    let filtered = [...recentMealPlans];
    
    // Apply status filter
    if (mealPlansFilter !== 'all') {
      filtered = filtered.filter(plan => plan.status === mealPlansFilter);
    }
    
    // Apply search filter
    if (mealPlansSearchTerm) {
      filtered = filtered.filter(plan => 
        (plan.meal_plan_name || plan.name || '').toLowerCase().includes(mealPlansSearchTerm.toLowerCase()) ||
        getClientName(plan.user_code).toLowerCase().includes(mealPlansSearchTerm.toLowerCase())
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (mealPlansSortBy) {
        case 'name':
          aValue = (a.meal_plan_name || a.name || '').toLowerCase();
          bValue = (b.meal_plan_name || b.name || '').toLowerCase();
          break;
        case 'client':
          aValue = getClientName(a.user_code).toLowerCase();
          bValue = getClientName(b.user_code).toLowerCase();
          break;
        case 'calories':
          aValue = a.daily_total_calories || a.total_calories || 0;
          bValue = b.daily_total_calories || b.total_calories || 0;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'created_at':
        default:
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
      }
      
      if (mealPlansSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    // Apply pagination limit for meal plans management section
    return filtered.slice(0, sectionLimits.mealPlansManagement);
  };
  
  // Filter and sort client activity
  const getFilteredAndSortedActivity = () => {
    let filtered = [...clientActivity];
    
    // Apply search filter
    if (activitySearchTerm) {
      filtered = filtered.filter(activity => 
        getClientName(activity.user_code).toLowerCase().includes(activitySearchTerm.toLowerCase())
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (activitySortBy) {
        case 'client':
          aValue = getClientName(a.user_code).toLowerCase();
          bValue = getClientName(b.user_code).toLowerCase();
          break;
        case 'mealPlans':
          aValue = a.mealPlans || 0;
          bValue = b.mealPlans || 0;
          break;
        case 'messages':
          aValue = a.messages || 0;
          bValue = b.messages || 0;
          break;
        case 'lastActivity':
        default:
          aValue = new Date(a.lastActivity);
          bValue = new Date(b.lastActivity);
          break;
      }
      
      if (activitySortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  };
  
  // Filter and sort recent meal plans
  const getFilteredAndSortedRecentMealPlans = () => {
    let filtered = [...recentMealPlans];
    
    // Apply status filter
    if (recentMealPlansStatusFilter !== 'all') {
      filtered = filtered.filter(plan => plan.status === recentMealPlansStatusFilter);
    }
    
    // Apply search filter
    if (recentMealPlansSearchTerm) {
      filtered = filtered.filter(plan => 
        (plan.meal_plan_name || plan.name || '').toLowerCase().includes(recentMealPlansSearchTerm.toLowerCase()) ||
        getClientName(plan.user_code).toLowerCase().includes(recentMealPlansSearchTerm.toLowerCase())
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (recentMealPlansSortBy) {
        case 'name':
          aValue = (a.meal_plan_name || a.name || '').toLowerCase();
          bValue = (b.meal_plan_name || b.name || '').toLowerCase();
          break;
        case 'client':
          aValue = getClientName(a.user_code).toLowerCase();
          bValue = getClientName(b.user_code).toLowerCase();
          break;
        case 'calories':
          aValue = a.daily_total_calories || a.total_calories || 0;
          bValue = b.daily_total_calories || b.total_calories || 0;
          break;
        case 'created_at':
        default:
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
      }
      
      if (recentMealPlansSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  };
  
  // Filter and sort status changes
  const getFilteredAndSortedStatusChanges = () => {
    let filtered = [...recentlyActivatedPlans];
    
    // Apply status filter
    if (statusChangesFilter !== 'all') {
      filtered = filtered.filter(plan => plan.status === statusChangesFilter);
    }
    
    // Apply search filter
    if (statusChangesSearchTerm) {
      filtered = filtered.filter(plan => 
        (plan.meal_plan_name || plan.name || '').toLowerCase().includes(statusChangesSearchTerm.toLowerCase()) ||
        getClientName(plan.user_code).toLowerCase().includes(statusChangesSearchTerm.toLowerCase())
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (statusChangesSortBy) {
        case 'name':
          aValue = (a.meal_plan_name || a.name || '').toLowerCase();
          bValue = (b.meal_plan_name || b.name || '').toLowerCase();
          break;
        case 'client':
          aValue = getClientName(a.user_code).toLowerCase();
          bValue = getClientName(b.user_code).toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'updated_at':
        default:
          aValue = new Date(a.updated_at || a.created_at);
          bValue = new Date(b.updated_at || b.created_at);
          break;
      }
      
      if (statusChangesSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  };
  
  // Filter and sort weight logs
  const getFilteredAndSortedWeightLogs = () => {
    let filtered = [...recentWeightLogs];
    
    // Apply search filter
    if (weightLogsSearchTerm) {
      filtered = filtered.filter(log => 
        getClientName(log.user_code).toLowerCase().includes(weightLogsSearchTerm.toLowerCase()) ||
        (log.notes || '').toLowerCase().includes(weightLogsSearchTerm.toLowerCase())
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (weightLogsSortBy) {
        case 'client':
          aValue = getClientName(a.user_code).toLowerCase();
          bValue = getClientName(b.user_code).toLowerCase();
          break;
        case 'weight':
          aValue = a.weight_kg || 0;
          bValue = b.weight_kg || 0;
          break;
        case 'bodyFat':
          aValue = a.body_fat_percentage || 0;
          bValue = b.body_fat_percentage || 0;
          break;
        case 'measurement_date':
        default:
          aValue = new Date(a.measurement_date);
          bValue = new Date(b.measurement_date);
          break;
      }
      
      if (weightLogsSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  };

  return (
    <div className="container mx-auto p-6 space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary-lighter text-white font-semibold text-xl">
              {currentUser?.email?.[0]?.toUpperCase() || 'D'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold">{translations.profile || 'Dietitian Profile'}</h1>
            <p className="text-gray-600">{currentUser?.email}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-green-600 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            {translations.active || 'Active'}
          </Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{translations.totalClients || 'Total Clients'}</p>
                <p className="text-2xl font-bold">{dashboardStats.totalClients}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{translations.activeMealPlans || 'Active Meal Plans'}</p>
                <p className="text-2xl font-bold text-green-600">{dashboardStats.activeMealPlans}</p>
              </div>
              <ChefHat className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{translations.totalMessages || 'Total Messages'}</p>
                <p className="text-2xl font-bold text-purple-600">{dashboardStats.totalMessages}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{translations.recentActivity || 'Recent Activity'}</p>
                <p className="text-2xl font-bold text-orange-600">{dashboardStats.recentActivity}</p>
              </div>
              <Activity className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard" className="flex items-center space-x-2">
            <LayoutDashboard className="h-4 w-4" />
            <span>{translations.dashboard || 'Dashboard'}</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center space-x-2">
            <Megaphone className="h-4 w-4" />
            <span>{translations.systemMessages || 'System Messages'}</span>
            {activeMessages.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {activeMessages.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center space-x-2">
            <User className="h-4 w-4" />
            <span>{translations.profileSettings || 'Profile Settings'}</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Recent Client Messages */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{translations.recentClientMessages || 'Recent Client Messages'}</CardTitle>
                  <CardDescription>{translations.latestMessagesFromAllClients || 'Latest messages from all your clients'}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSectionLimits(prev => ({ ...prev, messages: prev.messages === 3 ? 5 : 3 }))}
                    className="flex items-center gap-2"
                  >
                    {sectionLimits.messages === 3 ? (
                      <>
                        <ArrowRight className="h-4 w-4 -rotate-90" />
                        {translations.expand || 'Expand'}
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 rotate-90" />
                        {translations.shrink || 'Shrink'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{translations.search || 'Search'}</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder={translations.searchMessages || 'Search messages...'}
                        value={messageSearchTerm}
                        onChange={(e) => setMessageSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>{translations.client || 'Client'}</Label>
                    <Select value={messageFilterClient} onValueChange={setMessageFilterClient}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{translations.allClients || 'All Clients'}</SelectItem>
                        {clients.map(client => (
                          <SelectItem key={client.user_code} value={client.user_code}>
                            {client.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Messages List */}
              {isLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-gray-600">{translations.loading || 'Loading messages...'}</p>
                </div>
              ) : filteredRecentMessages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noMessagesFound || 'No messages found'}</p>
                </div>
              ) : (
                <>
                <div className="space-y-4">
                  {getDisplayItems(filteredRecentMessages, 'messages').map((message, index) => (
                    <div key={message.id || index} className="relative overflow-hidden rounded-lg bg-gradient-to-r from-white to-gray-50 border border-gray-200 p-4 hover:shadow-md transition-all duration-300">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          message.role === 'user' 
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                            : message.role === 'dietitian'
                            ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                            : 'bg-gradient-to-br from-purple-500 to-purple-600'
                        }`}>
                          {message.role === 'user' ? (
                            <User className="h-5 w-5 text-white" />
                          ) : message.role === 'dietitian' ? (
                            <Send className="h-5 w-5 text-white" />
                          ) : (
                            <MessageSquare className="h-5 w-5 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">
                                {getClientName(message.user_code)}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                {message.role === 'user' ? translations.client || 'Client' : 
                                 message.role === 'dietitian' ? translations.dietitian || 'Dietitian' :
                                 translations.assistant || 'Assistant'}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500">
                              {new Date(message.created_at).toLocaleString()}
                            </p>
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-2 mb-3">
                            {message.content || message.message || translations.messageContentNotAvailable || 'Message content not available'}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigateToChat(message.user_code)}
                              className="text-xs"
                            >
                              <MessageSquare className="h-3 w-3 mr-1" />
                              {translations.viewConversation || 'View Conversation'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigateToChat(message.user_code)}
                              className="text-xs"
                            >
                              <ArrowRight className="h-3 w-3 mr-1" />
                              {translations.reply || 'Reply'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {filteredRecentMessages.length > sectionLimits.messages && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => loadMoreItems('messages')}
                      className="w-full"
                    >
                      <ArrowRight className="h-4 w-4 mr-2 -rotate-90" />
                      {translations.loadMore || `Load More (${Math.min(5, filteredRecentMessages.length - sectionLimits.messages)} ${translations.more || 'more'})`}
                    </Button>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Client Activity */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{translations.clientActivity || 'Client Activity'}</CardTitle>
                  <CardDescription>{translations.recentActivityMetrics || 'Recent activity metrics for your clients'}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSectionLimits(prev => ({ ...prev, activity: prev.activity === 3 ? 5 : 3 }))}
                    className="flex items-center gap-2"
                  >
                    {sectionLimits.activity === 3 ? (
                      <>
                        <ArrowRight className="h-4 w-4 -rotate-90" />
                        {translations.expand || 'Expand'}
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 rotate-90" />
                        {translations.shrink || 'Shrink'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{translations.search || 'Search'}</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                    <Input
                      placeholder={translations.searchClients || 'Search clients...'}
                      value={activitySearchTerm}
                      onChange={(e) => setActivitySearchTerm(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{translations.sortBy || 'Sort By'}</Label>
                  <Select value={activitySortBy} onValueChange={setActivitySortBy}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lastActivity">{translations.lastActivity || 'Last Activity'}</SelectItem>
                      <SelectItem value="client">{translations.client || 'Client Name'}</SelectItem>
                      <SelectItem value="mealPlans">{translations.mealPlans || 'Meal Plans'}</SelectItem>
                      <SelectItem value="messages">{translations.messages || 'Messages'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{translations.order || 'Order'}</Label>
                  <Select value={activitySortOrder} onValueChange={setActivitySortOrder}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">{translations.descending || 'Descending'}</SelectItem>
                      <SelectItem value="asc">{translations.ascending || 'Ascending'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {clientActivity.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noActivityFound || 'No activity found'}</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{translations.client || 'Client'}</TableHead>
                          <TableHead>{translations.mealPlans || 'Meal Plans'}</TableHead>
                          <TableHead>{translations.messages || 'Messages'}</TableHead>
                          <TableHead>{translations.lastActivity || 'Last Activity'}</TableHead>
                          <TableHead className="text-right">{translations.actions || 'Actions'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getDisplayItems(getFilteredAndSortedActivity(), 'activity').map((activity) => (
                          <TableRow key={activity.user_code} className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                {getClientName(activity.user_code)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <ChefHat className="h-3 w-3 mr-1" />
                                {activity.menus}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                <MessageSquare className="h-3 w-3 mr-1" />
                                {activity.messages}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {new Date(activity.lastActivity).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigateToChat(activity.user_code)}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <MessageSquare className="h-4 w-4 mr-1" />
                                {translations.viewDetails || 'View Details'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {getFilteredAndSortedActivity().length > sectionLimits.activity && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        onClick={() => loadMoreItems('activity')}
                        className="w-full"
                      >
                      <ArrowRight className="h-4 w-4 mr-2 -rotate-90" />
                      {translations.loadMore || `Load More (${Math.min(5, getFilteredAndSortedActivity().length - sectionLimits.activity)} ${translations.more || 'more'})`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Meal Plans Created */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{translations.recentMealPlans || 'Recent Meal Plans Created'}</CardTitle>
                  <CardDescription>{translations.latestMealPlansCreated || 'Latest meal plans created for all clients'}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSectionLimits(prev => ({ ...prev, mealPlans: prev.mealPlans === 3 ? 5 : 3 }))}
                    className="flex items-center gap-2"
                  >
                    {sectionLimits.mealPlans === 3 ? (
                      <>
                        <ArrowRight className="h-4 w-4 -rotate-90" />
                        {translations.expand || 'Expand'}
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 rotate-90" />
                        {translations.shrink || 'Shrink'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">{translations.search || 'Search'}</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                    <Input
                      placeholder={translations.searchMealPlans || 'Search...'}
                      value={recentMealPlansSearchTerm}
                      onChange={(e) => setRecentMealPlansSearchTerm(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{translations.status || 'Status'}</Label>
                  <Select value={recentMealPlansStatusFilter} onValueChange={setRecentMealPlansStatusFilter}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{translations.allStatus || 'All'}</SelectItem>
                      <SelectItem value="active">{translations.active || 'Active'}</SelectItem>
                      <SelectItem value="draft">{translations.draft || 'Draft'}</SelectItem>
                      <SelectItem value="expired">{translations.expired || 'Expired'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{translations.sortBy || 'Sort By'}</Label>
                  <Select value={recentMealPlansSortBy} onValueChange={setRecentMealPlansSortBy}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created_at">{translations.dateCreated || 'Date Created'}</SelectItem>
                      <SelectItem value="name">{translations.mealPlanName || 'Name'}</SelectItem>
                      <SelectItem value="client">{translations.client || 'Client'}</SelectItem>
                      <SelectItem value="calories">{translations.calories || 'Calories'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{translations.order || 'Order'}</Label>
                  <Select value={recentMealPlansSortOrder} onValueChange={setRecentMealPlansSortOrder}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">{translations.descending || 'Descending'}</SelectItem>
                      <SelectItem value="asc">{translations.ascending || 'Ascending'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {recentMealPlans.length === 0 ? (
                <div className="text-center py-12">
                  <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noMealPlansFound || 'No meal plans found'}</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{translations.client || 'Client'}</TableHead>
                          <TableHead>{translations.mealPlanName || 'Meal Plan Name'}</TableHead>
                          <TableHead>{translations.calories || 'Calories'}</TableHead>
                          <TableHead>{translations.status || 'Status'}</TableHead>
                          <TableHead>{translations.created || 'Created'}</TableHead>
                          <TableHead className="text-right">{translations.actions || 'Actions'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getDisplayItems(getFilteredAndSortedRecentMealPlans(), 'mealPlans').map((plan) => (
                          <TableRow key={plan.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                {getClientName(plan.user_code)}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {plan.meal_plan_name || plan.name || translations.unnamedPlan || 'Unnamed Plan'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                {plan.daily_total_calories || plan.total_calories || 0} kcal
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                plan.status === 'active' ? 'bg-green-100 text-green-700' :
                                plan.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                                'bg-blue-100 text-blue-700'
                              }>
                                {plan.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {new Date(plan.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigateToMenuView(plan.user_code, plan.id)}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                {translations.view || 'View'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {getFilteredAndSortedRecentMealPlans().length > sectionLimits.mealPlans && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        onClick={() => loadMoreItems('mealPlans')}
                        className="w-full"
                      >
                        <ArrowRight className="h-4 w-4 mr-2 -rotate-90" />
                        {translations.loadMore || `Load More (${Math.min(5, getFilteredAndSortedRecentMealPlans().length - sectionLimits.mealPlans)} ${translations.more || 'more'})`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Status Changes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{translations.recentStatusChanges || 'Recent Status Changes'}</CardTitle>
                  <CardDescription>{translations.allRecentStatusChanges || 'All meal plan status changes (activated, expired, drafted, etc.)'}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSectionLimits(prev => ({ ...prev, statusChanges: prev.statusChanges === 3 ? 5 : 3 }))}
                    className="flex items-center gap-2"
                  >
                    {sectionLimits.statusChanges === 3 ? (
                      <>
                        <ArrowRight className="h-4 w-4 -rotate-90" />
                        {translations.expand || 'Expand'}
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 rotate-90" />
                        {translations.shrink || 'Shrink'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">{translations.search || 'Search'}</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                    <Input
                      placeholder={translations.searchMealPlans || 'Search...'}
                      value={statusChangesSearchTerm}
                      onChange={(e) => setStatusChangesSearchTerm(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{translations.status || 'Status'}</Label>
                  <Select value={statusChangesFilter} onValueChange={setStatusChangesFilter}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{translations.allStatus || 'All'}</SelectItem>
                      <SelectItem value="active">{translations.active || 'Active'}</SelectItem>
                      <SelectItem value="draft">{translations.draft || 'Draft'}</SelectItem>
                      <SelectItem value="expired">{translations.expired || 'Expired'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{translations.sortBy || 'Sort By'}</Label>
                  <Select value={statusChangesSortBy} onValueChange={setStatusChangesSortBy}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="updated_at">{translations.lastUpdated || 'Last Updated'}</SelectItem>
                      <SelectItem value="name">{translations.mealPlanName || 'Name'}</SelectItem>
                      <SelectItem value="client">{translations.client || 'Client'}</SelectItem>
                      <SelectItem value="status">{translations.status || 'Status'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{translations.order || 'Order'}</Label>
                  <Select value={statusChangesSortOrder} onValueChange={setStatusChangesSortOrder}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">{translations.descending || 'Descending'}</SelectItem>
                      <SelectItem value="asc">{translations.ascending || 'Ascending'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {recentlyActivatedPlans.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noActivatedPlans || 'No activated plans found'}</p>
                </div>
              ) : (
                <>
                <div className="space-y-3">
                  {getDisplayItems(getFilteredAndSortedStatusChanges(), 'statusChanges').map((plan) => {
                    const statusColors = {
                      active: { bg: 'from-green-50 to-emerald-50', border: 'border-green-200', icon: 'from-green-500 to-emerald-600', badge: 'bg-green-100 text-green-700' },
                      expired: { bg: 'from-red-50 to-rose-50', border: 'border-red-200', icon: 'from-red-500 to-rose-600', badge: 'bg-red-100 text-red-700' },
                      draft: { bg: 'from-gray-50 to-slate-50', border: 'border-gray-200', icon: 'from-gray-500 to-slate-600', badge: 'bg-gray-100 text-gray-700' },
                      default: { bg: 'from-blue-50 to-indigo-50', border: 'border-blue-200', icon: 'from-blue-500 to-indigo-600', badge: 'bg-blue-100 text-blue-700' }
                    };
                    const colors = statusColors[plan.status] || statusColors.default;
                    
                    return (
                      <div key={plan.id} className={`relative overflow-hidden rounded-lg bg-gradient-to-r ${colors.bg} border ${colors.border} p-4 hover:shadow-md transition-all duration-300`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 bg-gradient-to-br ${colors.icon} rounded-lg flex items-center justify-center flex-shrink-0`}>
                            <CheckCircle className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-gray-900">
                                {getClientName(plan.user_code)}
                              </p>
                              <Badge className={colors.badge}>
                                {plan.status}
                              </Badge>
                              <Badge variant="outline" className="bg-white">
                                {plan.daily_total_calories || plan.total_calories || 0} kcal
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-700">
                              {plan.meal_plan_name || plan.name || translations.unnamedPlan || 'Unnamed Plan'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {translations.lastUpdate || 'Last Update'}: {new Date(plan.updated_at || plan.created_at).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigateToMenuView(plan.user_code, plan.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            {translations.view || 'View'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {getFilteredAndSortedStatusChanges().length > sectionLimits.statusChanges && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => loadMoreItems('statusChanges')}
                      className="w-full"
                    >
                      <ArrowRight className="h-4 w-4 mr-2 -rotate-90" />
                      {translations.loadMore || `Load More (${Math.min(5, getFilteredAndSortedStatusChanges().length - sectionLimits.statusChanges)} ${translations.more || 'more'})`}
                    </Button>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Comprehensive Meal Plans Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{translations.mealPlansManagement || 'Meal Plans Management'}</CardTitle>
                  <CardDescription>{translations.manageAllMealPlans || 'View, filter, and manage all meal plans across all clients'}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSectionLimits(prev => ({ ...prev, mealPlansManagement: prev.mealPlansManagement === 10 ? 25 : 10 }))}
                    className="flex items-center gap-2"
                  >
                    {sectionLimits.mealPlansManagement === 10 ? (
                      <>
                        <ArrowRight className="h-4 w-4 -rotate-90" />
                        {translations.expand || 'Expand'}
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 rotate-90" />
                        {translations.shrink || 'Shrink'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters and Search */}
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label>{translations.search || 'Search'}</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder={translations.searchMealPlans || 'Search meal plans or clients...'}
                        value={mealPlansSearchTerm}
                        onChange={(e) => setMealPlansSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>{translations.status || 'Status'}</Label>
                    <Select value={mealPlansFilter} onValueChange={setMealPlansFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{translations.allStatus || 'All Status'}</SelectItem>
                        <SelectItem value="active">{translations.active || 'Active'}</SelectItem>
                        <SelectItem value="draft">{translations.draft || 'Draft'}</SelectItem>
                        <SelectItem value="expired">{translations.expired || 'Expired'}</SelectItem>
                        <SelectItem value="inactive">{translations.inactive || 'Inactive'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{translations.sortBy || 'Sort By'}</Label>
                    <Select value={mealPlansSortBy} onValueChange={setMealPlansSortBy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_at">{translations.dateCreated || 'Date Created'}</SelectItem>
                        <SelectItem value="name">{translations.mealPlanName || 'Meal Plan Name'}</SelectItem>
                        <SelectItem value="client">{translations.client || 'Client'}</SelectItem>
                        <SelectItem value="calories">{translations.calories || 'Calories'}</SelectItem>
                        <SelectItem value="status">{translations.status || 'Status'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{translations.order || 'Order'}</Label>
                    <Select value={mealPlansSortOrder} onValueChange={setMealPlansSortOrder}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">{translations.descending || 'Descending'}</SelectItem>
                        <SelectItem value="asc">{translations.ascending || 'Ascending'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Meal Plans Table */}
              {recentMealPlans.length === 0 ? (
                <div className="text-center py-12">
                  <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noMealPlansFound || 'No meal plans found'}</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{translations.client || 'Client'}</TableHead>
                          <TableHead>{translations.mealPlanName || 'Meal Plan Name'}</TableHead>
                          <TableHead>{translations.calories || 'Calories'}</TableHead>
                          <TableHead>{translations.status || 'Status'}</TableHead>
                          <TableHead>{translations.created || 'Created'}</TableHead>
                          <TableHead>{translations.lastUpdated || 'Last Updated'}</TableHead>
                          <TableHead>{translations.activeUntil || 'Active Until'}</TableHead>
                          <TableHead className="text-right">{translations.actions || 'Actions'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getFilteredAndSortedMealPlans().map((plan) => (
                          <TableRow key={plan.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                {getClientName(plan.user_code)}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {plan.meal_plan_name || plan.name || translations.unnamedPlan || 'Unnamed Plan'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                {plan.daily_total_calories || plan.total_calories || 0} kcal
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                plan.status === 'active' ? 'bg-green-100 text-green-700' :
                                plan.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                                plan.status === 'expired' ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                              }>
                                {plan.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {new Date(plan.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {plan.updated_at ? new Date(plan.updated_at).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {plan.active_until ? (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(plan.active_until).toLocaleDateString()}
                                </div>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigateToMenuView(plan.user_code, plan.id)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigateToChat(plan.user_code)}
                                  className="text-green-600 hover:text-green-700"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Results Summary */}
                  <div className="mt-4 text-sm text-gray-600 text-center">
                    {translations.showingResults || 'Showing'} {getFilteredAndSortedMealPlans().length} {translations.of || 'of'} {recentMealPlans.length} {translations.mealPlans || 'meal plans'}
                    {mealPlansFilter !== 'all' && (
                      <span className="ml-2">
                        ({translations.filteredBy || 'filtered by'} {translations.status || 'status'}: {mealPlansFilter})
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Weight Logs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{translations.recentWeightLogs || 'Recent Weight & Body Fat Logs'}</CardTitle>
                  <CardDescription>{translations.latestWeightLogsFromClients || 'Latest weight and body fat measurements from all clients'}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSectionLimits(prev => ({ ...prev, weightLogs: prev.weightLogs === 3 ? 5 : 3 }))}
                    className="flex items-center gap-2"
                  >
                    {sectionLimits.weightLogs === 3 ? (
                      <>
                        <ArrowRight className="h-4 w-4 -rotate-90" />
                        {translations.expand || 'Expand'}
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 rotate-90" />
                        {translations.shrink || 'Shrink'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{translations.search || 'Search'}</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                    <Input
                      placeholder={translations.searchClients || 'Search clients...'}
                      value={weightLogsSearchTerm}
                      onChange={(e) => setWeightLogsSearchTerm(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{translations.sortBy || 'Sort By'}</Label>
                  <Select value={weightLogsSortBy} onValueChange={setWeightLogsSortBy}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="measurement_date">{translations.date || 'Date'}</SelectItem>
                      <SelectItem value="client">{translations.client || 'Client'}</SelectItem>
                      <SelectItem value="weight">{translations.weight || 'Weight'}</SelectItem>
                      <SelectItem value="bodyFat">{translations.bodyFat || 'Body Fat'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{translations.order || 'Order'}</Label>
                  <Select value={weightLogsSortOrder} onValueChange={setWeightLogsSortOrder}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">{translations.descending || 'Descending'}</SelectItem>
                      <SelectItem value="asc">{translations.ascending || 'Ascending'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {recentWeightLogs.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noWeightLogs || 'No weight logs found'}</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{translations.client || 'Client'}</TableHead>
                          <TableHead>{translations.weight || 'Weight (kg)'}</TableHead>
                          <TableHead>{translations.bodyFat || 'Body Fat %'}</TableHead>
                          <TableHead>{translations.logDate || 'Log Date'}</TableHead>
                          <TableHead>{translations.notes || 'Notes'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getDisplayItems(getFilteredAndSortedWeightLogs(), 'weightLogs').map((log) => (
                          <TableRow key={log.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                                  <User className="h-4 w-4 text-purple-600" />
                                </div>
                                {getClientName(log.user_code)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {log.weight_kg} kg
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {log.body_fat_percentage ? (
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                  {log.body_fat_percentage}%
                                </Badge>
                              ) : (
                                <span className="text-gray-400 text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {new Date(log.measurement_date).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                              {log.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {getFilteredAndSortedWeightLogs().length > sectionLimits.weightLogs && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        onClick={() => loadMoreItems('weightLogs')}
                        className="w-full"
                      >
                        <ArrowRight className="h-4 w-4 mr-2 -rotate-90" />
                        {translations.loadMore || `Load More (${Math.min(5, getFilteredAndSortedWeightLogs().length - sectionLimits.weightLogs)} ${translations.more || 'more'})`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Messages Tab */}
        <TabsContent value="messages" className="space-y-6">
          {/* Urgent Messages Alert */}
          {urgentMessages.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {translations.urgentMessageAlert?.replace('{count}', urgentMessages.length)?.replace('{plural}', urgentMessages.length > 1 ? 's' : '') || `You have ${urgentMessages.length} urgent message${urgentMessages.length > 1 ? 's' : ''} that require immediate attention.`}
              </AlertDescription>
            </Alert>
          )}

          {/* Recent Messages */}
          <Card>
            <CardHeader>
              <CardTitle>{translations.recentMessages || 'Recent Messages'}</CardTitle>
              <CardDescription>{translations.latestSystemMessages || 'Latest system messages and announcements'}</CardDescription>
            </CardHeader>
            <CardContent>
              {recentSystemMessages.length === 0 ? (
                <div className="text-center py-8">
                  <Megaphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noRecentMessages || 'No recent messages'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentSystemMessages.map((message) => (
                    <div key={message.id} className={`p-4 rounded-lg border ${messageTypeColors[message.message_type]}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          {getMessageIcon(message.message_type)}
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-medium">{message.title}</h4>
                              <Badge className={priorityColors[message.priority]}>
                                {message.priority}
                              </Badge>
                            </div>
                            <p className="text-sm mt-1 opacity-90">{message.content}</p>
                            <p className="text-xs mt-2 opacity-75">
                              {new Date(message.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={message.is_active}
                            onCheckedChange={() => toggleActive(message)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Message Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{translations.systemMessages || 'System Messages'}</CardTitle>
                  <CardDescription>{translations.viewAndManageMessages || 'View and manage system messages from external systems'}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showHistory}
                    onCheckedChange={setShowHistory}
                  />
                  <Label className="text-sm font-medium">
                    {translations.showHistory || 'Show History'}
                  </Label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">{translations.filters || 'Filters'}</h3>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-2" />
                      {translations.clearFilters || 'Clear Filters'}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label>{translations.search || 'Search'}</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder={translations.searchMessages || 'Search messages...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>{translations.type || 'Type'}</Label>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{translations.allTypes || 'All Types'}</SelectItem>
                        <SelectItem value="info">{translations.info || 'Info'}</SelectItem>
                        <SelectItem value="warning">{translations.warning || 'Warning'}</SelectItem>
                        <SelectItem value="alert">{translations.alert || 'Alert'}</SelectItem>
                        <SelectItem value="announcement">{translations.announcement || 'Announcement'}</SelectItem>
                        <SelectItem value="maintenance">{translations.maintenance || 'Maintenance'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{translations.priority || 'Priority'}</Label>
                    <Select value={filterPriority} onValueChange={setFilterPriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{translations.allPriorities || 'All Priorities'}</SelectItem>
                        <SelectItem value="low">{translations.low || 'Low'}</SelectItem>
                        <SelectItem value="medium">{translations.medium || 'Medium'}</SelectItem>
                        <SelectItem value="high">{translations.high || 'High'}</SelectItem>
                        <SelectItem value="urgent">{translations.urgent || 'Urgent'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{translations.status || 'Status'}</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus} disabled={showHistory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{translations.allStatus || 'All Status'}</SelectItem>
                        <SelectItem value="active">{translations.active || 'Active'}</SelectItem>
                        <SelectItem value="inactive">{translations.inactive || 'Inactive'}</SelectItem>
                      </SelectContent>
                    </Select>
                    {showHistory && (
                      <p className="text-xs text-gray-500 mt-1">
                        {translations.statusFilterDisabledInHistory || 'Status filter disabled when showing history'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages Table */}
              {isLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-gray-600">{translations.loading || 'Loading messages...'}</p>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="text-center py-12">
                  <Megaphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noMessagesFound || 'No messages found'}</p>
                  {hasActiveFilters && (
                    <Button variant="link" onClick={clearFilters} className="mt-2">
                      {translations.clearFiltersToSeeAll || 'Clear filters to see all messages'}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{translations.status || 'Status'}</TableHead>
                        <TableHead>{translations.type || 'Type'}</TableHead>
                        <TableHead>{translations.priority || 'Priority'}</TableHead>
                        <TableHead>{translations.title || 'Title'}</TableHead>
                        <TableHead>{translations.content || 'Content'}</TableHead>
                        <TableHead>{translations.dates || 'Dates'}</TableHead>
                        <TableHead>{translations.created || 'Created'}</TableHead>
                        <TableHead className="text-right">{translations.view || 'View'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMessages.map((message) => (
                        <TableRow key={message.id} className={!message.is_active ? 'opacity-60' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={message.is_active}
                                onCheckedChange={() => toggleActive(message)}
                              />
                              <span className="text-xs text-gray-500">
                                {message.is_active ? (translations.active || 'Active') : (translations.inactive || 'Inactive')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full ${messageTypeColors[message.message_type]}`}>
                              {getMessageIcon(message.message_type)}
                              <span className="text-sm font-medium capitalize">{message.message_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={priorityColors[message.priority]}>
                              {message.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium max-w-xs">
                            {message.title}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div className="text-sm text-gray-600 line-clamp-2">
                              {message.content}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {message.start_date && (
                              <div className="flex items-center text-green-600">
                                <Calendar className="h-3 w-3 mr-1" />
                                {new Date(message.start_date).toLocaleDateString()}
                              </div>
                            )}
                            {message.end_date && (
                              <div className="flex items-center text-red-600">
                                <Calendar className="h-3 w-3 mr-1" />
                                {new Date(message.end_date).toLocaleDateString()}
                              </div>
                            )}
                            {!message.start_date && !message.end_date && (
                              <span className="text-gray-400">{translations.always || 'Always'}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(message.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profile Settings Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{translations.profileInformation || 'Profile Information'}</CardTitle>
              <CardDescription>{translations.manageAccountDetailsAndPreferences || 'Manage your account details and preferences'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-4">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-primary-lighter text-white font-semibold text-2xl">
                    {currentUser?.email?.[0]?.toUpperCase() || 'D'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline">{translations.changeAvatar || 'Change Avatar'}</Button>
                  <p className="text-sm text-gray-600 mt-1">{translations.avatarFormatMax || 'JPG, GIF or PNG. 1MB max.'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">{translations.emailAddress || 'Email Address'}</Label>
                  <Input id="email" value={currentUser?.email || ''} disabled />
                </div>
                <div>
                  <Label htmlFor="specialization">{translations.specialization || 'Specialization'}</Label>
                  <Input id="specialization" placeholder={translations.specializationPlaceholder || 'e.g., Sports Nutrition, Clinical Nutrition'} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">{translations.phoneNumber || 'Phone Number'}</Label>
                  <Input id="phone" placeholder={translations.phoneNumberPlaceholder || '+1 (555) 123-4567'} />
                </div>
                <div>
                  <Label htmlFor="license">{translations.licenseNumber || 'License Number'}</Label>
                  <Input id="license" placeholder={translations.licenseNumberPlaceholder || 'RD123456'} />
                </div>
              </div>

              <div>
                <Label htmlFor="bio">{translations.bio || 'Bio'}</Label>
                <Textarea 
                  id="bio" 
                  rows={4} 
                  placeholder={translations.bioPlaceholder || 'Tell us about your experience and expertise...'}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline">{translations.cancel || 'Cancel'}</Button>
                <Button>{translations.saveChanges || 'Save Changes'}</Button>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

      </Tabs>
    </div>
  );
}
