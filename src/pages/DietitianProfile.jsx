import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
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
  Eye
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

export default function DietitianProfile() {
  const { translations, language, dir } = useLanguage();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('messages');
  const [messages, setMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadCurrentUser();
    loadMessages();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [messages, searchTerm, filterType, filterPriority, filterStatus]);

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
      alert('Failed to load messages');
    } finally {
      setIsLoading(false);
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

    // Status filter
    if (filterStatus !== 'all') {
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
      loadMessages();
    } catch (error) {
      console.error('Error toggling message status:', error);
      alert('Failed to update message status');
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
  const recentMessages = activeMessages.slice(0, 5);

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
            Active
          </Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{translations.totalMessages || 'Total Messages'}</p>
                <p className="text-2xl font-bold">{messages.length}</p>
              </div>
              <Megaphone className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{translations.activeMessages || 'Active Messages'}</p>
                <p className="text-2xl font-bold text-green-600">{activeMessages.length}</p>
              </div>
              <Bell className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{translations.urgentMessages || 'Urgent'}</p>
                <p className="text-2xl font-bold text-red-600">{urgentMessages.length}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{translations.thisWeek || 'This Week'}</p>
                <p className="text-2xl font-bold">{recentMessages.length}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="messages" className="flex items-center space-x-2">
            <Megaphone className="h-4 w-4" />
            <span>{translations.systemMessages || 'System Messages'}</span>
            {urgentMessages.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {urgentMessages.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center space-x-2">
            <User className="h-4 w-4" />
            <span>{translations.profileSettings || 'Profile Settings'}</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center space-x-2">
            <Bell className="h-4 w-4" />
            <span>{translations.notifications || 'Notifications'}</span>
          </TabsTrigger>
        </TabsList>

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
              {recentMessages.length === 0 ? (
                <div className="text-center py-8">
                  <Megaphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">{translations.noRecentMessages || 'No recent messages'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentMessages.map((message) => (
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
              <div>
                <CardTitle>{translations.systemMessages || 'System Messages'}</CardTitle>
                <CardDescription>{translations.viewAndManageMessages || 'View and manage system messages from external systems'}</CardDescription>
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
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{translations.allStatus || 'All Status'}</SelectItem>
                        <SelectItem value="active">{translations.active || 'Active'}</SelectItem>
                        <SelectItem value="inactive">{translations.inactive || 'Inactive'}</SelectItem>
                      </SelectContent>
                    </Select>
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
                        <TableRow key={message.id}>
                          <TableCell>
                            <Switch
                              checked={message.is_active}
                              onCheckedChange={() => toggleActive(message)}
                            />
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

          <Card>
            <CardHeader>
              <CardTitle>{translations.accountSettings || 'Account Settings'}</CardTitle>
              <CardDescription>{translations.securityAndPrivacyPreferences || 'Security and privacy preferences'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{translations.twoFactorAuthentication || 'Two-Factor Authentication'}</h4>
                  <p className="text-sm text-gray-600">{translations.addExtraLayerOfSecurity || 'Add an extra layer of security to your account'}</p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{translations.emailNotifications || 'Email Notifications'}</h4>
                  <p className="text-sm text-gray-600">{translations.receiveEmailUpdates || 'Receive email updates about system messages'}</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{translations.profileVisibility || 'Profile Visibility'}</h4>
                  <p className="text-sm text-gray-600">{translations.allowOtherDietitiansToSeeProfile || 'Allow other dietitians to see your profile'}</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{translations.notificationPreferences || 'Notification Preferences'}</CardTitle>
              <CardDescription>{translations.chooseNotificationSettings || 'Choose how you want to be notified about system updates'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{translations.urgentMessageNotifications || 'Urgent Messages'}</h4>
                  <p className="text-sm text-gray-600">{translations.getImmediateNotifications || 'Get immediate notifications for urgent system messages'}</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{translations.systemMaintenance || 'System Maintenance'}</h4>
                  <p className="text-sm text-gray-600">{translations.maintenanceNotifications || 'Notifications about scheduled maintenance windows'}</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{translations.newFeatures || 'New Features'}</h4>
                  <p className="text-sm text-gray-600">{translations.newFeatureUpdates || 'Updates about new platform features and improvements'}</p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{translations.weeklyDigest || 'Weekly Digest'}</h4>
                  <p className="text-sm text-gray-600">{translations.weeklySummary || 'Weekly summary of all system messages and updates'}</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
