import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { entities } from '@/api/client';
import { getMyProfile, getCompanyProfileIds } from '@/utils/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Dumbbell, 
  Plus, 
  Calendar, 
  TrendingUp, 
  Bell, 
  User, 
  Edit, 
  Trash2, 
  Eye,
  Play,
  Pause,
  BarChart3,
  Activity,
  Clock,
  Target,
  Award,
  CheckCircle2,
  XCircle,
  Filter,
  Search
} from 'lucide-react';

// Pre-built training plan templates
const TRAINING_PLAN_TEMPLATES = {
  beginnerStrength: {
    name: 'Beginner Strength Program',
    name_he: 'תוכנית כוח למתחילים',
    description: '4-week comprehensive strength program for beginners',
    description_he: 'תוכנית כוח מקיפה ל-4 שבועות למתחילים',
    goal: 'strength_training',
    difficulty_level: 'beginner',
    duration_weeks: 4,
    weekly_frequency: 3,
    plan_structure: {
      schedule: ['Monday', 'Wednesday', 'Friday'],
      days: [
        {
          name: 'Push Day',
          name_he: 'יום דחיפה',
          exercises: [
            { name: 'Barbell Bench Press', sets: 3, reps: 8, rest: 120, notes: 'Focus on form' },
            { name: 'Overhead Press', sets: 3, reps: 8, rest: 90, notes: 'Keep core tight' },
            { name: 'Incline Dumbbell Press', sets: 3, reps: 10, rest: 90, notes: '30-degree angle' },
            { name: 'Tricep Dips', sets: 3, reps: 10, rest: 60, notes: 'Can use assisted machine' },
          ]
        },
        {
          name: 'Pull Day',
          name_he: 'יום משיכה',
          exercises: [
            { name: 'Deadlift', sets: 3, reps: 6, rest: 180, notes: 'Maintain neutral spine' },
            { name: 'Pull-ups', sets: 3, reps: 8, rest: 90, notes: 'Use assistance if needed' },
            { name: 'Barbell Rows', sets: 3, reps: 8, rest: 90, notes: 'Pull to lower chest' },
            { name: 'Face Pulls', sets: 3, reps: 12, rest: 60, notes: 'External rotation' },
          ]
        },
        {
          name: 'Leg Day',
          name_he: 'יום רגליים',
          exercises: [
            { name: 'Barbell Squat', sets: 3, reps: 8, rest: 120, notes: 'Depth to parallel' },
            { name: 'Romanian Deadlift', sets: 3, reps: 10, rest: 90, notes: 'Feel hamstring stretch' },
            { name: 'Leg Press', sets: 3, reps: 12, rest: 90, notes: 'Full range of motion' },
            { name: 'Calf Raises', sets: 4, reps: 15, rest: 60, notes: 'Pause at top' },
          ]
        }
      ],
      progression: {
        week1_2: { sets: 3, notes: 'Foundation phase' },
        week3_4: { sets: 4, notes: 'Progressive overload' }
      }
    }
  }
};

const TrainingManagement = () => {
  const { translations, language } = useLanguage();
  const { clients } = useClient();
  const isRTL = language === 'he';
  const [activeTab, setActiveTab] = useState('plans');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Role-based access control
  const [userRole, setUserRole] = useState(null);
  const [allowedUserCodes, setAllowedUserCodes] = useState(new Set());

  // Training Plans State
  const [trainingPlans, setTrainingPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isCreatePlanDialogOpen, setIsCreatePlanDialogOpen] = useState(false);
  const [planFormData, setPlanFormData] = useState({
    user_code: '',
    plan_name: '',
    description: '',
    goal: 'strength_training',
    difficulty_level: 'beginner',
    duration_weeks: 4,
    weekly_frequency: 3,
    status: 'active',
    plan_structure: {},
    notes: ''
  });

  // Training Logs State
  const [trainingLogs, setTrainingLogs] = useState([]);
  const [selectedUserCode, setSelectedUserCode] = useState('all');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState([]);

  // Reminders State
  const [reminders, setReminders] = useState([]);

  // Load user profile and determine accessible clients
  useEffect(() => {
    loadUserRoleAndClients();
  }, [clients]);

  // Load data on mount
  useEffect(() => {
    if (allowedUserCodes.size > 0) {
      loadTrainingPlans();
      loadTrainingLogs();
      loadReminders();
    }
  }, [allowedUserCodes]);

  // Function to load user role and filter clients
  const loadUserRoleAndClients = async () => {
    try {
      // Fetch my profile to determine role and company
      const me = await getMyProfile();
      console.log('👤 User profile:', { role: me.role, company_id: me.company_id, id: me.id });
      
      setUserRole(me.role);

      let visibleClients = clients;

      if (me.role === "sys_admin") {
        // sys_admin: see everything
        console.log('🔓 Sys admin: showing all clients');
        visibleClients = clients;
      } else if (me.role === "company_manager") {
        // company_manager: see clients assigned to any employee in my company
        console.log('🏢 Company manager: filtering by company', me.company_id);
        const ids = await getCompanyProfileIds(me.company_id);
        console.log('👥 Company profile IDs:', ids);
        const idSet = new Set(ids);
        visibleClients = clients.filter(c => c.provider_id && idSet.has(c.provider_id));
        console.log('✅ Company manager filtered clients:', visibleClients.length);
      } else {
        // employee: only clients assigned directly to me
        console.log('👷 Employee: filtering by my ID', me.id);
        visibleClients = clients.filter(c => c.provider_id === me.id);
        console.log('✅ Employee filtered clients:', visibleClients.length);
      }

      // Create a set of allowed user_codes for quick lookup
      const allowedCodes = new Set(visibleClients.map(c => c.user_code));
      setAllowedUserCodes(allowedCodes);
      console.log('✅ Allowed user codes:', Array.from(allowedCodes));
    } catch (error) {
      console.error('❌ Error loading user role and clients:', error);
    }
  };

  // Load training plans (filtered by accessible clients)
  const loadTrainingPlans = async () => {
    try {
      setLoading(true);
      console.log('🏋️ Loading training plans for accessible clients...');
      const allPlans = await entities.TrainingPlans.getAll();
      
      // Filter to only show plans for clients this user can access
      const filteredPlans = allPlans.filter(plan => allowedUserCodes.has(plan.user_code));
      console.log('✅ Training plans loaded:', filteredPlans.length, 'of', allPlans.length, 'total plans');
      
      setTrainingPlans(filteredPlans);
    } catch (err) {
      console.error('❌ Error loading training plans:', err);
      setError('Failed to load training plans');
    } finally {
      setLoading(false);
    }
  };

  // Load training logs (filtered by accessible clients)
  const loadTrainingLogs = async () => {
    try {
      console.log('📊 Loading training logs for accessible clients...');
      const allLogs = await entities.TrainingLogs.getAll(100);
      
      // Filter to only show logs for clients this user can access
      const filteredLogs = allLogs.filter(log => allowedUserCodes.has(log.user_code));
      console.log('✅ Training logs loaded:', filteredLogs.length, 'of', allLogs.length, 'total logs');
      
      setTrainingLogs(filteredLogs);
    } catch (err) {
      console.error('❌ Error loading training logs:', err);
    }
  };

  // Load reminders (filtered by accessible clients)
  const loadReminders = async () => {
    try {
      console.log('🔔 Loading training reminders for accessible clients...');
      const allReminders = await entities.TrainingReminders.getPending();
      
      // Filter to only show reminders for clients this user can access
      const filteredReminders = allReminders.filter(reminder => allowedUserCodes.has(reminder.user_code));
      console.log('✅ Training reminders loaded:', filteredReminders.length, 'of', allReminders.length, 'total reminders');
      
      setReminders(filteredReminders);
    } catch (err) {
      console.error('❌ Error loading reminders:', err);
    }
  };

  // Get client name by user_code
  const getClientName = (userCode) => {
    const client = clients.find(c => c.user_code === userCode);
    return client?.full_name || client?.name || userCode;
  };

  // Handle create training plan
  const handleCreatePlan = async (useTemplate = null) => {
    try {
      setLoading(true);
      setError(null);

      let planData = { ...planFormData };

      // If using template, populate with template data
      if (useTemplate) {
        const template = TRAINING_PLAN_TEMPLATES[useTemplate];
        planData = {
          ...planFormData,
          plan_name: language === 'he' ? template.name_he : template.name,
          description: language === 'he' ? template.description_he : template.description,
          goal: template.goal,
          difficulty_level: template.difficulty_level,
          duration_weeks: template.duration_weeks,
          weekly_frequency: template.weekly_frequency,
          plan_structure: template.plan_structure
        };
      }

      // Set active dates
      const now = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (planData.duration_weeks * 7));

      planData.active_from = now.toISOString();
      planData.active_until = endDate.toISOString();

      // Get user_id from user_code
      const client = clients.find(c => c.user_code === planData.user_code);
      if (client?.id) {
        planData.user_id = client.id;
      }

      const newPlan = await entities.TrainingPlans.create(planData);
      
      setTrainingPlans([newPlan, ...trainingPlans]);
      setSuccess('Training plan created successfully!');
      setIsCreatePlanDialogOpen(false);
      
      // Reset form
      setPlanFormData({
        user_code: '',
        plan_name: '',
        description: '',
        goal: 'strength_training',
        difficulty_level: 'beginner',
        duration_weeks: 4,
        weekly_frequency: 3,
        status: 'active',
        plan_structure: {},
        notes: ''
      });

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error creating training plan:', err);
      setError(err.message || 'Failed to create training plan');
    } finally {
      setLoading(false);
    }
  };

  // Handle update plan status
  const handleUpdatePlanStatus = async (planId, newStatus) => {
    try {
      setLoading(true);
      const updatedPlan = await entities.TrainingPlans.update(planId, { status: newStatus });
      
      setTrainingPlans(trainingPlans.map(p => 
        p.id === planId ? updatedPlan : p
      ));
      
      setSuccess(`Plan status updated to ${newStatus}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating plan status:', err);
      setError('Failed to update plan status');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete plan
  const handleDeletePlan = async (planId) => {
    if (!confirm('Are you sure you want to delete this training plan?')) return;

    try {
      setLoading(true);
      await entities.TrainingPlans.delete(planId);
      
      setTrainingPlans(trainingPlans.filter(p => p.id !== planId));
      setSuccess('Training plan deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting plan:', err);
      setError('Failed to delete training plan');
    } finally {
      setLoading(false);
    }
  };

  // Filter training logs
  const filteredLogs = trainingLogs.filter(log => {
    if (selectedUserCode && selectedUserCode !== 'all' && log.user_code !== selectedUserCode) return false;
    if (dateFilter.start && log.session_date < dateFilter.start) return false;
    if (dateFilter.end && log.session_date > dateFilter.end) return false;
    return true;
  });

  return (
    <div className={`container mx-auto p-6 ${isRTL ? 'rtl' : 'ltr'}`}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Dumbbell className="h-8 w-8 text-primary" />
          {translations.trainingManagement}
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage client training plans, track progress, and monitor workout logs
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <Alert className="mb-4 bg-green-50 text-green-800 border-green-200">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert className="mb-4 bg-red-50 text-red-800 border-red-200">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            {translations.trainingPlans}
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {translations.trainingLogs}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {translations.trainingAnalytics}
          </TabsTrigger>
          <TabsTrigger value="reminders" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {translations.trainingReminders}
          </TabsTrigger>
        </TabsList>

        {/* Training Plans Tab */}
        <TabsContent value="plans" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">{translations.trainingPlans}</h2>
            <Dialog open={isCreatePlanDialogOpen} onOpenChange={setIsCreatePlanDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {translations.createTrainingPlan}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{translations.createTrainingPlan}</DialogTitle>
                  <DialogDescription>
                    Create a custom plan or use a pre-built template
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Template Selection */}
                  <div className="space-y-2">
                    <Label>{translations.selectTemplate}</Label>
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          const template = TRAINING_PLAN_TEMPLATES.beginnerStrength;
                          setPlanFormData({
                            ...planFormData,
                            plan_name: language === 'he' ? template.name_he : template.name,
                            description: language === 'he' ? template.description_he : template.description,
                            goal: template.goal,
                            difficulty_level: template.difficulty_level,
                            duration_weeks: template.duration_weeks,
                            weekly_frequency: template.weekly_frequency,
                            plan_structure: template.plan_structure
                          });
                        }}
                      >
                        <Award className="h-4 w-4 mr-2" />
                        {translations.beginnerStrengthProgram}
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-4">{translations.customizePlan}</h4>
                    
                    {/* Client Selection */}
                    <div className="space-y-2 mb-4">
                      <Label htmlFor="user_code">{translations.selectClient} *</Label>
                      <Select
                        value={planFormData.user_code}
                        onValueChange={(value) => setPlanFormData({ ...planFormData, user_code: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={translations.selectClient} />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map(client => (
                            <SelectItem key={client.user_code} value={client.user_code}>
                              {client.full_name || client.name} ({client.user_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Plan Name */}
                    <div className="space-y-2 mb-4">
                      <Label htmlFor="plan_name">{translations.planName} *</Label>
                      <Input
                        id="plan_name"
                        value={planFormData.plan_name}
                        onChange={(e) => setPlanFormData({ ...planFormData, plan_name: e.target.value })}
                        placeholder="e.g., 4-Week Strength Builder"
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-2 mb-4">
                      <Label htmlFor="description">{translations.planDescription}</Label>
                      <Textarea
                        id="description"
                        value={planFormData.description}
                        onChange={(e) => setPlanFormData({ ...planFormData, description: e.target.value })}
                        placeholder="Describe the plan goals and approach..."
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Goal */}
                      <div className="space-y-2">
                        <Label htmlFor="goal">{translations.planGoal}</Label>
                        <Select
                          value={planFormData.goal}
                          onValueChange={(value) => setPlanFormData({ ...planFormData, goal: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="strength_training">{translations.strengthTraining}</SelectItem>
                            <SelectItem value="muscle_building">{translations.muscleBuilding}</SelectItem>
                            <SelectItem value="weight_loss">{translations.weightLoss}</SelectItem>
                            <SelectItem value="endurance">{translations.endurance}</SelectItem>
                            <SelectItem value="general_fitness">{translations.generalFitness}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Difficulty */}
                      <div className="space-y-2">
                        <Label htmlFor="difficulty">{translations.difficultyLevel}</Label>
                        <Select
                          value={planFormData.difficulty_level}
                          onValueChange={(value) => setPlanFormData({ ...planFormData, difficulty_level: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="beginner">{translations.beginner}</SelectItem>
                            <SelectItem value="intermediate">{translations.intermediate}</SelectItem>
                            <SelectItem value="advanced">{translations.advanced}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Duration */}
                      <div className="space-y-2">
                        <Label htmlFor="duration_weeks">{translations.durationWeeks}</Label>
                        <Input
                          id="duration_weeks"
                          type="number"
                          min="1"
                          max="52"
                          value={planFormData.duration_weeks}
                          onChange={(e) => setPlanFormData({ ...planFormData, duration_weeks: parseInt(e.target.value) })}
                        />
                      </div>

                      {/* Weekly Frequency */}
                      <div className="space-y-2">
                        <Label htmlFor="weekly_frequency">{translations.weeklyFrequency}</Label>
                        <Input
                          id="weekly_frequency"
                          type="number"
                          min="1"
                          max="7"
                          value={planFormData.weekly_frequency}
                          onChange={(e) => setPlanFormData({ ...planFormData, weekly_frequency: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2 mt-4">
                      <Label htmlFor="notes">{translations.planNotes}</Label>
                      <Textarea
                        id="notes"
                        value={planFormData.notes}
                        onChange={(e) => setPlanFormData({ ...planFormData, notes: e.target.value })}
                        placeholder="Additional notes for the client..."
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreatePlanDialogOpen(false)}>
                    {translations.cancel}
                  </Button>
                  <Button 
                    onClick={() => handleCreatePlan()} 
                    disabled={!planFormData.user_code || !planFormData.plan_name || loading}
                  >
                    {loading ? 'Creating...' : translations.save}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Training Plans Table */}
          <Card>
            <CardContent className="pt-6">
              {trainingPlans.length === 0 ? (
                <div className="text-center py-12">
                  <Dumbbell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No training plans yet. Create one to get started!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{translations.client}</TableHead>
                      <TableHead>{translations.planName}</TableHead>
                      <TableHead>{translations.planGoal}</TableHead>
                      <TableHead>{translations.difficultyLevel}</TableHead>
                      <TableHead>{translations.durationWeeks}</TableHead>
                      <TableHead>{translations.planStatus}</TableHead>
                      <TableHead className="text-right">{translations.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainingPlans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-primary" />
                            {getClientName(plan.user_code)}
                          </div>
                        </TableCell>
                        <TableCell>{plan.plan_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {translations[plan.goal?.replace(/_/g, '')] || plan.goal}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              plan.difficulty_level === 'beginner' ? 'default' :
                              plan.difficulty_level === 'intermediate' ? 'secondary' :
                              'destructive'
                            }
                          >
                            {translations[plan.difficulty_level] || plan.difficulty_level}
                          </Badge>
                        </TableCell>
                        <TableCell>{plan.duration_weeks} weeks</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              plan.status === 'active' ? 'default' :
                              plan.status === 'completed' ? 'secondary' :
                              plan.status === 'paused' ? 'outline' :
                              'destructive'
                            }
                          >
                            {translations[plan.status + 'Plan'] || plan.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedPlan(plan)}
                              title={translations.viewTrainingPlan}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {plan.status === 'active' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUpdatePlanStatus(plan.id, 'paused')}
                                title={translations.deactivateTrainingPlan}
                              >
                                <Pause className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUpdatePlanStatus(plan.id, 'active')}
                                title={translations.activateTrainingPlan}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePlan(plan.id)}
                              title={translations.deleteTrainingPlan}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Training Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">{translations.trainingLogs}</h2>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="filter-client">{translations.client}</Label>
                  <Select value={selectedUserCode} onValueChange={setSelectedUserCode}>
                    <SelectTrigger id="filter-client">
                      <SelectValue placeholder="All clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All clients</SelectItem>
                      {clients.map(client => (
                        <SelectItem key={client.user_code} value={client.user_code}>
                          {client.full_name || client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="date-start">{translations.startDate}</Label>
                  <Input
                    id="date-start"
                    type="date"
                    value={dateFilter.start}
                    onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="date-end">{translations.endDate}</Label>
                  <Input
                    id="date-end"
                    type="date"
                    value={dateFilter.end}
                    onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedUserCode('all');
                    setDateFilter({ start: '', end: '' });
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Training Logs List */}
          <Card>
            <CardContent className="pt-6">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{translations.noTrainingLogs}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredLogs.map((log) => (
                    <Card key={log.id} className="border">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {getClientName(log.user_code)}
                            </CardTitle>
                            <CardDescription>
                              <div className="flex items-center gap-2 mt-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(log.session_date).toLocaleDateString()}
                                {log.session_duration_minutes && (
                                  <>
                                    <Clock className="h-3 w-3 ml-2" />
                                    {log.session_duration_minutes} min
                                  </>
                                )}
                              </div>
                            </CardDescription>
                          </div>
                          {log.perceived_exertion && (
                            <Badge variant="outline">
                              Effort: {log.perceived_exertion}/10
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Exercises */}
                        {log.exercises_logged && Array.isArray(log.exercises_logged) && (
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm">{translations.exercisesLogged}:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {log.exercises_logged.map((exercise, idx) => (
                                <div key={idx} className="bg-muted/50 p-3 rounded-md">
                                  <div className="font-medium">{exercise.name || exercise.exercise_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {exercise.sets?.length || 0} sets
                                    {exercise.sets && exercise.sets.length > 0 && (
                                      <span className="ml-2">
                                        ({exercise.sets.map(s => `${s.reps}×${s.weight}kg`).join(', ')})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {log.notes && (
                          <div className="mt-4 p-3 bg-muted/30 rounded-md">
                            <p className="text-sm">{log.notes}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {translations.progressOverview}
              </CardTitle>
              <CardDescription>
                Track client progress and workout consistency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Analytics dashboard coming soon. Track volume, strength progression, and consistency metrics.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                {translations.trainingReminders}
              </CardTitle>
              <CardDescription>
                Manage workout reminders for clients
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reminders.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No pending reminders</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{translations.client}</TableHead>
                      <TableHead>{translations.reminderContent}</TableHead>
                      <TableHead>{translations.scheduledFor}</TableHead>
                      <TableHead>{translations.status}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reminders.map((reminder) => (
                      <TableRow key={reminder.id}>
                        <TableCell>{getClientName(reminder.user_code)}</TableCell>
                        <TableCell>{reminder.reminder_content}</TableCell>
                        <TableCell>
                          {new Date(reminder.scheduled_for).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            reminder.status === 'sent' ? 'secondary' :
                            reminder.status === 'pending' ? 'default' :
                            reminder.status === 'failed' ? 'destructive' :
                            'outline'
                          }>
                            {translations['reminder' + reminder.status.charAt(0).toUpperCase() + reminder.status.slice(1)] || reminder.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Plan Details Dialog */}
      {selectedPlan && (
        <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedPlan.plan_name}</DialogTitle>
              <DialogDescription>
                {getClientName(selectedPlan.user_code)} • {selectedPlan.duration_weeks} weeks • {selectedPlan.weekly_frequency}x per week
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Plan Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{translations.planGoal}</Label>
                  <p className="font-medium">{translations[selectedPlan.goal?.replace(/_/g, '')] || selectedPlan.goal}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{translations.difficultyLevel}</Label>
                  <p className="font-medium">{translations[selectedPlan.difficulty_level] || selectedPlan.difficulty_level}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{translations.activeFrom}</Label>
                  <p className="font-medium">{new Date(selectedPlan.active_from).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{translations.activeUntil}</Label>
                  <p className="font-medium">{new Date(selectedPlan.active_until).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Description */}
              {selectedPlan.description && (
                <div>
                  <Label className="text-muted-foreground">{translations.planDescription}</Label>
                  <p className="mt-1">{selectedPlan.description}</p>
                </div>
              )}

              {/* Plan Structure */}
              {selectedPlan.plan_structure?.days && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">{translations.planStructure}</Label>
                  <div className="space-y-4">
                    {selectedPlan.plan_structure.days.map((day, idx) => (
                      <Card key={idx}>
                        <CardHeader>
                          <CardTitle className="text-base">
                            {language === 'he' ? day.name_he : day.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Exercise</TableHead>
                                <TableHead className="text-center">Sets</TableHead>
                                <TableHead className="text-center">Reps</TableHead>
                                <TableHead className="text-center">Rest (s)</TableHead>
                                <TableHead>Notes</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {day.exercises?.map((exercise, exIdx) => (
                                <TableRow key={exIdx}>
                                  <TableCell className="font-medium">{exercise.name}</TableCell>
                                  <TableCell className="text-center">{exercise.sets}</TableCell>
                                  <TableCell className="text-center">{exercise.reps}</TableCell>
                                  <TableCell className="text-center">{exercise.rest}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{exercise.notes}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedPlan.notes && (
                <div>
                  <Label className="text-muted-foreground">{translations.planNotes}</Label>
                  <p className="mt-1">{selectedPlan.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPlan(null)}>
                {translations.close || 'Close'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default TrainingManagement;

