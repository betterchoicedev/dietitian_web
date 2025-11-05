import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { entities } from '@/api/client';
import { ExerciseLibrary, TrainingPlanTemplates } from '@/api/entities';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Search,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Copy,
  Layers
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
    notes: '',
    active_from: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD
    active_until: ''
  });

  // Training Logs State
  const [trainingLogs, setTrainingLogs] = useState([]);
  const [selectedUserCode, setSelectedUserCode] = useState('all');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState([]);

  // Reminders State
  const [reminders, setReminders] = useState([]);
  
  // Exercise Library State
  const [exercises, setExercises] = useState([]);
  const [exerciseSearchTerm, setExerciseSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filteredExercises, setFilteredExercises] = useState([]);
  
  // Plan Builder State
  const [isPlanBuilderOpen, setIsPlanBuilderOpen] = useState(false);
  const [builderWeeks, setBuilderWeeks] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [currentDay, setCurrentDay] = useState(0);
  const [expandedWeeks, setExpandedWeeks] = useState(new Set([0]));
  const [expandedDays, setExpandedDays] = useState(new Set([0]));
  
  // Template State
  const [templates, setTemplates] = useState([]);
  const [myTemplates, setMyTemplates] = useState([]);
  const [publicTemplates, setPublicTemplates] = useState([]);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isSaveTemplateDialogOpen, setIsSaveTemplateDialogOpen] = useState(false);
  const [templateFormData, setTemplateFormData] = useState({
    template_name: '',
    template_name_he: '',
    description: '',
    description_he: '',
    goal: 'strength_training',
    difficulty_level: 'beginner',
    is_public: false,
    estimated_session_duration_minutes: 60,
    tags: [],
    notes: ''
  });
  
  // Exercise Management State
  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState('');
  const [primaryMuscleSearch, setPrimaryMuscleSearch] = useState('');
  const [secondaryMuscleSearch, setSecondaryMuscleSearch] = useState('');
  const [exerciseFormData, setExerciseFormData] = useState({
    exercise_name: '',
    exercise_name_he: '',
    category: 'chest',
    equipment_needed: [],
    muscle_groups_primary: [],
    muscle_groups_secondary: [],
    description: '',
    description_he: '',
    difficulty_level: 'beginner',
    video_url: '',
    image_url: '',
    common_mistakes: '',
    safety_tips: '',
    alternative_exercises: []
  });
  
  // Ref to prevent adjustBuilderStructure from running when loading a template
  const isLoadingTemplate = useRef(false);

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
  
  // Load exercise library
  useEffect(() => {
    loadExerciseLibrary();
  }, []);
  
  // Filter exercises when search term or category changes
  useEffect(() => {
    filterExercises();
  }, [exerciseSearchTerm, selectedCategory, exercises]);
  
  // Load templates
  useEffect(() => {
    loadTemplates();
  }, []);
  
  // Adjust builder structure when duration or frequency changes (but not on initial template load)
  useEffect(() => {
    if (builderWeeks.length === 0) return; // No template loaded yet
    if (isLoadingTemplate.current) {
      isLoadingTemplate.current = false; // Reset flag
      return; // Skip adjustment when loading template
    }
    
    adjustBuilderStructure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planFormData.duration_weeks, planFormData.weekly_frequency]);
  
  // Auto-calculate active_until when active_from or duration changes
  useEffect(() => {
    if (planFormData.active_from && planFormData.duration_weeks) {
      const startDate = new Date(planFormData.active_from);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (planFormData.duration_weeks * 7));
      
      const calculatedUntil = endDate.toISOString().split('T')[0];
      
      // Only update if different to prevent loops
      if (calculatedUntil !== planFormData.active_until) {
        setPlanFormData(prev => ({ ...prev, active_until: calculatedUntil }));
      }
    }
  }, [planFormData.active_from, planFormData.duration_weeks]);

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

  // Load exercise library
  const loadExerciseLibrary = async () => {
    try {
      console.log('💪 Loading exercise library...');
      const exerciseData = await ExerciseLibrary.getAll();
      setExercises(exerciseData);
      setFilteredExercises(exerciseData);
      console.log('✅ Loaded exercises:', exerciseData.length);
    } catch (err) {
      console.error('❌ Error loading exercise library:', err);
    }
  };
  
  // Filter exercises based on search and category
  const filterExercises = () => {
    let filtered = exercises;
    
    // Filter by category
    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter(ex => ex.category === selectedCategory);
    }
    
    // Filter by search term
    if (exerciseSearchTerm) {
      const searchLower = exerciseSearchTerm.toLowerCase();
      filtered = filtered.filter(ex => 
        ex.exercise_name?.toLowerCase().includes(searchLower) ||
        ex.exercise_name_he?.toLowerCase().includes(searchLower) ||
        ex.description?.toLowerCase().includes(searchLower) ||
        ex.muscle_groups_primary?.some(mg => mg.toLowerCase().includes(searchLower))
      );
    }
    
    setFilteredExercises(filtered);
  };
  
  // Initialize plan builder with empty weeks
  const initializePlanBuilder = () => {
    const weeks = [];
    for (let w = 0; w < planFormData.duration_weeks; w++) {
      const days = [];
      for (let d = 0; d < planFormData.weekly_frequency; d++) {
        days.push({
          day_number: d + 1,
          day_name: `${translations.day} ${d + 1}`,
          exercises: []
        });
      }
      weeks.push({
        week_number: w + 1,
        focus: '',
        days: days
      });
    }
    setBuilderWeeks(weeks);
    setExpandedWeeks(new Set([0]));
    setExpandedDays(new Set([0]));
  };
  
  // Add exercise to a specific day
  const addExerciseToDayInBuilder = (weekIdx, dayIdx, exercise) => {
    const newWeeks = JSON.parse(JSON.stringify(builderWeeks));
    const exercisesInDay = newWeeks[weekIdx].days[dayIdx].exercises;
    
    newWeeks[weekIdx].days[dayIdx].exercises.push({
      exercise_name: exercise.exercise_name,
      sets: 3,
      reps: '8-10',
      rest_seconds: 90,
      notes: '',
      order: exercisesInDay.length + 1,
      target_weight_kg: null
    });
    
    setBuilderWeeks(newWeeks);
  };
  
  // Update exercise in builder
  const updateExerciseInBuilder = (weekIdx, dayIdx, exIdx, field, value) => {
    const newWeeks = JSON.parse(JSON.stringify(builderWeeks));
    newWeeks[weekIdx].days[dayIdx].exercises[exIdx][field] = value;
    setBuilderWeeks(newWeeks);
  };
  
  // Remove exercise from builder
  const removeExerciseFromBuilder = (weekIdx, dayIdx, exIdx) => {
    const newWeeks = JSON.parse(JSON.stringify(builderWeeks));
    newWeeks[weekIdx].days[dayIdx].exercises.splice(exIdx, 1);
    // Reorder remaining exercises
    newWeeks[weekIdx].days[dayIdx].exercises.forEach((ex, idx) => {
      ex.order = idx + 1;
    });
    setBuilderWeeks(newWeeks);
  };
  
  // Update week focus
  const updateWeekFocus = (weekIdx, focus) => {
    const newWeeks = JSON.parse(JSON.stringify(builderWeeks));
    newWeeks[weekIdx].focus = focus;
    setBuilderWeeks(newWeeks);
  };
  
  // Update day name
  const updateDayName = (weekIdx, dayIdx, name) => {
    const newWeeks = JSON.parse(JSON.stringify(builderWeeks));
    newWeeks[weekIdx].days[dayIdx].day_name = name;
    setBuilderWeeks(newWeeks);
  };
  
  // Copy week to another week
  const copyWeekToAnother = (fromWeekIdx, toWeekIdx) => {
    const newWeeks = JSON.parse(JSON.stringify(builderWeeks));
    const copiedDays = JSON.parse(JSON.stringify(newWeeks[fromWeekIdx].days));
    newWeeks[toWeekIdx].days = copiedDays;
    setBuilderWeeks(newWeeks);
  };
  
  // Toggle week expansion
  const toggleWeekExpansion = (weekIdx) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekIdx)) {
      newExpanded.delete(weekIdx);
    } else {
      newExpanded.add(weekIdx);
    }
    setExpandedWeeks(newExpanded);
  };
  
  // Toggle day expansion
  const toggleDayExpansion = (dayIdx) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(dayIdx)) {
      newExpanded.delete(dayIdx);
    } else {
      newExpanded.add(dayIdx);
    }
    setExpandedDays(newExpanded);
  };
  
  // Adjust builder structure to match duration and frequency
  const adjustBuilderStructure = () => {
    const targetWeeks = planFormData.duration_weeks;
    const targetDaysPerWeek = planFormData.weekly_frequency;
    
    if (!builderWeeks.length) return;
    
    const newWeeks = [];
    
    for (let w = 0; w < targetWeeks; w++) {
      // Use existing week if available
      const sourceWeek = builderWeeks[w];
      
      if (sourceWeek) {
        // Week exists in template - adjust days
        const newDays = [];
        for (let d = 0; d < targetDaysPerWeek; d++) {
          const sourceDay = sourceWeek.days?.[d];
          
          if (sourceDay) {
            // Day exists - keep it
            newDays.push({
              day_number: d + 1,
              day_name: sourceDay.day_name || '',
              exercises: [...(sourceDay.exercises || [])]
            });
          } else {
            // Day doesn't exist - create empty
            newDays.push({
              day_number: d + 1,
              day_name: '',
              exercises: []
            });
          }
        }
        
        newWeeks.push({
          week_number: w + 1,
          focus: sourceWeek.focus || '',
          days: newDays
        });
      } else {
        // Week doesn't exist in template - create empty week with empty days
        const emptyDays = [];
        for (let d = 0; d < targetDaysPerWeek; d++) {
          emptyDays.push({
            day_number: d + 1,
            day_name: '',
            exercises: []
          });
        }
        
        newWeeks.push({
          week_number: w + 1,
          focus: '',
          days: emptyDays
        });
      }
    }
    
    setBuilderWeeks(newWeeks);
  };
  
  // ============ TEMPLATE FUNCTIONS ============
  
  // Load templates
  const loadTemplates = async () => {
    try {
      const [own, publicTemps] = await Promise.all([
        TrainingPlanTemplates.getOwn(),
        TrainingPlanTemplates.getPublic()
      ]);
      
      setMyTemplates(own || []);
      setPublicTemplates(publicTemps || []);
      setTemplates([...(own || []), ...(publicTemps || [])]);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };
  
  // Detect if text is Hebrew
  const isHebrew = (text) => {
    if (!text) return false;
    // Check if text contains Hebrew characters
    const hebrewRegex = /[\u0590-\u05FF]/;
    return hebrewRegex.test(text);
  };
  
  // Translate text using backend API
  const translateText = async (text, targetLang) => {
    try {
      const response = await fetch('https://dietitian-be.azurewebsites.net/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang })
      });
      const data = await response.json();
      return data.translatedText || text;
    } catch (err) {
      console.error('Translation error:', err);
      return text; // Return original if translation fails
    }
  };
  
  // Handle template name change (no translation on every keystroke)
  const handleTemplateNameChange = (value) => {
    const isHeb = isHebrew(value);
    
    if (isHeb) {
      // Hebrew input - only update Hebrew field
      setTemplateFormData(prev => ({ ...prev, template_name_he: value }));
    } else {
      // English input - only update English field
      setTemplateFormData(prev => ({ ...prev, template_name: value }));
    }
  };
  
  // Handle template name blur (translate when user leaves the field)
  const handleTemplateNameBlur = async () => {
    const value = language === 'he' ? templateFormData.template_name_he : templateFormData.template_name;
    if (!value || value.trim() === '') return;
    
    const isHeb = isHebrew(value);
    
    try {
      if (isHeb) {
        // Hebrew input, always translate to English
        const translated = await translateText(value, 'en');
        setTemplateFormData(prev => ({ ...prev, template_name: translated }));
      } else {
        // English input, always translate to Hebrew
        const translated = await translateText(value, 'he');
        setTemplateFormData(prev => ({ ...prev, template_name_he: translated }));
      }
    } catch (err) {
      console.error('Translation error:', err);
    }
  };
  
  // Handle template description change (no translation on every keystroke)
  const handleTemplateDescriptionChange = (value) => {
    const isHeb = isHebrew(value);
    
    if (isHeb) {
      // Hebrew input - only update Hebrew field
      setTemplateFormData(prev => ({ ...prev, description_he: value }));
    } else {
      // English input - only update English field
      setTemplateFormData(prev => ({ ...prev, description: value }));
    }
  };
  
  // Handle template description blur (translate when user leaves the field)
  const handleTemplateDescriptionBlur = async () => {
    const value = language === 'he' ? templateFormData.description_he : templateFormData.description;
    if (!value || value.trim() === '') return;
    
    const isHeb = isHebrew(value);
    
    try {
      if (isHeb) {
        // Hebrew input, always translate to English
        const translated = await translateText(value, 'en');
        setTemplateFormData(prev => ({ ...prev, description: translated }));
      } else {
        // English input, always translate to Hebrew
        const translated = await translateText(value, 'he');
        setTemplateFormData(prev => ({ ...prev, description_he: translated }));
      }
    } catch (err) {
      console.error('Translation error:', err);
    }
  };
  
  // ============ EXERCISE MANAGEMENT FUNCTIONS ============
  
  // Handle exercise name change
  const handleExerciseNameChange = (value) => {
    const isHeb = isHebrew(value);
    
    if (isHeb) {
      setExerciseFormData(prev => ({ ...prev, exercise_name_he: value }));
    } else {
      setExerciseFormData(prev => ({ ...prev, exercise_name: value }));
    }
  };
  
  // Handle exercise name blur (translate)
  const handleExerciseNameBlur = async () => {
    const value = language === 'he' ? exerciseFormData.exercise_name_he : exerciseFormData.exercise_name;
    if (!value || value.trim() === '') return;
    
    const isHeb = isHebrew(value);
    
    try {
      if (isHeb) {
        const translated = await translateText(value, 'en');
        setExerciseFormData(prev => ({ ...prev, exercise_name: translated }));
      } else {
        const translated = await translateText(value, 'he');
        setExerciseFormData(prev => ({ ...prev, exercise_name_he: translated }));
      }
    } catch (err) {
      console.error('Translation error:', err);
    }
  };
  
  // Handle exercise description change
  const handleExerciseDescriptionChange = (value) => {
    const isHeb = isHebrew(value);
    
    if (isHeb) {
      setExerciseFormData(prev => ({ ...prev, description_he: value }));
    } else {
      setExerciseFormData(prev => ({ ...prev, description: value }));
    }
  };
  
  // Handle exercise description blur (translate)
  const handleExerciseDescriptionBlur = async () => {
    const value = language === 'he' ? exerciseFormData.description_he : exerciseFormData.description;
    if (!value || value.trim() === '') return;
    
    const isHeb = isHebrew(value);
    
    try {
      if (isHeb) {
        const translated = await translateText(value, 'en');
        setExerciseFormData(prev => ({ ...prev, description: translated }));
      } else {
        const translated = await translateText(value, 'he');
        setExerciseFormData(prev => ({ ...prev, description_he: translated }));
      }
    } catch (err) {
      console.error('Translation error:', err);
    }
  };
  
  // Save new exercise
  const handleSaveExercise = async () => {
    try {
      if (!exerciseFormData.exercise_name.trim() && !exerciseFormData.exercise_name_he.trim()) {
        setError(translations.exerciseNameRequired || 'Exercise name is required');
        return;
      }
      
      setLoading(true);
      
      const newExercise = await ExerciseLibrary.create(exerciseFormData);
      
      setExercises([newExercise, ...exercises]);
      setSuccess(translations.exerciseSaved || 'Exercise saved successfully!');
      setIsAddExerciseDialogOpen(false);
      
      // Reset form
      setExerciseFormData({
        exercise_name: '',
        exercise_name_he: '',
        category: 'chest',
        equipment_needed: [],
        muscle_groups_primary: [],
        muscle_groups_secondary: [],
        description: '',
        description_he: '',
        difficulty_level: 'beginner',
        video_url: '',
        image_url: '',
        common_mistakes: '',
        safety_tips: '',
        alternative_exercises: []
      });
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving exercise:', err);
      setError(err.message || 'Failed to save exercise');
    } finally {
      setLoading(false);
    }
  };
  
  // ============ END EXERCISE MANAGEMENT FUNCTIONS ============
  
  // Save current plan as template
  const handleSaveAsTemplate = async () => {
    try {
      if (!templateFormData.template_name.trim() && !templateFormData.template_name_he.trim()) {
        setError(translations.templateNameRequired || 'Template name is required');
        return;
      }
      
      setLoading(true);
      
      const templateData = {
        ...templateFormData,
        plan_structure: { weeks: builderWeeks },
        duration_weeks: planFormData.duration_weeks,
        weekly_frequency: planFormData.weekly_frequency
      };
      
      await TrainingPlanTemplates.create(templateData);
      
      setSuccess(translations.templateSaved || 'Template saved successfully!');
      setIsSaveTemplateDialogOpen(false);
      
      // Reset template form
      setTemplateFormData({
        template_name: '',
        template_name_he: '',
        description: '',
        description_he: '',
        goal: 'strength_training',
        difficulty_level: 'beginner',
        is_public: false,
        estimated_session_duration_minutes: 60,
        tags: [],
        notes: ''
      });
      
      // Reload templates
      await loadTemplates();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving template:', err);
      setError(err.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };
  
  // Load template into plan builder
  const handleLoadTemplate = async (template) => {
    if (!confirm(`${translations.loadTemplateWarning || 'This will replace your current plan. Continue?'}`)) {
      return;
    }
    
    try {
      // Increment usage count
      await TrainingPlanTemplates.incrementUsage(template.id);
      
      // Load template structure into builder
      const templateWeeks = template.plan_structure?.weeks || [];
      setBuilderWeeks(JSON.parse(JSON.stringify(templateWeeks)));
      
      // Update plan form data
      setPlanFormData({
          ...planFormData,
        goal: template.goal || 'strength_training',
        difficulty_level: template.difficulty_level || 'beginner',
        duration_weeks: template.duration_weeks || 4,
        weekly_frequency: template.weekly_frequency || 3,
        notes: template.notes || ''
      });
      
      setIsTemplateDialogOpen(false);
      setSuccess('Template loaded successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error loading template:', err);
      setError('Failed to load template');
    }
  };
  
  // Delete template
  const handleDeleteTemplate = async (templateId) => {
    if (!confirm(translations.deleteTemplateConfirm || 'Delete this template?')) {
      return;
    }
    
    try {
      setLoading(true);
      await TrainingPlanTemplates.delete(templateId);
      
      setSuccess(translations.templateDeleted || 'Template deleted successfully!');
      await loadTemplates();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting template:', err);
      setError('Failed to delete template');
    } finally {
      setLoading(false);
    }
  };
  
  // Toggle template public/private
  const handleToggleTemplatePublic = async (template) => {
    try {
      setLoading(true);
      await TrainingPlanTemplates.update(template.id, {
        is_public: !template.is_public
      });
      
      setSuccess(`Template is now ${!template.is_public ? 'public' : 'private'}`);
      await loadTemplates();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error toggling template visibility:', err);
      setError('Failed to update template');
    } finally {
      setLoading(false);
    }
  };
  
  // ============ END TEMPLATE FUNCTIONS ============

  // Open plan builder
  const openPlanBuilder = (useTemplate = null) => {
    // Check if we already have weeks loaded from template selection
    if (builderWeeks.length > 0) {
      // Already have template structure loaded, just open the builder
      console.log('✅ Opening builder with existing template structure');
    } else {
      // No template loaded, initialize empty structure
      initializePlanBuilder();
    }
    
    setIsCreatePlanDialogOpen(false);
    setIsPlanBuilderOpen(true);
  };
  
  // Save plan from builder
  const savePlanFromBuilder = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate required fields
      if (!planFormData.user_code || !planFormData.plan_name || !planFormData.active_from) {
        setError(translations.pleaseFillAllFields || 'Please fill in all required fields (Client, Plan Name, and Start Date)');
        return;
      }

      // Get user_id from user_code
      const client = clients.find(c => c.user_code === planFormData.user_code);
      
      const planData = {
        ...planFormData,
        plan_structure: { weeks: builderWeeks },
        user_id: client?.id || null
      };

      const newPlan = await entities.TrainingPlans.create(planData);
      
      setTrainingPlans([newPlan, ...trainingPlans]);
      setSuccess(translations.success || 'Training plan created successfully!');
      setIsPlanBuilderOpen(false);
      setBuilderWeeks([]);
      
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
        notes: '',
        active_from: new Date().toISOString().split('T')[0],
        active_until: ''
      });

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error creating training plan:', err);
      setError(err.message || 'Failed to create training plan');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle create training plan (legacy - for backward compatibility)
  const handleCreatePlan = async (useTemplate = null) => {
    // Redirect to plan builder
    openPlanBuilder(useTemplate);
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
                    <Label htmlFor="select_template">{translations.selectTemplate}</Label>
                    <Select
                      onValueChange={(templateId) => {
                        const template = templates.find(t => t.id === templateId);
                        if (template) {
                          isLoadingTemplate.current = true; // Set flag to prevent auto-adjust
                          
                          setPlanFormData({
                            ...planFormData,
                            plan_name: language === 'he' && template.template_name_he 
                              ? template.template_name_he 
                              : template.template_name,
                            description: language === 'he' && template.description_he 
                              ? template.description_he 
                              : template.description,
                            goal: template.goal || 'strength_training',
                            difficulty_level: template.difficulty_level || 'beginner',
                            duration_weeks: template.duration_weeks || 4,
                            weekly_frequency: template.weekly_frequency || 3
                          });
                          // Load template structure into builder
                          const templateWeeks = template.plan_structure?.weeks || [];
                          setBuilderWeeks(JSON.parse(JSON.stringify(templateWeeks)));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translations.selectTemplate} />
                      </SelectTrigger>
                      <SelectContent>
                        {myTemplates.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                              {translations.myTemplates}
                    </div>
                            {myTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                <div className="flex items-center gap-2">
                                  <Award className="h-3 w-3" />
                                  {language === 'he' && template.template_name_he 
                                    ? template.template_name_he 
                                    : template.template_name}
                                  <span className="text-xs text-gray-500">
                                    ({template.duration_weeks}w • {template.weekly_frequency}x)
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {publicTemplates.length > 0 && (
                          <>
                            {myTemplates.length > 0 && (
                              <div className="border-t my-1"></div>
                            )}
                            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                              {translations.publicTemplates}
                            </div>
                            {publicTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                <div className="flex items-center gap-2">
                                  <Award className="h-3 w-3" />
                                  {language === 'he' && template.template_name_he 
                                    ? template.template_name_he 
                                    : template.template_name}
                                  <span className="text-xs text-gray-500">
                                    ({template.duration_weeks}w • {template.weekly_frequency}x)
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {myTemplates.length === 0 && publicTemplates.length === 0 && (
                          <div className="px-2 py-6 text-center text-sm text-gray-500">
                            {translations.noTemplatesFound}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
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
                    
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      {/* Active From */}
                      <div className="space-y-2">
                        <Label htmlFor="active_from">{translations.activeFrom} *</Label>
                        <Input
                          id="active_from"
                          type="date"
                          value={planFormData.active_from}
                          onChange={(e) => setPlanFormData({ ...planFormData, active_from: e.target.value })}
                        />
                      </div>
                      
                      {/* Active Until - Read Only */}
                      <div className="space-y-2">
                        <Label htmlFor="active_until">{translations.activeUntil}</Label>
                        <Input
                          id="active_until"
                          type="date"
                          value={planFormData.active_until}
                          disabled
                          className="bg-gray-100 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500">
                          {translations.autoCalculated || 'Auto-calculated based on start date and duration'}
                        </p>
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
                    onClick={() => openPlanBuilder()} 
                    disabled={!planFormData.user_code || !planFormData.plan_name}
                  >
                    {translations.buildPlan || 'Build Plan'}
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

              {/* Plan Structure - Weeks format */}
              {selectedPlan.plan_structure?.weeks && Array.isArray(selectedPlan.plan_structure.weeks) && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">{translations.planStructure}</Label>
                  <div className="space-y-4">
                    {selectedPlan.plan_structure.weeks.map((week, weekIdx) => (
                      <div key={weekIdx} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                        <h4 className="font-semibold text-blue-800 mb-3">
                          {translations.week || 'Week'} {week.week_number}
                          {week.focus && <span className="text-sm font-normal text-blue-600 ml-2">- {week.focus}</span>}
                        </h4>
                        <div className="space-y-3">
                          {week.days?.map((day, dayIdx) => (
                            <Card key={dayIdx}>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">
                                  {day.day_name || `Day ${day.day_number || dayIdx + 1}`}
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
                                        <TableCell className="font-medium">{exercise.exercise_name || exercise.name}</TableCell>
                                        <TableCell className="text-center">{exercise.sets}</TableCell>
                                        <TableCell className="text-center">{exercise.reps}</TableCell>
                                        <TableCell className="text-center">{exercise.rest_seconds || exercise.rest}</TableCell>
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
                    ))}
                  </div>
                </div>
              )}
              
              {/* Plan Structure - Legacy formats (days or trainingDays) */}
              {!selectedPlan.plan_structure?.weeks && selectedPlan.plan_structure && (selectedPlan.plan_structure.days || selectedPlan.plan_structure.trainingDays) && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">{translations.planStructure}</Label>
                  <div className="space-y-4">
                    {(selectedPlan.plan_structure.days || selectedPlan.plan_structure.trainingDays)?.map((day, idx) => (
                      <Card key={idx}>
                        <CardHeader>
                          <CardTitle className="text-base">
                            {language === 'he' ? (day.name_he || day.name || day.day_name) : (day.name || day.day_name || day.name_he)}
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
                                  <TableCell className="font-medium">{exercise.exercise_name || exercise.name}</TableCell>
                                  <TableCell className="text-center">{exercise.sets}</TableCell>
                                  <TableCell className="text-center">{exercise.reps}</TableCell>
                                  <TableCell className="text-center">{exercise.rest_seconds || exercise.rest}</TableCell>
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
              
              {/* Display progression if available */}
              {selectedPlan.plan_structure?.progression && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">{translations.progression || 'Progression'}</Label>
                  <div className="space-y-2">
                    {Object.entries(selectedPlan.plan_structure.progression).map(([key, value]) => (
                      <div key={key} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-sm font-medium text-gray-700 capitalize">
                          {key.replace(/_/g, ' ')}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {typeof value === 'object' ? (
                            <span>
                              {value.sets && `${value.sets} sets`}
                              {value.notes && ` - ${value.notes}`}
                            </span>
                          ) : (
                            String(value)
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Display message if no structured data */}
              {selectedPlan.plan_structure && !selectedPlan.plan_structure.weeks && !selectedPlan.plan_structure.days && !selectedPlan.plan_structure.trainingDays && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">{translations.additionalInfo || 'Additional Information'}</Label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-500">{translations.customStructure || 'Custom training structure defined'}</p>
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
      
      {/* Plan Builder Dialog */}
      <Dialog open={isPlanBuilderOpen} onOpenChange={setIsPlanBuilderOpen}>
        <DialogContent className={`max-w-[95vw] max-h-[95vh] p-0 ${isRTL ? 'rtl' : 'ltr'}`}>
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Layers className="h-6 w-6 text-blue-600" />
              {translations.trainingPlanBuilder || 'Training Plan Builder'}: {planFormData.plan_name}
            </DialogTitle>
            <DialogDescription>
              {getClientName(planFormData.user_code)} • {planFormData.duration_weeks} {language === 'he' ? 'שבועות' : 'weeks'} • {planFormData.weekly_frequency}x {language === 'he' ? 'בשבוע' : 'per week'}
            </DialogDescription>
          </DialogHeader>
          
          <div className={`flex h-[calc(95vh-180px)] ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Exercise Library Sidebar */}
            <div className={`w-80 ${isRTL ? 'border-l' : 'border-r'} bg-gray-50 flex flex-col`}>
              <div className="p-4 border-b bg-white">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    {translations.exerciseLibrary}
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsAddExerciseDialogOpen(true)}
                    className="gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    {translations.add}
                  </Button>
                </div>
                <Input
                  placeholder={translations.searchExercises}
                  value={exerciseSearchTerm}
                  onChange={(e) => setExerciseSearchTerm(e.target.value)}
                  className="mb-2"
                />
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={translations.allCategories} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{translations.allCategories}</SelectItem>
                    <SelectItem value="chest">{translations.chest}</SelectItem>
                    <SelectItem value="back">{translations.backMuscle}</SelectItem>
                    <SelectItem value="shoulders">{translations.shoulders}</SelectItem>
                    <SelectItem value="legs">{translations.legs}</SelectItem>
                    <SelectItem value="arms">{translations.arms}</SelectItem>
                    <SelectItem value="core">{translations.core}</SelectItem>
                    <SelectItem value="cardio">{translations.cardio}</SelectItem>
                    <SelectItem value="full_body">{translations.fullBody}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {filteredExercises.map((exercise) => (
                    <div
                      key={exercise.id}
                      className="p-3 bg-white rounded-lg border hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer group"
                      onClick={() => {
                        if (builderWeeks.length > 0 && builderWeeks[currentWeek]?.days[currentDay]) {
                          addExerciseToDayInBuilder(currentWeek, currentDay, exercise);
                        } else {
                          setError(translations.pleaseSelectDay);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {language === 'he' && exercise.exercise_name_he ? exercise.exercise_name_he : exercise.exercise_name}
                          </div>
                          {exercise.category && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {exercise.category}
                            </Badge>
                          )}
                          {exercise.muscle_groups_primary && exercise.muscle_groups_primary.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              {exercise.muscle_groups_primary.slice(0, 2).join(', ')}
                            </div>
                          )}
                        </div>
                        <Plus className="h-4 w-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
                      </div>
                    </div>
                  ))}
                  {filteredExercises.length === 0 && (
                    <div className="text-center text-gray-500 py-8 text-sm">
                      {translations.noExercisesFound}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
            
            {/* Plan Builder Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-4">
                  {builderWeeks.length === 0 ? (
                    <div className="text-center py-12">
                      <Dumbbell className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-500">{translations.initializingPlanBuilder}</p>
                      <Button onClick={initializePlanBuilder} className="mt-4">
                        {translations.initializePlanStructure}
                      </Button>
                    </div>
                  ) : (
                    builderWeeks.map((week, weekIdx) => (
                      <Card key={weekIdx} className={`border-2 ${weekIdx === currentWeek ? 'border-blue-500' : 'border-gray-200'}`}>
                        <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleWeekExpansion(weekIdx)}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-lg flex items-center gap-2">
                                {expandedWeeks.has(weekIdx) ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                                {translations.week} {week.week_number}
                              </CardTitle>
                              <div className="mt-2">
                                <Input
                                  placeholder={translations.weekFocusPlaceholder}
                                  value={week.focus}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    updateWeekFocus(weekIdx, e.target.value);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {weekIdx > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyWeekToAnother(weekIdx - 1, weekIdx);
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  {translations.copyFromWeek} {weekIdx}
                                </Button>
                              )}
                              <Badge variant={weekIdx === currentWeek ? "default" : "outline"}>
                                {week.days.reduce((sum, day) => sum + day.exercises.length, 0)} {translations.exercises}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        
                        {expandedWeeks.has(weekIdx) && (
                          <CardContent className="space-y-3">
                            {week.days.map((day, dayIdx) => (
                              <Card key={dayIdx} className={`${weekIdx === currentWeek && dayIdx === currentDay ? 'border-blue-400 bg-blue-50' : ''}`}>
                                <CardHeader className="pb-2">
                                  <div className="flex items-center justify-between">
                                    <Input
                                      placeholder={`${translations.day} ${day.day_number} ${translations.dayNamePlaceholder}`}
                                      value={day.day_name}
                                      onChange={(e) => updateDayName(weekIdx, dayIdx, e.target.value)}
                                      className="font-semibold text-sm max-w-xs"
                                      onClick={() => {
                                        setCurrentWeek(weekIdx);
                                        setCurrentDay(dayIdx);
                                      }}
                                    />
                                    <Badge variant="outline" className="text-xs">
                                      {day.exercises.length} {translations.exercises}
                                    </Badge>
                                  </div>
                                </CardHeader>
                                <CardContent className="pt-2">
                                  {day.exercises.length === 0 ? (
                                    <div 
                                      className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                                      onClick={() => {
                                        setCurrentWeek(weekIdx);
                                        setCurrentDay(dayIdx);
                                      }}
                                    >
                                      {translations.clickExerciseToAdd}
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {day.exercises.map((exercise, exIdx) => (
                                        <Card key={exIdx} className="border bg-white">
                                          <CardContent className="p-3">
                                            <div className="flex items-start gap-3">
                                              <div className="flex-shrink-0 text-gray-400">
                                                <GripVertical className="h-5 w-5" />
                                              </div>
                                              <div className="flex-1 space-y-2">
                                                <div className="font-medium text-sm">{exercise.exercise_name}</div>
                                                <div className="grid grid-cols-4 gap-2">
                                                  <div>
                                                    <Label className="text-xs text-gray-500">{translations.sets}</Label>
                                                    <Input
                                                      type="number"
                                                      min="1"
                                                      value={exercise.sets}
                                                      onChange={(e) => updateExerciseInBuilder(weekIdx, dayIdx, exIdx, 'sets', parseInt(e.target.value) || 1)}
                                                      className="h-8 text-sm"
                                                    />
                                                  </div>
                                                  <div>
                                                    <Label className="text-xs text-gray-500">{translations.reps}</Label>
                                                    <Input
                                                      value={exercise.reps}
                                                      onChange={(e) => updateExerciseInBuilder(weekIdx, dayIdx, exIdx, 'reps', e.target.value)}
                                                      placeholder="8-10"
                                                      className="h-8 text-sm"
                                                    />
                                                  </div>
                                                  <div>
                                                    <Label className="text-xs text-gray-500">{translations.restSeconds}</Label>
                                                    <Input
                                                      type="number"
                                                      min="0"
                                                      value={exercise.rest_seconds}
                                                      onChange={(e) => updateExerciseInBuilder(weekIdx, dayIdx, exIdx, 'rest_seconds', parseInt(e.target.value) || 0)}
                                                      className="h-8 text-sm"
                                                    />
                                                  </div>
                                                  <div>
                                                    <Label className="text-xs text-gray-500">{translations.targetWeight}</Label>
                                                    <Input
                                                      type="number"
                                                      min="0"
                                                      step="0.5"
                                                      value={exercise.target_weight_kg || ''}
                                                      onChange={(e) => updateExerciseInBuilder(weekIdx, dayIdx, exIdx, 'target_weight_kg', e.target.value ? parseFloat(e.target.value) : null)}
                                                      placeholder={translations.optional}
                                                      className="h-8 text-sm"
                                                    />
                                                  </div>
                                                </div>
                                                <div>
                                                  <Label className="text-xs text-gray-500">{translations.exerciseNotes}</Label>
                                                  <Input
                                                    value={exercise.notes}
                                                    onChange={(e) => updateExerciseInBuilder(weekIdx, dayIdx, exIdx, 'notes', e.target.value)}
                                                    placeholder={translations.formCuesPlaceholder}
                                                    className="h-8 text-sm"
                                                  />
                                                </div>
                                              </div>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeExerciseFromBuilder(weekIdx, dayIdx, exIdx)}
                                                className="flex-shrink-0"
                                              >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                              </Button>
                                            </div>
                                          </CardContent>
                                        </Card>
                                      ))}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </CardContent>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter className="p-6 border-t bg-gray-50">
            <div className="flex items-center justify-between w-full">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsTemplateDialogOpen(true)}
                  className="gap-2"
                >
                  <Layers className="h-4 w-4" />
                  {translations.loadTemplate}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={async () => {
                    // Pre-fill and translate plan data
                    const planName = planFormData.plan_name || '';
                    const planDesc = planFormData.description || '';
                    
                    // Detect language and translate
                    const isNameHeb = isHebrew(planName);
                    const isDescHeb = isHebrew(planDesc);
                    
                    let nameEn = planName, nameHe = '';
                    let descEn = planDesc, descHe = '';
                    
                    if (isNameHeb) {
                      nameHe = planName;
                      nameEn = await translateText(planName, 'en');
                    } else {
                      nameEn = planName;
                      nameHe = await translateText(planName, 'he');
                    }
                    
                    if (isDescHeb) {
                      descHe = planDesc;
                      descEn = await translateText(planDesc, 'en');
                    } else {
                      descEn = planDesc;
                      descHe = await translateText(planDesc, 'he');
                    }
                    
                    setTemplateFormData({
                      ...templateFormData,
                      template_name: nameEn,
                      template_name_he: nameHe,
                      description: descEn,
                      description_he: descHe,
                      goal: planFormData.goal,
                      difficulty_level: planFormData.difficulty_level
                    });
                    setIsSaveTemplateDialogOpen(true);
                  }}
                  disabled={builderWeeks.length === 0 || builderWeeks.every(w => w.days.every(d => d.exercises.length === 0))}
                  className="gap-2"
                >
                  <Copy className="h-4 w-4" />
                  {translations.saveAsNewTemplate}
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  {translations.totalExercises}: {builderWeeks.reduce((sum, week) => 
                    sum + week.days.reduce((daySum, day) => daySum + day.exercises.length, 0), 0
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsPlanBuilderOpen(false)}>
                    {translations.cancel}
                  </Button>
                  <Button 
                    onClick={savePlanFromBuilder} 
                    disabled={loading || builderWeeks.every(w => w.days.every(d => d.exercises.length === 0))}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {loading ? translations.saving : translations.savePlan}
                  </Button>
                </div>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Template Browser Dialog */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className={`max-w-4xl max-h-[90vh] ${isRTL ? 'rtl' : 'ltr'}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              {translations.trainingPlanTemplates}
            </DialogTitle>
            <DialogDescription>
              {translations.loadTemplate}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="my" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="my">{translations.myTemplates} ({myTemplates.length})</TabsTrigger>
              <TabsTrigger value="public">{translations.publicTemplates} ({publicTemplates.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="my" className="max-h-[60vh] overflow-y-auto">
              <div className="space-y-3">
                {myTemplates.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {translations.noTemplatesFound}
                  </div>
                ) : (
                  myTemplates.map((template) => (
                    <Card key={template.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">
                              {language === 'he' && template.template_name_he 
                                ? template.template_name_he 
                                : template.template_name}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {language === 'he' && template.description_he 
                                ? template.description_he 
                                : template.description}
                            </CardDescription>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleTemplatePublic(template)}
                              title={template.is_public ? translations.makePrivate : translations.makePublic}
                            >
                              {template.is_public ? <Eye className="h-4 w-4" /> : <Eye className="h-4 w-4 opacity-50" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteTemplate(template.id)}
                              title={translations.delete}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {template.goal && (
                            <Badge variant="outline">
                              {translations[template.goal] || template.goal}
                            </Badge>
                          )}
                          {template.difficulty_level && (
                            <Badge variant="outline">
                              {translations[template.difficulty_level] || template.difficulty_level}
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {template.duration_weeks} {language === 'he' ? 'שבועות' : 'weeks'}
                          </Badge>
                          <Badge variant="outline">
                            {template.weekly_frequency}x/{language === 'he' ? 'שבוע' : 'week'}
                          </Badge>
                          {template.usage_count > 0 && (
                            <Badge variant="secondary">
                              {translations.usageCount}: {template.usage_count}
                            </Badge>
                          )}
                          {template.is_public && (
                            <Badge className="bg-blue-100 text-blue-800">
                              {translations.makePublic}
                            </Badge>
                          )}
                        </div>
                        <Button 
                          onClick={() => handleLoadTemplate(template)}
                          className="w-full"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          {translations.loadTemplate}
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="public" className="max-h-[60vh] overflow-y-auto">
              <div className="space-y-3">
                {publicTemplates.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {translations.noTemplatesFound}
                  </div>
                ) : (
                  publicTemplates.map((template) => (
                    <Card key={template.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">
                          {language === 'he' && template.template_name_he 
                            ? template.template_name_he 
                            : template.template_name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {language === 'he' && template.description_he 
                            ? template.description_he 
                            : template.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {template.goal && (
                            <Badge variant="outline">
                              {translations[template.goal] || template.goal}
                            </Badge>
                          )}
                          {template.difficulty_level && (
                            <Badge variant="outline">
                              {translations[template.difficulty_level] || template.difficulty_level}
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {template.duration_weeks} {language === 'he' ? 'שבועות' : 'weeks'}
                          </Badge>
                          <Badge variant="outline">
                            {template.weekly_frequency}x/{language === 'he' ? 'שבוע' : 'week'}
                          </Badge>
                          {template.usage_count > 0 && (
                            <Badge variant="secondary">
                              {translations.usageCount}: {template.usage_count} {translations.times}
                            </Badge>
                          )}
                        </div>
                        <Button 
                          onClick={() => handleLoadTemplate(template)}
                          className="w-full"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          {translations.loadTemplate}
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      
      {/* Save Template Dialog */}
      <Dialog open={isSaveTemplateDialogOpen} onOpenChange={setIsSaveTemplateDialogOpen}>
        <DialogContent className={`max-w-2xl ${isRTL ? 'rtl' : 'ltr'}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-blue-600" />
              {translations.saveAsNewTemplate}
            </DialogTitle>
            <DialogDescription>
              {translations.createNewTemplate}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template_name">{translations.templateName} *</Label>
              <Input
                id="template_name"
                value={language === 'he' ? templateFormData.template_name_he : templateFormData.template_name}
                onChange={(e) => handleTemplateNameChange(e.target.value)}
                onBlur={handleTemplateNameBlur}
                placeholder={language === 'he' ? 'למשל: תוכנית כוח למתחילים' : 'e.g., Beginner Strength Program'}
              />
              {(templateFormData.template_name || templateFormData.template_name_he) && (
                <div className="text-xs text-gray-500 mt-1">
                  {language === 'he' 
                    ? `English: ${templateFormData.template_name}` 
                    : `Hebrew: ${templateFormData.template_name_he}`
                  }
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="template_description">{translations.templateDescription}</Label>
              <Textarea
                id="template_description"
                value={language === 'he' ? templateFormData.description_he : templateFormData.description}
                onChange={(e) => handleTemplateDescriptionChange(e.target.value)}
                onBlur={handleTemplateDescriptionBlur}
                placeholder={language === 'he' ? 'תאר את תבנית תוכנית האימון הזו...' : 'Describe this training plan template...'}
                rows={3}
              />
              {(templateFormData.description || templateFormData.description_he) && (
                <div className="text-xs text-gray-500 mt-1">
                  {language === 'he' 
                    ? `English: ${templateFormData.description}` 
                    : `Hebrew: ${templateFormData.description_he}`
                  }
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{translations.goal}</Label>
                <div className="px-3 py-2 bg-gray-100 rounded-md text-sm">
                  {translations[planFormData.goal] || planFormData.goal}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>{translations.difficultyLevel}</Label>
                <div className="px-3 py-2 bg-gray-100 rounded-md text-sm">
                  {translations[planFormData.difficulty_level] || planFormData.difficulty_level}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{translations.durationWeeks}</Label>
                <div className="px-3 py-2 bg-gray-100 rounded-md text-sm">
                  {planFormData.duration_weeks} {language === 'he' ? 'שבועות' : 'weeks'}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>{translations.weeklyFrequency}</Label>
                <div className="px-3 py-2 bg-gray-100 rounded-md text-sm">
                  {planFormData.weekly_frequency}x/{language === 'he' ? 'שבוע' : 'week'}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="estimated_duration">{translations.estimatedDuration}</Label>
                <Input
                  id="estimated_duration"
                  type="number"
                  min="15"
                  max="240"
                  value={templateFormData.estimated_session_duration_minutes}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, estimated_session_duration_minutes: parseInt(e.target.value) || 60 })}
                  placeholder="60"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_public"
                checked={templateFormData.is_public}
                onChange={(e) => setTemplateFormData({ ...templateFormData, is_public: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="is_public" className="cursor-pointer">
                {translations.makePublic} ({translations.shared})
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveTemplateDialogOpen(false)}>
              {translations.cancel}
            </Button>
            <Button onClick={handleSaveAsTemplate} disabled={loading}>
              {loading ? translations.saving : translations.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Exercise Dialog */}
      <Dialog open={isAddExerciseDialogOpen} onOpenChange={setIsAddExerciseDialogOpen}>
        <DialogContent className={`max-w-2xl max-h-[90vh] overflow-y-auto ${isRTL ? 'rtl' : 'ltr'}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-blue-600" />
              {translations.addExercise}
            </DialogTitle>
            <DialogDescription>
              {translations.addExerciseToLibrary}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Exercise Name */}
            <div className="space-y-2">
              <Label htmlFor="exercise_name">{translations.exerciseName} *</Label>
              <Input
                id="exercise_name"
                value={language === 'he' ? exerciseFormData.exercise_name_he : exerciseFormData.exercise_name}
                onChange={(e) => handleExerciseNameChange(e.target.value)}
                onBlur={handleExerciseNameBlur}
                placeholder={language === 'he' ? 'למשל: לחיצת חזה עם משקולת' : 'e.g., Barbell Bench Press'}
              />
              {(exerciseFormData.exercise_name || exerciseFormData.exercise_name_he) && (
                <div className="text-xs text-gray-500 mt-1">
                  {language === 'he' 
                    ? `English: ${exerciseFormData.exercise_name}` 
                    : `Hebrew: ${exerciseFormData.exercise_name_he}`
                  }
                </div>
              )}
            </div>
            
            {/* Category and Difficulty */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">{translations.category}</Label>
                <Select 
                  value={exerciseFormData.category}
                  onValueChange={(value) => setExerciseFormData({ ...exerciseFormData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chest">{translations.chest}</SelectItem>
                    <SelectItem value="back">{translations.backMuscle}</SelectItem>
                    <SelectItem value="shoulders">{translations.shoulders}</SelectItem>
                    <SelectItem value="legs">{translations.legs}</SelectItem>
                    <SelectItem value="arms">{translations.arms}</SelectItem>
                    <SelectItem value="core">{translations.core}</SelectItem>
                    <SelectItem value="cardio">{translations.cardio}</SelectItem>
                    <SelectItem value="full_body">{translations.fullBody}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="difficulty">{translations.difficultyLevel}</Label>
                <Select 
                  value={exerciseFormData.difficulty_level}
                  onValueChange={(value) => setExerciseFormData({ ...exerciseFormData, difficulty_level: value })}
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
            </div>
            
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="exercise_description">{translations.exerciseDescription}</Label>
              <Textarea
                id="exercise_description"
                value={language === 'he' ? exerciseFormData.description_he : exerciseFormData.description}
                onChange={(e) => handleExerciseDescriptionChange(e.target.value)}
                onBlur={handleExerciseDescriptionBlur}
                placeholder={language === 'he' ? 'תאר את התרגיל...' : 'Describe the exercise...'}
                rows={3}
              />
              {(exerciseFormData.description || exerciseFormData.description_he) && (
                <div className="text-xs text-gray-500 mt-1">
                  {language === 'he' 
                    ? `English: ${exerciseFormData.description}` 
                    : `Hebrew: ${exerciseFormData.description_he}`
                  }
                </div>
              )}
            </div>
            
            {/* Primary Muscles Multi-Select */}
            <div className="space-y-2">
              <Label>{translations.primaryMuscles}</Label>
              <Input
                placeholder={language === 'he' ? 'חפש שרירים ראשיים...' : 'Search primary muscles...'}
                value={primaryMuscleSearch}
                onChange={(e) => setPrimaryMuscleSearch(e.target.value)}
                className="mb-2"
              />
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    // Chest
                    { en: 'Pectoralis major', he: 'שריר החזה הגדול' },
                    { en: 'Pectoralis minor', he: 'שריר החזה הקטן' },
                    // Shoulders
                    { en: 'Deltoid (anterior)', he: 'דלטואיד קדמי' },
                    { en: 'Deltoid (lateral)', he: 'דלטואיד צידי' },
                    { en: 'Deltoid (posterior)', he: 'דלטואיד אחורי' },
                    // Arms
                    { en: 'Biceps brachii', he: 'שריר הדו ראשי של הזרוע' },
                    { en: 'Triceps brachii', he: 'שריר התלת ראשי של הזרוע' },
                    { en: 'Brachialis', he: 'שריר הברכיאליס' },
                    { en: 'Brachioradialis', he: 'שריר הברכיורדיאליס' },
                    // Back
                    { en: 'Latissimus dorsi', he: 'שריר הרחב גבי' },
                    { en: 'Trapezius', he: 'שריר הטרפז' },
                    { en: 'Rhomboids', he: 'שרירי הרומבואידים' },
                    { en: 'Erector spinae', he: 'זוקפי הגב' },
                    // Core
                    { en: 'Rectus abdominis', he: 'שריר הבטן הישר' },
                    { en: 'External obliques', he: 'שרירי האלכסון החיצוניים' },
                    { en: 'Internal obliques', he: 'שרירי האלכסון הפנימיים' },
                    { en: 'Transverse abdominis', he: 'שריר הבטן הרוחבי' },
                    // Glutes
                    { en: 'Gluteus maximus', he: 'שריר העכוז הגדול' },
                    { en: 'Gluteus medius', he: 'שריר העכוז האמצעי' },
                    { en: 'Gluteus minimus', he: 'שריר העכוז הקטן' },
                    // Quadriceps
                    { en: 'Rectus femoris', he: 'שריר הירך הישר' },
                    { en: 'Vastus lateralis', he: 'שריר הווסטוס הצידי' },
                    { en: 'Vastus medialis', he: 'שריר הווסטוס הפנימי' },
                    { en: 'Vastus intermedius', he: 'שריר הווסטוס האמצעי' },
                    // Hamstrings
                    { en: 'Biceps femoris', he: 'שריר הדו ראשי של הירך' },
                    { en: 'Semitendinosus', he: 'שריר הסמיטנדינוסוס' },
                    { en: 'Semimembranosus', he: 'שריר הסמימברנוסוס' },
                    // Calves
                    { en: 'Gastrocnemius', he: 'שריר התאומים' },
                    { en: 'Soleus', he: 'שריר הסולאוס' }
                  ]
                  .filter((muscle) => {
                    if (!primaryMuscleSearch) return true;
                    const searchLower = primaryMuscleSearch.toLowerCase();
                    return (
                      muscle.en.toLowerCase().includes(searchLower) ||
                      muscle.he.includes(primaryMuscleSearch)
                    );
                  })
                  .map((muscle) => {
                    const isSelected = exerciseFormData.muscle_groups_primary.includes(muscle.en);
                    return (
                      <label
                        key={muscle.en}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExerciseFormData({
                                ...exerciseFormData,
                                muscle_groups_primary: [...exerciseFormData.muscle_groups_primary, muscle.en]
                              });
                            } else {
                              setExerciseFormData({
                                ...exerciseFormData,
                                muscle_groups_primary: exerciseFormData.muscle_groups_primary.filter(item => item !== muscle.en)
                              });
                            }
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">
                          {language === 'he' ? muscle.he : muscle.en}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {exerciseFormData.muscle_groups_primary.length > 0 && (
                <div className="text-xs text-gray-600 mt-1">
                  {translations.selected}: {exerciseFormData.muscle_groups_primary.length}
                </div>
              )}
            </div>
            
            {/* Secondary Muscles Multi-Select */}
            <div className="space-y-2">
              <Label>{translations.secondaryMuscles}</Label>
              <Input
                placeholder={language === 'he' ? 'חפש שרירים משניים...' : 'Search secondary muscles...'}
                value={secondaryMuscleSearch}
                onChange={(e) => setSecondaryMuscleSearch(e.target.value)}
                className="mb-2"
              />
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    // Chest/Shoulder assistance
                    { en: 'Anterior deltoid', he: 'דלטואיד קדמי' },
                    { en: 'Triceps brachii', he: 'שריר התלת ראשי של הזרוע' },
                    { en: 'Serratus anterior', he: 'שריר המסור הקדמי' },
                    // Shoulder assistance
                    { en: 'Trapezius', he: 'שריר הטרפז' },
                    { en: 'Supraspinatus', he: 'שריר הסופראספינטוס' },
                    { en: 'Infraspinatus', he: 'שריר האינפראספינטוס' },
                    { en: 'Teres minor', he: 'שריר הטרס הקטן' },
                    { en: 'Teres major', he: 'שריר הטרס הגדול' },
                    { en: 'Rhomboids', he: 'שרירי הרומבואידים' },
                    // Arm assistance
                    { en: 'Forearm flexors', he: 'מכופפי האמה' },
                    { en: 'Forearm extensors', he: 'מיישרי האמה' },
                    // Back assistance
                    { en: 'Posterior deltoid', he: 'דלטואיד אחורי' },
                    { en: 'Biceps brachii', he: 'שריר הדו ראשי' },
                    { en: 'Core stabilizers', he: 'שרירי הליבה המייצבים' },
                    // Core assistance
                    { en: 'Erector spinae', he: 'זוקפי הגב' },
                    { en: 'Gluteus medius', he: 'שריר העכוז האמצעי' },
                    { en: 'Hip flexors (iliopsoas)', he: 'מכופפי הירך' },
                    // Lower body assistance
                    { en: 'Gluteus maximus', he: 'שריר העכוז הגדול' },
                    { en: 'Hamstrings', he: 'שרירי הירך האחוריים' },
                    { en: 'Calves (gastrocnemius)', he: 'שריר התאומים' },
                    { en: 'Tibialis anterior', he: 'שריר השוק הקדמי' },
                    // Stabilizers
                    { en: 'Multifidus', he: 'שריר מולטיפידוס' },
                    { en: 'Pelvic floor muscles', he: 'שרירי רצפת האגן' },
                    { en: 'Diaphragm', he: 'הסרעפת' },
                    // Forearm specific
                    { en: 'Flexor carpi radialis', he: 'מכופף שורש כף היד הרדיאלי' },
                    { en: 'Flexor carpi ulnaris', he: 'מכופף שורש כף היד האולנרי' },
                    { en: 'Extensor carpi radialis', he: 'מיישר שורש כף היד הרדיאלי' },
                    { en: 'Extensor carpi ulnaris', he: 'מיישר שורש כף היד האולנרי' },
                    { en: 'Pronator teres', he: 'מסובב קדמי של האמה' },
                    { en: 'Supinator', he: 'מסובב אחורי של האמה' },
                    { en: 'Peroneals', he: 'שרירי הפיבולריס' }
                  ]
                  .filter((muscle) => {
                    if (!secondaryMuscleSearch) return true;
                    const searchLower = secondaryMuscleSearch.toLowerCase();
                    return (
                      muscle.en.toLowerCase().includes(searchLower) ||
                      muscle.he.includes(secondaryMuscleSearch)
                    );
                  })
                  .map((muscle) => {
                    const isSelected = exerciseFormData.muscle_groups_secondary.includes(muscle.en);
                    return (
                      <label
                        key={muscle.en}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExerciseFormData({
                                ...exerciseFormData,
                                muscle_groups_secondary: [...exerciseFormData.muscle_groups_secondary, muscle.en]
                              });
                            } else {
                              setExerciseFormData({
                                ...exerciseFormData,
                                muscle_groups_secondary: exerciseFormData.muscle_groups_secondary.filter(item => item !== muscle.en)
                              });
                            }
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">
                          {language === 'he' ? muscle.he : muscle.en}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {exerciseFormData.muscle_groups_secondary.length > 0 && (
                <div className="text-xs text-gray-600 mt-1">
                  {translations.selected}: {exerciseFormData.muscle_groups_secondary.length}
                </div>
              )}
            </div>
            
            {/* Equipment Multi-Select */}
            <div className="space-y-2">
              <Label>{translations.equipmentNeeded}</Label>
              <Input
                placeholder={language === 'he' ? 'חפש ציוד...' : 'Search equipment...'}
                value={equipmentSearchTerm}
                onChange={(e) => setEquipmentSearchTerm(e.target.value)}
                className="mb-2"
              />
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    // 🏋️ Strength Training Equipment / ציוד לאימון כוח
                    { en: 'Barbell', he: 'מוט משקולות' },
                    { en: 'Dumbbells', he: 'משקולות יד' },
                    { en: 'Kettlebells', he: 'קטלבלס' },
                    { en: 'Weight plates', he: 'משקולות עגולות' },
                    { en: 'Power rack (squat rack)', he: 'מתקן סקוואט / כלוב כוח' },
                    { en: 'Bench press bench', he: 'ספסל לחיצת חזה' },
                    { en: 'Smith machine', he: 'מכונת סמית׳' },
                    { en: 'Cable crossover machine', he: 'מכונת קרוס אובר' },
                    { en: 'Resistance bands', he: 'גומיות התנגדות' },
                    { en: 'Sandbag', he: 'שק חול' },
                    { en: 'Weighted vest', he: 'אפוד משקולות' },
                    { en: 'Medicine ball', he: 'כדור כוח' },
                    { en: 'Battle ropes', he: 'חבלי קרב' },
                    { en: 'Trap bar (hex bar)', he: 'מוט טרפז' },
                    { en: 'Adjustable dumbbell set', he: 'סט משקולות מתכווננות' },
                    { en: 'Landmine attachment', he: 'מתקן לנדמיין' },
                    { en: 'Weightlifting belt', he: 'חגורת הרמת משקולות' },
                    { en: 'Pull-up bar', he: 'מתח' },
                    { en: 'Dip station', he: 'מתקן לדיפס' },
                    { en: 'Leg press machine', he: 'מכונת לחיצת רגליים' },
                    
                    // 🏃 Cardio Equipment / ציוד אירובי
                    { en: 'Treadmill', he: 'הליכון' },
                    { en: 'Stationary bike (spin bike)', he: 'אופני כושר' },
                    { en: 'Rowing machine', he: 'מכונת חתירה' },
                    { en: 'Elliptical trainer', he: 'אליפטיקל' },
                    { en: 'Stair climber / stepper', he: 'מדרגות כושר / סטפר' },
                    { en: 'Air bike (Assault bike)', he: 'אופני התנגדות אוויר' },
                    { en: 'Jump rope', he: 'חבל קפיצה' },
                    { en: 'Mini stepper', he: 'מיני סטפר' },
                    { en: 'SkiErg', he: 'סקי ארג (מכשיר סקי)' },
                    { en: 'Punching bag (heavy bag)', he: 'שק אגרוף' },
                    
                    // 🧘 Mobility, Flexibility & Core / גמישות, יציבה וליבה
                    { en: 'Yoga mat', he: 'מזרן יוגה' },
                    { en: 'Foam roller', he: 'גליל עיסוי' },
                    { en: 'Ab wheel', he: 'גלגל בטן' },
                    { en: 'Stability ball (exercise ball)', he: 'כדור פיטנס' },
                    { en: 'Balance board', he: 'לוח שיווי משקל' },
                    { en: 'Pilates ring', he: 'טבעת פילאטיס' },
                    { en: 'Stretching strap', he: 'רצועת מתיחות' },
                    { en: 'Core sliders (gliding discs)', he: 'דיסקים להחלקת ליבה' },
                    { en: 'Resistance loop bands (mini bands)', he: 'גומיות לולאה קטנות' },
                    { en: 'Yoga blocks', he: 'קוביות יוגה' },
                    
                    // 🧠 Recovery & Functional Tools / שיקום וכלים פונקציונליים
                    { en: 'Massage gun', he: 'אקדח עיסוי' },
                    { en: 'Lacrosse ball (for massage)', he: 'כדור לקקרוס לעיסוי' },
                    { en: 'Compression sleeves', he: 'שרוולי לחץ' },
                    { en: 'Vibration plate', he: 'פלטת רטט' },
                    { en: 'Infrared heating pad', he: 'כרית חימום אינפרא אדום' },
                    { en: 'Resistance tubes with handles', he: 'גומיות התנגדות עם ידיות' },
                    { en: 'TRX suspension trainer', he: 'מערכת TRX' },
                    { en: 'Plyometric box (plyo box)', he: 'קופסת פליומטריקה' },
                    { en: 'Agility ladder', he: 'סולם זריזות' },
                    { en: 'Speed parachute', he: 'מצנח ריצה' },
                    
                    // 🏋️ Advanced Strength & Machines / מכונות וכוח מתקדם
                    { en: 'Glute ham developer (GHD)', he: 'מתקן GHD' },
                    { en: 'Hack squat machine', he: 'מכונת סקוואט האק' },
                    { en: 'Leg extension machine', he: 'מכונת יישור רגליים' },
                    { en: 'Leg curl machine', he: 'מכונת כפיפת רגליים' },
                    { en: 'Calf raise machine', he: 'מכונת הרמת שוקיים' },
                    { en: 'Chest press machine', he: 'מכונת לחיצת חזה' },
                    { en: 'Lat pulldown machine', he: 'מכונת משיכת פולי עליון' },
                    { en: 'Seated row machine', he: 'מכונת חתירה בישיבה' },
                    { en: 'Pec deck (chest fly) machine', he: 'מכונת פרפר' },
                    { en: 'Adjustable cable pulley tower', he: 'מגדל פולי מתכוונן' },
                    { en: 'Curl bar (EZ bar)', he: 'מוט EZ' },
                    { en: 'Safety squat bar', he: 'מוט סקוואט בטיחות' },
                    { en: 'Bulgarian bag', he: 'שק בולגרי' },
                    { en: 'Strongman log bar', he: 'מוט לוג סטרונגמן' },
                    { en: 'Weighted dip belt', he: 'חגורת משקל לדיפס' },
                    { en: 'Ankle weights', he: 'משקולות קרסול' },
                    { en: 'Wrist weights', he: 'משקולות ידיים' },
                    { en: 'Powerlifting chains', he: 'שרשראות פאוורליפטינג' },
                    { en: 'Resistance sled (prowler)', he: 'מזחלת התנגדות' },
                    { en: 'Smith machine bar', he: 'מוט למכונת סמית׳' },
                    
                    // 🏃 Conditioning, Agility & Cardio Variety / זריזות, סיבולת ואירובי מתקדם
                    { en: 'Spin bike with monitor', he: 'אופני ספינינג עם מסך' },
                    { en: 'Recumbent bike', he: 'אופני ישיבה' },
                    { en: 'Curve treadmill (non-motorized)', he: 'הליכון קמור ללא מנוע' },
                    { en: 'VersaClimber', he: 'מכשיר טיפוס וורסה קליימבר' },
                    { en: 'Jumping box (soft foam type)', he: 'קופסה רכה לקפיצות' },
                    { en: 'Agility hurdles', he: 'משוכות זריזות' },
                    { en: 'Battle rope anchor mount', he: 'עוגן לחבלי קרב' },
                    { en: 'Speed cones', he: 'קונוסים לאימון מהירות' },
                    { en: 'Mini trampoline (rebounder)', he: 'טרמפולינה קטנה' },
                    { en: 'Aerobic step platform', he: 'מדרגה לאירובי' },
                    
                    // 🧘 Core, Balance & Flexibility Tools / כלים לליבה, שיווי משקל וגמישות
                    { en: 'Bosu ball', he: 'בוסו' },
                    { en: 'Ab bench', he: 'ספסל בטן' },
                    { en: 'Decline bench', he: 'ספסל שיפוע שלילי' },
                    { en: 'Incline bench', he: 'ספסל שיפוע חיובי' },
                    { en: 'Sit-up bar', he: 'מתקן לבטן' },
                    { en: 'Pilates reformer', he: 'רפורמר פילאטיס' },
                    { en: 'Stretch cage', he: 'מתקן למתיחות' },
                    { en: 'Hip circle band', he: 'רצועת ירכיים' },
                    { en: 'Core balance disc', he: 'דיסק שיווי משקל' },
                    { en: 'Mobility stick', he: 'מקל מוביליטי' },
                    
                    // 🧠 Recovery, Therapy & Specialty Gear / ציוד לשיקום והתאוששות
                    { en: 'Ice therapy roller', he: 'גלגל קרח טיפולי' },
                    { en: 'Percussion massage ball', he: 'כדור עיסוי רוטט' },
                    { en: 'Resistance band door anchor', he: 'עוגן דלת לגומיות התנגדות' },
                    { en: 'Yoga wheel', he: 'גלגל יוגה' },
                    { en: 'Acupressure mat', he: 'מזרן דיקור' },
                    { en: 'Weighted blanket (for recovery)', he: 'שמיכה כבדה' },
                    { en: 'Compression boots', he: 'מגפי לחץ להתאוששות' },
                    { en: 'Hot/cold therapy pack', he: 'כרית חום/קור' },
                    { en: 'Neck harness', he: 'רתמת צוואר לאימון' },
                    { en: 'Hand grip strengthener', he: 'מחזק אחיזת יד' },
                    
                    // Additional items
                    { en: 'Step platform', he: 'מדרגה לאירובי' },
                    { en: 'Adjustable bench', he: 'ספסל מתכוונן' },
                    { en: 'No equipment (bodyweight)', he: 'ללא ציוד (משקל גוף)' }
                  ]
                  .filter((equipment) => {
                    if (!equipmentSearchTerm) return true;
                    const searchLower = equipmentSearchTerm.toLowerCase();
                    return (
                      equipment.en.toLowerCase().includes(searchLower) ||
                      equipment.he.includes(equipmentSearchTerm)
                    );
                  })
                  .map((equipment) => {
                    const isSelected = exerciseFormData.equipment_needed.includes(equipment.en);
                    return (
                      <label
                        key={equipment.en}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExerciseFormData({
                                ...exerciseFormData,
                                equipment_needed: [...exerciseFormData.equipment_needed, equipment.en]
                              });
                            } else {
                              setExerciseFormData({
                                ...exerciseFormData,
                                equipment_needed: exerciseFormData.equipment_needed.filter(item => item !== equipment.en)
                              });
                            }
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">
                          {language === 'he' ? equipment.he : equipment.en}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {exerciseFormData.equipment_needed.length > 0 && (
                <div className="text-xs text-gray-600 mt-1">
                  {translations.selected || 'Selected'}: {exerciseFormData.equipment_needed.length}
                </div>
              )}
            </div>
            
            {/* Video & Image URLs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="video_url">{translations.videoUrl}</Label>
                <Input
                  id="video_url"
                  type="url"
                  value={exerciseFormData.video_url}
                  onChange={(e) => setExerciseFormData({ ...exerciseFormData, video_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="image_url">{translations.imageUrl}</Label>
                <Input
                  id="image_url"
                  type="url"
                  value={exerciseFormData.image_url}
                  onChange={(e) => setExerciseFormData({ ...exerciseFormData, image_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
            
            {/* Safety Tips */}
            <div className="space-y-2">
              <Label htmlFor="safety_tips">{translations.safetyTips}</Label>
              <Textarea
                id="safety_tips"
                value={exerciseFormData.safety_tips}
                onChange={(e) => setExerciseFormData({ ...exerciseFormData, safety_tips: e.target.value })}
                placeholder={language === 'he' ? 'טיפי בטיחות...' : 'Safety tips...'}
                rows={2}
              />
            </div>
            
            {/* Common Mistakes */}
            <div className="space-y-2">
              <Label htmlFor="common_mistakes">{translations.commonMistakes}</Label>
              <Textarea
                id="common_mistakes"
                value={exerciseFormData.common_mistakes}
                onChange={(e) => setExerciseFormData({ ...exerciseFormData, common_mistakes: e.target.value })}
                placeholder={language === 'he' ? 'טעויות נפוצות...' : 'Common mistakes...'}
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddExerciseDialogOpen(false)}>
              {translations.cancel}
            </Button>
            <Button onClick={handleSaveExercise} disabled={loading}>
              {loading ? translations.saving : translations.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrainingManagement;

