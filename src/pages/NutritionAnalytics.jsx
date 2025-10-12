import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { FoodLogs, ChatUser } from '@/api/entities';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  Search,
  Filter,
  Download,
  RefreshCw,
  Target,
  Apple,
  Dumbbell,
  Zap,
  Eye,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Clock,
  User,
  Flame,
  Beef,
  Cookie,
  Droplets
} from 'lucide-react';

// Color palette for charts
const CHART_COLORS = {
  primary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#06B6D4',
  purple: '#8B5CF6',
  pink: '#EC4899',
  indigo: '#6366F1',
  emerald: '#059669',
  amber: '#D97706',
  calories: '#EF4444', // Red for calories
  protein: '#10B981', // Green for protein
  carbs: '#3B82F6', // Blue for carbs
  fat: '#F59E0B' // Orange for fat
};

const CHART_COLORS_ARRAY = Object.values(CHART_COLORS);

export default function NutritionAnalytics() {
  const { translations, language } = useLanguage();
  const { selectedClient } = useClient();
  const [foodLogs, setFoodLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [nutritionTargets, setNutritionTargets] = useState(null);
  const [dateRange, setDateRange] = useState('30'); // days
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState(['total_calories', 'total_protein_g', 'total_carbs_g', 'total_fat_g']); // Show all macros by default
  const [chartType, setChartType] = useState('line');
  const [activeTab, setActiveTab] = useState('overview');

  // Check if current language is Hebrew (RTL)
  const isRTL = language === 'he';

  // Available metrics for selection
  const availableMetrics = [
    { key: 'total_calories', label: translations.calories || 'Calories', icon: Flame, color: CHART_COLORS.calories },
    { key: 'total_protein_g', label: translations.protein || 'Protein (g)', icon: Beef, color: CHART_COLORS.protein },
    { key: 'total_carbs_g', label: translations.carbohydrates || 'Carbs (g)', icon: Cookie, color: CHART_COLORS.carbs },
    { key: 'total_fat_g', label: translations.fat || 'Fat (g)', icon: Droplets, color: CHART_COLORS.fat }
  ];

  // Fetch food logs and nutrition targets when selectedClient changes
  useEffect(() => {
    const fetchNutritionData = async () => {
      if (!selectedClient) {
        setFoodLogs([]);
        setFilteredLogs([]);
        setNutritionTargets(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch food logs
        const logsData = await FoodLogs.getByUserCode(selectedClient.user_code);

        if (!logsData || logsData.length === 0) {
          setFoodLogs([]);
          setFilteredLogs([]);
          setNutritionTargets(null);
          setLoading(false);
          return;
        }

        // Process food logs data
        const processedLogs = logsData.map(log => {
          // Parse JSONB food_items if needed
          let foodItems = [];
          if (log.food_items) {
            try {
              foodItems = typeof log.food_items === 'string'
                ? JSON.parse(log.food_items)
                : Array.isArray(log.food_items)
                  ? log.food_items
                  : [log.food_items];
            } catch (e) {
              console.warn('Failed to parse food_items:', e);
              foodItems = [];
            }
          }

          return {
            ...log,
            food_items: foodItems,
            // Ensure numeric values are valid numbers
            total_calories: typeof log.total_calories === 'number' && !isNaN(log.total_calories) ? log.total_calories : 0,
            total_protein_g: typeof log.total_protein_g === 'number' && !isNaN(log.total_protein_g) ? log.total_protein_g : 0,
            total_carbs_g: typeof log.total_carbs_g === 'number' && !isNaN(log.total_carbs_g) ? log.total_carbs_g : 0,
            total_fat_g: typeof log.total_fat_g === 'number' && !isNaN(log.total_fat_g) ? log.total_fat_g : 0,
            // Format date for display
            display_date: log.log_date ? new Date(log.log_date).toLocaleDateString() : 'Unknown Date',
            original_date: log.log_date
          };
        });

        setFoodLogs(processedLogs);
        setFilteredLogs(processedLogs);

        // Fetch nutrition targets from client profile
        const clientProfile = await ChatUser.getByUserCode(selectedClient.user_code);
        if (clientProfile && clientProfile.macros) {
          setNutritionTargets({
            base_daily_total_calories: clientProfile.base_daily_total_calories || 0,
            protein_target: clientProfile.macros.protein_target || 0,
            carbs_target: clientProfile.macros.carbs_target || 0,
            fat_target: clientProfile.macros.fat_target || 0
          });
        }

      } catch (err) {
        setError(`Failed to load nutrition data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchNutritionData();
  }, [selectedClient, language]);

  // Filter data based on date range and search
  useEffect(() => {
    let filtered = foodLogs;

    // Apply date range filter
    if (dateRange !== 'all') {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
      filtered = filtered.filter(log => {
        if (!log.original_date) return false;
        const logDate = new Date(log.original_date);
        return logDate >= daysAgo;
      });
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.display_date.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.meal_label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  }, [foodLogs, dateRange, searchTerm]);



  // Prepare chart data - aggregate by day
  const dailyChartData = filteredLogs.reduce((acc, log) => {
    const date = log.display_date;
    if (!acc[date]) {
      acc[date] = {
        date: date,
        total_calories: 0,
        total_protein_g: 0,
        total_carbs_g: 0,
        total_fat_g: 0,
        meal_count: 0,
        meals: []
      };
    }
    acc[date].total_calories += log.total_calories || 0;
    acc[date].total_protein_g += log.total_protein_g || 0;
    acc[date].total_carbs_g += log.total_carbs_g || 0;
    acc[date].total_fat_g += log.total_fat_g || 0;
    acc[date].meal_count += 1;
    acc[date].meals.push({
      meal_label: log.meal_label,
      calories: log.total_calories,
      protein: log.total_protein_g,
      carbs: log.total_carbs_g,
      fat: log.total_fat_g
    });
    return acc;
  }, {});

  const chartData = Object.values(dailyChartData).sort((a, b) => {
    // Sort by date in ascending order (oldest first, newest last)
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA - dateB;
  });

  // Calculate nutrition statistics - daily averages
  const calculateNutritionStats = () => {
    if (chartData.length === 0) return null;

    // Calculate daily totals and averages
    const dailyTotals = chartData.map(day => ({
      calories: day.total_calories,
      protein: day.total_protein_g,
      carbs: day.total_carbs_g,
      fat: day.total_fat_g,
      meal_count: day.meal_count
    }));

    const totals = dailyTotals.reduce((acc, day) => ({
      calories: acc.calories + day.calories,
      protein: acc.protein + day.protein,
      carbs: acc.carbs + day.carbs,
      fat: acc.fat + day.fat
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    // Calculate averages per day
    const averages = {
      calories: Math.round(totals.calories / chartData.length),
      protein: Math.round(totals.protein / chartData.length * 10) / 10,
      carbs: Math.round(totals.carbs / chartData.length * 10) / 10,
      fat: Math.round(totals.fat / chartData.length * 10) / 10
    };

    const latest = chartData[chartData.length - 1];

    return {
      totalDays: chartData.length,
      totalMeals: filteredLogs.length,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat,
      averages,
      latest: {
        calories: latest.total_calories,
        protein: latest.total_protein_g,
        carbs: latest.total_carbs_g,
        fat: latest.total_fat_g,
        date: latest.date,
        meal_count: latest.meal_count
      }
    };
  };

  const stats = calculateNutritionStats();

  // Calculate target achievement percentages
  const calculateTargetAchievements = () => {
    if (!stats || !nutritionTargets) return null;

    return {
      calories: nutritionTargets.base_daily_total_calories > 0
        ? Math.round((stats.averages.calories / nutritionTargets.base_daily_total_calories) * 100)
        : 0,
      protein: nutritionTargets.protein_target > 0
        ? Math.round((stats.averages.protein / nutritionTargets.protein_target) * 100)
        : 0,
      carbs: nutritionTargets.carbs_target > 0
        ? Math.round((stats.averages.carbs / nutritionTargets.carbs_target) * 100)
        : 0,
      fat: nutritionTargets.fat_target > 0
        ? Math.round((stats.averages.fat / nutritionTargets.fat_target) * 100)
        : 0
    };
  };

  const targetAchievements = calculateTargetAchievements();

  // Add target lines to chart data if available
  const chartDataWithTargets = chartData.map(data => ({
    ...data,
    target_calories: nutritionTargets?.base_daily_total_calories || 0,
    target_protein: nutritionTargets?.protein_target || 0,
    target_carbs: nutritionTargets?.carbs_target || 0,
    target_fat: nutritionTargets?.fat_target || 0
  }));

  // Calculate custom domains for better scaling
  const calculateCustomDomain = (data, key, targetKey = null) => {
    if (!data || data.length === 0) return [0, 100];

    const values = data.map(item => item[key]).filter(val => val !== null && val !== undefined);
    if (values.length === 0) return [0, 100];

    let min = Math.min(...values);
    let max = Math.max(...values);

    // Include target values in domain calculation
    if (targetKey && data.some(item => item[targetKey] > 0)) {
      const targetValues = data.map(item => item[targetKey]).filter(val => val > 0);
      if (targetValues.length > 0) {
        min = Math.min(min, Math.min(...targetValues));
        max = Math.max(max, Math.max(...targetValues));
      }
    }

    const range = max - min;
    const padding = range * 0.1;
    return [Math.max(0, min - padding), max + padding];
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-xl border border-border/40 rounded-xl p-4 shadow-xl">
          <p className="font-semibold text-foreground mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.value} {entry.name}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Export nutrition data as CSV
  const handleExport = () => {
    if (!filteredLogs.length) return;

    const headers = [
      translations.date || 'Date',
      translations.mealType || 'Meal Type',
      translations.calories || 'Calories',
      translations.protein || 'Protein (g)',
      translations.carbohydrates || 'Carbs (g)',
      translations.fat || 'Fat (g)'
    ];

    const csvData = filteredLogs.map(log => [
      log.display_date,
      log.meal_label || 'Unknown',
      log.total_calories,
      log.total_protein_g,
      log.total_carbs_g,
      log.total_fat_g
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `nutrition_logs_${selectedClient?.user_code || 'client'}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render chart based on type
  const renderChart = () => {
    if (chartDataWithTargets.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{translations.noDataAvailableForFilters || 'No data available for the selected filters'}</p>
          </div>
        </div>
      );
    }

    const commonProps = {
      data: chartDataWithTargets,
      margin: { top: 20, right: 60, left: 60, bottom: 20 }
    };

    const commonAxisProps = {
      stroke: "#6b7280",
      fontSize: 11,
      tickLine: false,
      axisLine: false
    };

    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" {...commonAxisProps} />
              <YAxis {...commonAxisProps} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {selectedMetrics.map((metric, index) => {
                const metricInfo = availableMetrics.find(m => m.key === metric);
                const targetKey = `target_${metric}`;
                return (
                  <React.Fragment key={metric}>
                    <Line
                      type="monotone"
                      dataKey={metric}
                      stroke={metricInfo?.color || CHART_COLORS_ARRAY[index % CHART_COLORS_ARRAY.length]}
                      strokeWidth={3}
                      dot={{ fill: metricInfo?.color || CHART_COLORS_ARRAY[index % CHART_COLORS_ARRAY.length], strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2 }}
                      name={metricInfo?.label || metric}
                    />
                    {/* Target line if available */}
                    {nutritionTargets && chartDataWithTargets.some(d => d[targetKey] > 0) && (
                      <Line
                        type="monotone"
                        dataKey={targetKey}
                        stroke={metricInfo?.color || CHART_COLORS_ARRAY[index % CHART_COLORS_ARRAY.length]}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        name={`${metricInfo?.label || metric} Target`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" {...commonAxisProps} />
              <YAxis {...commonAxisProps} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {selectedMetrics.map((metric, index) => {
                const metricInfo = availableMetrics.find(m => m.key === metric);
                return (
                  <Area
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    stroke={metricInfo?.color || CHART_COLORS_ARRAY[index % CHART_COLORS_ARRAY.length]}
                    fill={metricInfo?.color + '20' || CHART_COLORS_ARRAY[index % CHART_COLORS_ARRAY.length] + '20'}
                    strokeWidth={2}
                    name={metricInfo?.label || metric}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" {...commonAxisProps} />
              <YAxis {...commonAxisProps} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {selectedMetrics.map((metric, index) => {
                const metricInfo = availableMetrics.find(m => m.key === metric);
                return (
                  <Bar
                    key={metric}
                    dataKey={metric}
                    fill={metricInfo?.color || CHART_COLORS_ARRAY[index % CHART_COLORS_ARRAY.length]}
                    radius={[4, 4, 0, 0]}
                    name={metricInfo?.label || metric}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  // Render nutrition targets comparison
  const renderTargetsComparison = () => {
    if (!nutritionTargets || !targetAchievements) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-primary transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground/70">{translations.caloriesAchievement || 'Calories Achievement'}</p>
                <p className="text-2xl font-bold text-foreground">{targetAchievements.calories}%</p>
                <p className="text-sm text-muted-foreground/70">
                  {stats?.averages.calories || 0} / {nutritionTargets.base_daily_total_calories} {translations.calories || 'cal'}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-red-500/20 to-red-500/10 rounded-xl flex items-center justify-center">
                <Flame className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-success transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground/70">{translations.proteinAchievement || 'Protein Achievement'}</p>
                <p className="text-2xl font-bold text-foreground">{targetAchievements.protein}%</p>
                <p className="text-sm text-muted-foreground/70">
                  {stats?.averages.protein || 0} / {nutritionTargets.protein_target}g
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-500/10 rounded-xl flex items-center justify-center">
                <Beef className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-info transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground/70">{translations.carbsAchievement || 'Carbs Achievement'}</p>
                <p className="text-2xl font-bold text-foreground">{targetAchievements.carbs}%</p>
                <p className="text-sm text-muted-foreground/70">
                  {stats?.averages.carbs || 0} / {nutritionTargets.carbs_target}g
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl flex items-center justify-center">
                <Cookie className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-warning transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground/70">{translations.fatAchievement || 'Fat Achievement'}</p>
                <p className="text-2xl font-bold text-foreground">{targetAchievements.fat}%</p>
                <p className="text-sm text-muted-foreground/70">
                  {stats?.averages.fat || 0} / {nutritionTargets.fat_target}g
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500/20 to-orange-500/10 rounded-xl flex items-center justify-center">
                <Droplets className="w-6 h-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 bg-mesh">

      {/* Hero Section */}
      <section className="relative py-16 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20"></div>
        <div className="absolute top-10 left-10 w-72 h-72 bg-gradient-to-br from-primary/20 to-success/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-gradient-to-br from-warning/20 to-info/20 rounded-full blur-3xl"></div>

        <div className="relative z-10 container mx-auto px-6">
          <div className="flex items-center justify-center mb-6 animate-float-gentle">
            <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-lighter rounded-2xl flex items-center justify-center shadow-glow-primary">
              <Apple className="w-10 h-10 text-white" />
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gradient-primary font-heading mb-4 animate-slide-up text-center">
            {translations.nutritionAnalytics || 'Nutrition Analytics'}
          </h1>

          <p className="text-xl text-muted-foreground/80 max-w-3xl mx-auto animate-slide-up text-center" style={{ animationDelay: '0.1s' }}>
            {translations.nutritionAnalyticsDescription || 'Track your daily nutrition intake and compare against your personal goals'}
          </p>
        </div>
      </section>

      {/* Controls Section */}
      <section className="container mx-auto px-6 mb-8">
        <Card className="glass-premium border-border/40 shadow-premium">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* User Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground/80">
                  <User className="w-4 h-4 inline mr-2" />
                  {selectedClient ? translations.selectedClient : translations.selectClient}
                </Label>
                {selectedClient ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <span>✓</span>
                      <span className="font-medium">{translations.selected || 'Selected'}: {selectedClient.full_name}</span>
                      <span className="text-green-600">({selectedClient.user_code})</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-yellow-700">
                      <span>⚠️</span>
                      <span>{translations.selectClientInSidebar || 'Please select a client in the sidebar'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground/80">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  {translations.dateRange}
                </Label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="bg-white/80 backdrop-blur-sm border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-xl border-border/60">
                    <SelectItem value="7">{translations.last7Days}</SelectItem>
                    <SelectItem value="30">{translations.last30Days}</SelectItem>
                    <SelectItem value="90">{translations.last90Days}</SelectItem>
                    <SelectItem value="365">{translations.lastYear}</SelectItem>
                    <SelectItem value="all">{translations.allTime}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground/80">
                  <Search className="w-4 h-4 inline mr-2" />
                  {translations.search}
                </Label>
                <Input
                  placeholder={translations.searchPlaceholder || 'Search by date or meal type'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white/80 backdrop-blur-sm border-border/60"
                />
              </div>

              {/* Chart Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground/80">
                  <BarChart3 className="w-4 h-4 inline mr-2" />
                  {translations.chartType}
                </Label>
                <Select value={chartType} onValueChange={setChartType}>
                  <SelectTrigger className="bg-white/80 backdrop-blur-sm border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-xl border-border/60">
                    <SelectItem value="line">
                      <LineChartIcon className="w-4 h-4 inline mr-2" />
                      {translations.lineChart}
                    </SelectItem>
                    <SelectItem value="area">
                      <PieChartIcon className="w-4 h-4 inline mr-2" />
                      {translations.areaChart}
                    </SelectItem>
                    <SelectItem value="bar">
                      <BarChart3 className="w-4 h-4 inline mr-2" />
                      {translations.barChart}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Metrics Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground/80">
                <Target className="w-4 h-4 inline mr-2" />
                {translations.selectMetrics}
              </Label>
              <div className="flex flex-wrap gap-2">
                {availableMetrics.map((metric) => (
                  <Button
                    key={metric.key}
                    variant={selectedMetrics.includes(metric.key) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (selectedMetrics.includes(metric.key)) {
                        setSelectedMetrics(selectedMetrics.filter(m => m !== metric.key));
                      } else {
                        setSelectedMetrics([...selectedMetrics, metric.key]);
                      }
                    }}
                    className="transition-all duration-300"
                    style={{
                      backgroundColor: selectedMetrics.includes(metric.key) ? metric.color : undefined,
                      borderColor: metric.color
                    }}
                  >
                    <metric.icon className="w-4 h-4 mr-2" />
                    {metric.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Targets Comparison */}
      {renderTargetsComparison()}

      {/* Statistics Cards */}
      {stats && (
        <section className="container mx-auto px-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-primary transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground/70">{translations.totalDays || 'Total Days'}</p>
                    <p className="text-2xl font-bold text-foreground">{stats.totalDays}</p>
                    <p className="text-sm text-muted-foreground/70">{stats.totalMeals} {translations.totalMeals || 'meals logged'}</p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center">
                    <Activity className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-success transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground/70">{translations.averageCalories || 'Daily Avg Calories'}</p>
                    <p className="text-2xl font-bold text-foreground">{stats.averages.calories}</p>
                    <p className="text-sm text-muted-foreground/70">{translations.perDay || 'per day'}</p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-red-500/20 to-red-500/10 rounded-xl flex items-center justify-center">
                    <Flame className="w-6 h-6 text-red-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-info transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground/70">{translations.averageProtein || 'Daily Avg Protein'}</p>
                    <p className="text-2xl font-bold text-foreground">{stats.averages.protein}g</p>
                    <p className="text-sm text-muted-foreground/70">{translations.perDay || 'per day'}</p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-500/10 rounded-xl flex items-center justify-center">
                    <Beef className="w-6 h-6 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-warning transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground/70">{translations.averageCarbs || 'Daily Avg Carbs'}</p>
                    <p className="text-2xl font-bold text-foreground">{stats.averages.carbs}g</p>
                    <p className="text-sm text-muted-foreground/70">{translations.perDay || 'per day'}</p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl flex items-center justify-center">
                    <Cookie className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Charts Section */}
      <section className="container mx-auto px-6 mb-8">
        <Card className="glass-premium border-border/40 shadow-premium">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-bold text-gradient-primary">
                  {translations.nutritionTrends || 'Nutrition Trends'}
                </CardTitle>
                <CardDescription className="text-muted-foreground/70">
                  {translations.nutritionTrendsDescription || 'Track your nutrition intake over time'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {translations.refresh}
                </Button>

                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  {translations.export}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <RefreshCw className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                  <p className="text-muted-foreground">{translations.loadingData}</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-danger/10 rounded-xl flex items-center justify-center">
                    <Zap className="w-6 h-6 text-danger" />
                  </div>
                  <p className="text-danger">{error}</p>
                </div>
              </div>
            ) : !selectedClient ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-info/10 rounded-xl flex items-center justify-center">
                    <User className="w-6 h-6 text-info" />
                  </div>
                  <p className="text-muted-foreground">{translations.selectClientInSidebar || 'Please select a client in the sidebar to view nutrition analytics'}</p>
                </div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-warning/10 rounded-xl flex items-center justify-center">
                    <Apple className="w-6 h-6 text-warning" />
                  </div>
                  <p className="text-muted-foreground">{translations.noNutritionLogsFound || 'No nutrition logs found'}</p>
                  <p className="text-sm text-muted-foreground/70 mt-2">{translations.tryDifferentClientOrDateRange}</p>
                </div>
              </div>
            ) : (
              <div>
                {renderChart()}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Daily Nutrition Summary Table */}
      {chartData.length > 0 && (
        <section className="container mx-auto px-6 pb-20">
          <Card className="glass-premium border-border/40 shadow-premium">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-gradient-primary">
                {translations.dailyNutritionSummary || 'Daily Nutrition Summary'}
              </CardTitle>
              <CardDescription>
                {translations.dailyNutritionSummaryDescription || 'Daily totals for calories and macros'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="p-4 font-semibold text-foreground/80 text-left">{translations.date || 'Date'}</th>
                      <th className="p-4 font-semibold text-foreground/80 text-left">{translations.calories || 'Calories'}</th>
                      <th className="p-4 font-semibold text-foreground/80 text-left">{translations.protein || 'Protein (g)'}</th>
                      <th className="p-4 font-semibold text-foreground/80 text-left">{translations.carbohydrates || 'Carbs (g)'}</th>
                      <th className="p-4 font-semibold text-foreground/80 text-left">{translations.fat || 'Fat (g)'}</th>
                      <th className="p-4 font-semibold text-foreground/80 text-left">{translations.mealsLogged || 'Meals'}</th>
                      <th className="p-4 font-semibold text-foreground/80 text-left">{translations.mealDetails || 'Meal Details'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.slice(0, 10).map((day, index) => (
                      <tr key={index} className="border-b border-border/20 hover:bg-muted/20 transition-colors duration-200">
                        <td className="p-4 text-sm font-medium text-foreground/80">{day.date}</td>
                        <td className="p-4 text-sm font-medium">{day.total_calories}</td>
                        <td className="p-4 text-sm font-medium">{Math.round(day.total_protein_g * 10) / 10}</td>
                        <td className="p-4 text-sm font-medium">{Math.round(day.total_carbs_g * 10) / 10}</td>
                        <td className="p-4 text-sm font-medium">{Math.round(day.total_fat_g * 10) / 10}</td>
                        <td className="p-4 text-sm font-medium">{day.meal_count}</td>
                        <td className="p-4 text-sm">
                          <div className="max-w-md">
                            {day.meals.map((meal, mealIndex) => (
                              <div key={mealIndex} className="mb-2 p-2 bg-muted/30 rounded text-xs">
                                <span className="font-medium">{meal.meal_label || 'Unknown'}: </span>
                                {meal.calories} cal, {Math.round(meal.protein * 10) / 10}g protein
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {chartData.length > 10 && (
                  <div className="flex justify-center mt-6">
                    <p className="text-sm text-muted-foreground">
                      Showing 10 most recent days. Export for full data.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
