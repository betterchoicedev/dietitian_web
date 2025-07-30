import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { WeightLogs, ChatUser } from '@/api/entities';
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
  PieChart,
  Pie,
  Cell,
  ComposedChart
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Activity,
  Users,
  Calendar,
  Search,
  Filter,
  Download,
  RefreshCw,
  Target,
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
  Ruler,
  Weight,
  Heart,
  Dumbbell
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
  amber: '#D97706'
};

const CHART_COLORS_ARRAY = Object.values(CHART_COLORS);

export default function UserWeightLogs() {
  const { translations } = useLanguage();
  const { selectedClient } = useClient();
  const [weightLogs, setWeightLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [dateRange, setDateRange] = useState('30'); // days
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState(['weight_kg', 'body_fat_percentage']);
  const [chartType, setChartType] = useState('line');

  // Available metrics for selection
  const availableMetrics = [
    { key: 'weight_kg', label: translations.weightKg, icon: Weight, color: CHART_COLORS.primary },
    { key: 'body_fat_percentage', label: translations.bodyFatPercentage, icon: Heart, color: CHART_COLORS.danger },
    { key: 'waist_circumference_cm', label: translations.waistCm, icon: Ruler, color: CHART_COLORS.warning },
    { key: 'hip_circumference_cm', label: translations.hipCm, icon: Ruler, color: CHART_COLORS.info },
    { key: 'arm_circumference_cm', label: translations.armCm, icon: Ruler, color: CHART_COLORS.purple }
  ];

  // Fetch weight logs when selectedClient changes
  useEffect(() => {
    const fetchWeightLogs = async () => {
      if (!selectedClient) {
        setWeightLogs([]);
        setFilteredLogs([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const data = await WeightLogs.getByUserCode(selectedClient.user_code);

        if (!data || data.length === 0) {
          setWeightLogs([]);
          setFilteredLogs([]);
          setLoading(false);
          return;
        }

        // Process the data
        const processedData = data.map((log) => {
          return {
            ...log,
            // Keep original date for filtering, add display date for UI
            original_date: log.measurement_date,
            measurement_date: log.measurement_date ? new Date(log.measurement_date).toLocaleDateString() : 'Unknown Date',
            // Ensure numeric values are valid numbers
            weight_kg: typeof log.weight_kg === 'number' && !isNaN(log.weight_kg) ? log.weight_kg : 0,
            body_fat_percentage: typeof log.body_fat_percentage === 'number' && !isNaN(log.body_fat_percentage) ? log.body_fat_percentage : 0,
            waist_circumference_cm: typeof log.waist_circumference_cm === 'number' && !isNaN(log.waist_circumference_cm) ? log.waist_circumference_cm : 0,
            hip_circumference_cm: typeof log.hip_circumference_cm === 'number' && !isNaN(log.hip_circumference_cm) ? log.hip_circumference_cm : 0,
            arm_circumference_cm: typeof log.arm_circumference_cm === 'number' && !isNaN(log.arm_circumference_cm) ? log.arm_circumference_cm : 0,
            // Parse JSON fields if they're strings
            general_measurements: typeof log.general_measurements === 'string' 
              ? JSON.parse(log.general_measurements) 
              : log.general_measurements,
            body_composition: typeof log.body_composition === 'string' 
              ? JSON.parse(log.body_composition) 
              : log.body_composition,
            central_measurements: typeof log.central_measurements === 'string' 
              ? JSON.parse(log.central_measurements) 
              : log.central_measurements,
            hip_measurements: typeof log.hip_measurements === 'string' 
              ? JSON.parse(log.hip_measurements) 
              : log.hip_measurements,
            limb_measurements: typeof log.limb_measurements === 'string' 
              ? JSON.parse(log.limb_measurements) 
              : log.limb_measurements
          };
        });

        setWeightLogs(processedData);
        setFilteredLogs(processedData);
      } catch (err) {
        setError(`Failed to load weight logs: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchWeightLogs();
  }, [selectedClient]);

  // Filter data based on date range and search
  useEffect(() => {
    let filtered = weightLogs;

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
        log.measurement_date.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  }, [weightLogs, dateRange, searchTerm]);

  // Calculate statistics
  const calculateStats = () => {
    if (filteredLogs.length === 0) return null;

    const latest = filteredLogs[filteredLogs.length - 1];
    const earliest = filteredLogs[0];
    
    // Ensure we have valid numeric values
    const latestWeight = typeof latest.weight_kg === 'number' && !isNaN(latest.weight_kg) ? latest.weight_kg : 0;
    const earliestWeight = typeof earliest.weight_kg === 'number' && !isNaN(earliest.weight_kg) ? earliest.weight_kg : 0;
    const latestBodyFat = typeof latest.body_fat_percentage === 'number' && !isNaN(latest.body_fat_percentage) ? latest.body_fat_percentage : 0;
    const earliestBodyFat = typeof earliest.body_fat_percentage === 'number' && !isNaN(earliest.body_fat_percentage) ? earliest.body_fat_percentage : 0;
    
    const weightChange = latestWeight - earliestWeight;
    const bodyFatChange = latestBodyFat - earliestBodyFat;

    // Calculate percentage changes with division by zero protection
    const weightChangePercent = earliestWeight > 0 
      ? ((weightChange / earliestWeight) * 100).toFixed(1)
      : '0.0';
    
    const bodyFatChangePercent = earliestBodyFat > 0 
      ? ((bodyFatChange / earliestBodyFat) * 100).toFixed(1)
      : '0.0';

    // Calculate averages with validation
    const validWeightLogs = filteredLogs.filter(log => typeof log.weight_kg === 'number' && !isNaN(log.weight_kg));
    const validBodyFatLogs = filteredLogs.filter(log => typeof log.body_fat_percentage === 'number' && !isNaN(log.body_fat_percentage));
    
    const averageWeight = validWeightLogs.length > 0 
      ? (validWeightLogs.reduce((sum, log) => sum + log.weight_kg, 0) / validWeightLogs.length).toFixed(1)
      : '0.0';
    
    const averageBodyFat = validBodyFatLogs.length > 0 
      ? (validBodyFatLogs.reduce((sum, log) => sum + log.body_fat_percentage, 0) / validBodyFatLogs.length).toFixed(1)
      : '0.0';

    return {
      totalMeasurements: filteredLogs.length,
      latestWeight: latestWeight,
      latestBodyFat: latestBodyFat,
      weightChange,
      bodyFatChange,
      weightChangePercent,
      bodyFatChangePercent,
      averageWeight,
      averageBodyFat
    };
  };

  const stats = calculateStats();

  // Prepare chart data
  const chartData = filteredLogs.map(log => ({
    date: log.measurement_date,
    weight_kg: log.weight_kg,
    body_fat_percentage: log.body_fat_percentage,
    waist_circumference_cm: log.waist_circumference_cm,
    hip_circumference_cm: log.hip_circumference_cm,
    arm_circumference_cm: log.arm_circumference_cm
  }));

  // Calculate custom domains for better scaling with small differences
  const calculateCustomDomain = (data, key) => {
    if (!data || data.length === 0) return [0, 100];
    
    const values = data.map(item => item[key]).filter(val => val !== null && val !== undefined);
    if (values.length === 0) return [0, 100];
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    // If the range is very small (less than 5% of the average), expand it
    const average = (min + max) / 2;
    const minRange = average * 0.05; // 5% of average
    
    if (range < minRange) {
      const padding = (minRange - range) / 2;
      return [min - padding, max + padding];
    }
    
    // Add some padding for better visualization
    const padding = range * 0.1;
    return [min - padding, max + padding];
  };

  // Calculate domains for each metric
  const weightDomain = calculateCustomDomain(chartData, 'weight_kg');
  const bodyFatDomain = calculateCustomDomain(chartData, 'body_fat_percentage');
  const waistDomain = calculateCustomDomain(chartData, 'waist_circumference_cm');
  const hipDomain = calculateCustomDomain(chartData, 'hip_circumference_cm');
  const armDomain = calculateCustomDomain(chartData, 'arm_circumference_cm');

  // Helper function to get domain for selected metrics
  const getYAxisDomain = () => {
    if (selectedMetrics.length === 0) return 'auto';
    
    // If only one metric is selected, use its specific domain
    if (selectedMetrics.length === 1) {
      const metric = selectedMetrics[0];
      if (metric === 'weight_kg') return weightDomain;
      if (metric === 'body_fat_percentage') return bodyFatDomain;
      if (metric === 'waist_circumference_cm') return waistDomain;
      if (metric === 'hip_circumference_cm') return hipDomain;
      if (metric === 'arm_circumference_cm') return armDomain;
    }
    
    // If multiple metrics, use a combined domain that accommodates all
    const allDomains = selectedMetrics.map(metric => {
      if (metric === 'weight_kg') return weightDomain;
      if (metric === 'body_fat_percentage') return bodyFatDomain;
      if (metric === 'waist_circumference_cm') return waistDomain;
      if (metric === 'hip_circumference_cm') return hipDomain;
      if (metric === 'arm_circumference_cm') return armDomain;
      return [0, 100];
    });
    
    const min = Math.min(...allDomains.map(d => d[0]));
    const max = Math.max(...allDomains.map(d => d[1]));
    return [min, max];
  };



  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-xl border border-border/40 rounded-xl p-4 shadow-xl">
          <p className="font-semibold text-foreground mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Render chart based on type
  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{translations.noDataAvailableForFilters}</p>
          </div>
        </div>
      );
    }

    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 20 }
    };

    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={getYAxisDomain()}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {selectedMetrics.map((metric, index) => {
                const metricInfo = availableMetrics.find(m => m.key === metric);
                return (
                  <Line
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    stroke={metricInfo?.color || CHART_COLORS_ARRAY[index % CHART_COLORS_ARRAY.length]}
                    strokeWidth={3}
                    dot={{ fill: metricInfo?.color || CHART_COLORS_ARRAY[index % CHART_COLORS_ARRAY.length], strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                    name={metricInfo?.label || metric}
                  />
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
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={getYAxisDomain()}
              />
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
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={getYAxisDomain()}
              />
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
              <Activity className="w-10 h-10 text-white" />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gradient-primary font-heading mb-4 animate-slide-up text-center">
            {translations.weightLogs}
          </h1>
          
          <p className="text-xl text-muted-foreground/80 max-w-3xl mx-auto animate-slide-up text-center" style={{ animationDelay: '0.1s' }}>
            {translations.weightLogsDescription}
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
                  placeholder={translations.searchPlaceholder}
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

      {/* Statistics Cards */}
      {stats && (
        <section className="container mx-auto px-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-primary transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground/70">{translations.totalMeasurements}</p>
                    <p className="text-2xl font-bold text-foreground">{stats.totalMeasurements}</p>
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
                    <p className="text-sm font-medium text-muted-foreground/70">{translations.currentWeight}</p>
                    <p className="text-2xl font-bold text-foreground">{stats.latestWeight} kg</p>
                    <div className="flex items-center mt-1">
                      {stats.weightChange > 0 ? (
                        <ArrowUpRight className="w-4 h-4 text-danger mr-1" />
                      ) : stats.weightChange < 0 ? (
                        <ArrowDownRight className="w-4 h-4 text-success mr-1" />
                      ) : (
                        <Minus className="w-4 h-4 text-muted-foreground mr-1" />
                      )}
                      <span className={`text-sm ${stats.weightChange > 0 ? 'text-danger' : stats.weightChange < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                        {stats.weightChange > 0 ? '+' : ''}{stats.weightChange.toFixed(1)} kg ({stats.weightChangePercent}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-success/20 to-success/10 rounded-xl flex items-center justify-center">
                    <Weight className="w-6 h-6 text-success" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-warning transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground/70">{translations.bodyFatPercentage}</p>
                    <p className="text-2xl font-bold text-foreground">{stats.latestBodyFat}%</p>
                    <div className="flex items-center mt-1">
                      {stats.bodyFatChange > 0 ? (
                        <ArrowUpRight className="w-4 h-4 text-danger mr-1" />
                      ) : stats.bodyFatChange < 0 ? (
                        <ArrowDownRight className="w-4 h-4 text-success mr-1" />
                      ) : (
                        <Minus className="w-4 h-4 text-muted-foreground mr-1" />
                      )}
                      <span className={`text-sm ${stats.bodyFatChange > 0 ? 'text-danger' : stats.bodyFatChange < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                        {stats.bodyFatChange > 0 ? '+' : ''}{stats.bodyFatChange.toFixed(1)}% ({stats.bodyFatChangePercent}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-warning/20 to-warning/10 rounded-xl flex items-center justify-center">
                    <Heart className="w-6 h-6 text-warning" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-premium border-border/40 shadow-premium hover:shadow-glow-info transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground/70">{translations.avgWeight}</p>
                    <p className="text-2xl font-bold text-foreground">{stats.averageWeight} kg</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">{translations.periodAverage}</p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-info/20 to-info/10 rounded-xl flex items-center justify-center">
                    <Target className="w-6 h-6 text-info" />
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
                  {translations.progressChart}
                </CardTitle>
                <CardDescription className="text-muted-foreground/70">
                  {translations.progressChartDescription}
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

                <Button variant="outline" size="sm">
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
                  <p className="text-muted-foreground">{translations.selectClientInSidebar || 'Please select a client in the sidebar to view weight logs'}</p>
                </div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-warning/10 rounded-xl flex items-center justify-center">
                    <Scale className="w-6 h-6 text-warning" />
                  </div>
                  <p className="text-muted-foreground">{translations.noWeightLogsFound}</p>
                  <p className="text-sm text-muted-foreground/70 mt-2">{translations.tryDifferentClientOrDateRange}</p>
                </div>
              </div>
            ) : (
              renderChart()
            )}
          </CardContent>
        </Card>
      </section>

      {/* Data Table */}
      {filteredLogs.length > 0 && (
        <section className="container mx-auto px-6 pb-20">
          <Card className="glass-premium border-border/40 shadow-premium">
            <CardHeader>
                          <CardTitle className="text-xl font-bold text-gradient-primary">
              {translations.measurementHistory}
            </CardTitle>
            <CardDescription>
              {translations.measurementHistoryDescription}
            </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left p-4 font-semibold text-foreground/80">{translations.date || 'Date'}</th>
                      <th className="text-left p-4 font-semibold text-foreground/80">{translations.weightKg}</th>
                      <th className="text-left p-4 font-semibold text-foreground/80">{translations.bodyFatPercentage}</th>
                      <th className="text-left p-4 font-semibold text-foreground/80">{translations.waistCm}</th>
                      <th className="text-left p-4 font-semibold text-foreground/80">{translations.hipCm}</th>
                      <th className="text-left p-4 font-semibold text-foreground/80">{translations.armCm}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log, index) => (
                      <tr key={index} className="border-b border-border/20 hover:bg-muted/20 transition-colors duration-200">
                        <td className="p-4 text-sm text-foreground/80">{log.measurement_date}</td>
                        <td className="p-4 text-sm font-medium">{log.weight_kg}</td>
                        <td className="p-4 text-sm font-medium">{log.body_fat_percentage}%</td>
                        <td className="p-4 text-sm font-medium">{log.waist_circumference_cm}</td>
                        <td className="p-4 text-sm font-medium">{log.hip_circumference_cm}</td>
                        <td className="p-4 text-sm font-medium">{log.arm_circumference_cm}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
} 