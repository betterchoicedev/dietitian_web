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
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  Dumbbell,
  Plus,
  Edit,
  Trash2,
  Save,
  Calculator,
  AlertCircle,
  Info
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
  const { translations, language } = useLanguage();
  const { selectedClient } = useClient();
  const [weightLogs, setWeightLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [dateRange, setDateRange] = useState('30'); // days
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState(['weight_kg']); // Show only weight by default
  const [chartType, setChartType] = useState('line');
  const [displayedLogsCount, setDisplayedLogsCount] = useState(5); // Show top 5 newest entries

  // Form state for adding/editing measurements
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState(null);
  const [formData, setFormData] = useState({
    measurement_date: new Date().toISOString().split('T')[0],
    weight_kg: '',
    height_cm: '',
    neck_circumference_cm: '',
    waist_circumference_cm: '',
    hip_circumference_cm: '',
    arm_circumference_cm: '',
    notes: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Check if current language is Hebrew (RTL)
  const isRTL = language === 'he';

  // Body fat calculation formulas (Navy Method)
  const calculateBodyFat = (height, waist, neck, gender) => {
    if (!height || !waist || !neck) return null;
    
    const H = parseFloat(height);
    const A = parseFloat(waist);
    const N = parseFloat(neck);
    
    if (isNaN(H) || isNaN(A) || isNaN(N)) return null;
    
    let bodyFat;
    if (gender?.toLowerCase() === 'male' || gender?.toLowerCase() === 'm') {
      // Men: %BF = 10.1 - 0.239 × H + 0.808 × A - 0.518 × N
      bodyFat = 10.1 - (0.239 * H) + (0.808 * A) - (0.518 * N);
    } else {
      // Women: %BF = 19.2 - 0.239 × H + 0.808 × A - 0.518 × N
      bodyFat = 19.2 - (0.239 * H) + (0.808 * A) - (0.518 * N);
    }
    
    // Ensure body fat percentage is within reasonable bounds (0-50%)
    return Math.max(0, Math.min(50, bodyFat));
  };

  // Add RTL-specific styles for charts
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Force LTR for all chart elements */
      .chart-container-override {
        direction: ltr !important;
        transform: none !important;
      }
      
      .chart-container-override * {
        direction: ltr !important;
        transform: none !important;
      }
      
      /* Override all recharts elements */
      .chart-container-override .recharts-wrapper {
        direction: ltr !important;
        transform: none !important;
      }
      
      .chart-container-override .recharts-surface {
        direction: ltr !important;
        transform: none !important;
      }
      
      .chart-container-override .recharts-cartesian-axis {
        direction: ltr !important;
        transform: none !important;
      }
      
      .chart-container-override .recharts-cartesian-grid {
        direction: ltr !important;
        transform: none !important;
      }
      
      /* Fix axis labels */
      .chart-container-override .recharts-cartesian-axis-tick-value {
        direction: ltr !important;
        text-anchor: middle !important;
        unicode-bidi: plaintext !important;
        transform: none !important;
      }
      
      .chart-container-override .recharts-cartesian-axis-tick-value tspan {
        direction: ltr !important;
        unicode-bidi: plaintext !important;
        text-anchor: inherit !important;
      }
      
      /* Fix Y-axis specifically */
      .chart-container-override .recharts-yAxis .recharts-cartesian-axis-tick-value {
        text-anchor: end !important;
        direction: ltr !important;
      }
      
      /* Fix X-axis specifically */
      .chart-container-override .recharts-xAxis .recharts-cartesian-axis-tick-value {
        text-anchor: middle !important;
        direction: ltr !important;
      }
      
      /* Fix hover line and cursor */
      .chart-container-override .recharts-cartesian-axis-tick-line {
        direction: ltr !important;
        transform: none !important;
      }
      
      .chart-container-override .recharts-cartesian-grid-horizontal line,
      .chart-container-override .recharts-cartesian-grid-vertical line {
        direction: ltr !important;
        transform: none !important;
      }
      
      /* Fix tooltip positioning */
      .chart-container-override .recharts-tooltip-wrapper {
        direction: ltr !important;
        transform: none !important;
      }
      
      /* Fix legend */
      .chart-container-override .recharts-legend-wrapper {
        direction: ${isRTL ? 'rtl' : 'ltr'} !important;
        text-align: ${isRTL ? 'right' : 'left'} !important;
      }
      
      .chart-container-override .recharts-legend-item {
        direction: ${isRTL ? 'rtl' : 'ltr'} !important;
      }
      
      /* Prevent any RTL transformations */
      .chart-container-override svg {
        direction: ltr !important;
        transform: none !important;
      }
      
      .chart-container-override g {
        direction: ltr !important;
        transform: none !important;
      }
      
      /* Force cursor and hover elements to LTR */
      .chart-container-override .recharts-cursor {
        direction: ltr !important;
        transform: none !important;
      }
      
      .chart-container-override .recharts-active-dot {
        direction: ltr !important;
        transform: none !important;
      }
      
      /* Fix X-axis date label spacing and prevent overlap */
      .chart-container-override .recharts-xAxis .recharts-cartesian-axis-tick-value {
        text-anchor: middle !important;
        direction: ltr !important;
        unicode-bidi: plaintext !important;
        dominant-baseline: hanging !important;
      }
      
      .chart-container-override .recharts-xAxis .recharts-cartesian-axis-tick {
        direction: ltr !important;
        transform: none !important;
      }
      
      /* Ensure proper spacing between X-axis ticks */
      .chart-container-override .recharts-xAxis .recharts-cartesian-axis-tick-value tspan {
        direction: ltr !important;
        unicode-bidi: plaintext !important;
        text-anchor: inherit !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, [isRTL]);

  // Available metrics for selection
  const availableMetrics = [
    { key: 'weight_kg', label: translations.weightKg || 'Weight (kg)', icon: Weight, color: CHART_COLORS.primary },
    { key: 'height_cm', label: translations.heightCm || 'Height (cm)', icon: Ruler, color: CHART_COLORS.emerald },
    { key: 'calculated_body_fat', label: 'Body Fat %', icon: Calculator, color: CHART_COLORS.danger },
    { key: 'neck_circumference_cm', label: translations.neckCircumference || 'Neck (cm)', icon: Ruler, color: CHART_COLORS.indigo },
    { key: 'waist_circumference_cm', label: translations.waistCircumference || 'Waist (cm)', icon: Ruler, color: CHART_COLORS.warning },
    { key: 'hip_circumference_cm', label: translations.hipCircumference || 'Hip (cm)', icon: Ruler, color: CHART_COLORS.info },
    { key: 'arm_circumference_cm', label: translations.armCircumference || 'Arm (cm)', icon: Ruler, color: CHART_COLORS.purple }
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
            measurement_date: log.measurement_date ? 
              (() => {
                const date = new Date(log.measurement_date);
                // Check if date is valid
                if (isNaN(date.getTime())) {
                  return 'Invalid Date';
                }
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear();
                return `${day}/${month}/${year}`;
              })() : 
              'Unknown Date',
            // Ensure numeric values are valid numbers
            weight_kg: typeof log.weight_kg === 'number' && !isNaN(log.weight_kg) ? log.weight_kg : 0,
            height_cm: typeof log.height_cm === 'number' && !isNaN(log.height_cm) ? log.height_cm : 0,
            body_fat_percentage: typeof log.body_fat_percentage === 'number' && !isNaN(log.body_fat_percentage) ? log.body_fat_percentage : 0,
            neck_circumference_cm: typeof log.neck_circumference_cm === 'number' && !isNaN(log.neck_circumference_cm) ? log.neck_circumference_cm : 0,
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

        // Calculate body fat for each measurement
        const dataWithBodyFat = processedData.map(log => {
          const height = log.height_cm || selectedClient?.height_cm;
          const calculatedBodyFat = calculateBodyFat(
            height,
            log.waist_circumference_cm,
            log.neck_circumference_cm,
            selectedClient?.gender
          );
          
          return {
            ...log,
            calculated_body_fat: calculatedBodyFat ? parseFloat(calculatedBodyFat.toFixed(1)) : null,
            height_used: height // Track which height was used for calculation
          };
        });

        setWeightLogs(dataWithBodyFat);
        setFilteredLogs(dataWithBodyFat);
      } catch (err) {
        setError(`Failed to load weight logs: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchWeightLogs();
  }, [selectedClient, language]);

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
    setDisplayedLogsCount(5); // Reset to show only top 5 when filters change
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
    height_cm: log.height_cm,
    body_fat_percentage: log.body_fat_percentage,
    calculated_body_fat: log.calculated_body_fat,
    neck_circumference_cm: log.neck_circumference_cm,
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
  const heightDomain = calculateCustomDomain(chartData, 'height_cm');
  const calculatedBodyFatDomain = calculateCustomDomain(chartData, 'calculated_body_fat');
  const neckDomain = calculateCustomDomain(chartData, 'neck_circumference_cm');
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
      if (metric === 'height_cm') return heightDomain;
      if (metric === 'calculated_body_fat') return calculatedBodyFatDomain;
      if (metric === 'neck_circumference_cm') return neckDomain;
      if (metric === 'waist_circumference_cm') return waistDomain;
      if (metric === 'hip_circumference_cm') return hipDomain;
      if (metric === 'arm_circumference_cm') return armDomain;
    }
    
    // If multiple metrics, use a combined domain that accommodates all
    const allDomains = selectedMetrics.map(metric => {
      if (metric === 'weight_kg') return weightDomain;
      if (metric === 'height_cm') return heightDomain;
      if (metric === 'calculated_body_fat') return calculatedBodyFatDomain;
      if (metric === 'neck_circumference_cm') return neckDomain;
      if (metric === 'waist_circumference_cm') return waistDomain;
      if (metric === 'hip_circumference_cm') return hipDomain;
      if (metric === 'arm_circumference_cm') return armDomain;
      return [0, 100];
    });
    
    const min = Math.min(...allDomains.map(d => d[0]));
    const max = Math.max(...allDomains.map(d => d[1]));
    return [min, max];
  };



  // Custom tooltip for charts with RTL support
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div 
          className="bg-white/95 backdrop-blur-xl border border-border/40 rounded-xl p-4 shadow-xl"
          style={{ 
            direction: isRTL ? 'rtl' : 'ltr',
            textAlign: isRTL ? 'right' : 'left',
            maxWidth: '200px'
          }}
        >
          <p className="font-semibold text-foreground mb-2" style={{ 
            direction: 'ltr', 
            unicodeBidi: 'plaintext',
            textAlign: isRTL ? 'right' : 'left'
          }}>
            {label}
          </p>
          {payload.map((entry, index) => (
            <p key={index} style={{ 
              color: entry.color, 
              direction: isRTL ? 'rtl' : 'ltr',
              textAlign: isRTL ? 'right' : 'left'
            }} className="text-sm">
              <span style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}>
                {entry.value}
              </span>
              {isRTL ? ' :' : ': '}
              {entry.name}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Export weight logs data as CSV
  const handleExport = () => {
    if (!filteredLogs.length) return;

    // Prepare CSV data
    const headers = [
      translations.date || 'Date',
      translations.weightKg || 'Weight (kg)',
      translations.heightCm || 'Height (cm)',
      'Body Fat %',
      translations.neckCircumference || 'Neck (cm)',
      translations.waistCircumference || 'Waist (cm)',
      translations.hipCircumference || 'Hip (cm)',
      translations.armCircumference || 'Arm (cm)'
    ];

    const csvData = filteredLogs.map(log => [
      log.measurement_date,
      log.weight_kg,
      log.height_cm,
      log.calculated_body_fat || log.body_fat_percentage || '',
      log.neck_circumference_cm,
      log.waist_circumference_cm,
      log.hip_circumference_cm,
      log.arm_circumference_cm
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `weight_logs_${selectedClient?.user_code || 'client'}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Form handling functions
  const resetForm = () => {
    setFormData({
      measurement_date: new Date().toISOString().split('T')[0],
      weight_kg: '',
      height_cm: selectedClient?.height_cm?.toString() || '',
      neck_circumference_cm: '',
      waist_circumference_cm: '',
      hip_circumference_cm: '',
      arm_circumference_cm: '',
      notes: ''
    });
    setFormErrors({});
    setEditingMeasurement(null);
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.measurement_date) {
      errors.measurement_date = 'Measurement date is required';
    }
    
    if (!formData.weight_kg || parseFloat(formData.weight_kg) <= 0) {
      errors.weight_kg = 'Valid weight is required';
    }
    
    // Optional fields validation
    if (formData.height_cm && parseFloat(formData.height_cm) <= 0) {
      errors.height_cm = 'Height must be positive';
    }
    
    if (formData.neck_circumference_cm && parseFloat(formData.neck_circumference_cm) <= 0) {
      errors.neck_circumference_cm = 'Neck circumference must be positive';
    }
    
    if (formData.waist_circumference_cm && parseFloat(formData.waist_circumference_cm) <= 0) {
      errors.waist_circumference_cm = 'Waist circumference must be positive';
    }
    
    if (formData.hip_circumference_cm && parseFloat(formData.hip_circumference_cm) <= 0) {
      errors.hip_circumference_cm = 'Hip circumference must be positive';
    }
    
    if (formData.arm_circumference_cm && parseFloat(formData.arm_circumference_cm) <= 0) {
      errors.arm_circumference_cm = 'Arm circumference must be positive';
    }
    
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedClient) {
      setError('No client selected');
      return;
    }
    
    if (!selectedClient.id && !selectedClient.user_code) {
      setError('Invalid client data: missing ID or user code');
      return;
    }
    
    if (!validateForm()) {
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      // Calculate body fat percentage if we have the required measurements
      const height = formData.height_cm ? parseFloat(formData.height_cm) : selectedClient?.height_cm;
      const waist = formData.waist_circumference_cm ? parseFloat(formData.waist_circumference_cm) : null;
      const neck = formData.neck_circumference_cm ? parseFloat(formData.neck_circumference_cm) : null;
      
      let calculatedBodyFat = null;
      if (height && waist && neck) {
        calculatedBodyFat = calculateBodyFat(height, waist, neck, selectedClient?.gender);
      }

      // Prepare data for submission using dedicated database columns
      const measurementData = {
        user_code: selectedClient.user_code,
        measurement_date: formData.measurement_date,
        weight_kg: parseFloat(formData.weight_kg),
        height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
        neck_circumference_cm: formData.neck_circumference_cm ? parseFloat(formData.neck_circumference_cm) : null,
        waist_circumference_cm: formData.waist_circumference_cm ? parseFloat(formData.waist_circumference_cm) : null,
        hip_circumference_cm: formData.hip_circumference_cm ? parseFloat(formData.hip_circumference_cm) : null,
        arm_circumference_cm: formData.arm_circumference_cm ? parseFloat(formData.arm_circumference_cm) : null,
        body_fat_percentage: calculatedBodyFat ? parseFloat(calculatedBodyFat.toFixed(1)) : null,
        notes: formData.notes || null
      };
      
      // Add user_id if available (for foreign key relationship)
      if (selectedClient.id) {
        measurementData.user_id = selectedClient.id;
      }
      
      let result;
      if (editingMeasurement) {
        // Update existing measurement
        result = await WeightLogs.update(editingMeasurement.id, measurementData);
      } else {
        // Create new measurement
        result = await WeightLogs.create(measurementData);
      }
      
      console.log('✅ Measurement saved successfully:', result);
      
      // Update client's height in chat_users table if it's different and height was provided
      if (formData.height_cm) {
        const newHeight = parseFloat(formData.height_cm);
        if (selectedClient.height_cm !== newHeight) {
          try {
            console.log('🔄 Updating client height from', selectedClient.height_cm, 'to', newHeight);
            await ChatUser.update(selectedClient.user_code, { height_cm: newHeight });
            console.log('✅ Client height updated successfully');
            
            // Update the selectedClient context if available
            if (typeof selectedClient.height_cm !== 'undefined') {
              selectedClient.height_cm = newHeight;
            }
          } catch (heightError) {
            console.warn('⚠️ Failed to update client height:', heightError);
            // Don't fail the whole operation if height update fails
          }
        }
      }
      
      // Refresh data
      const data = await WeightLogs.getByUserCode(selectedClient.user_code);
      if (data && data.length > 0) {
        const processedData = data.map((log) => ({
          ...log,
          original_date: log.measurement_date,
          measurement_date: log.measurement_date ? 
            (() => {
              const date = new Date(log.measurement_date);
              if (isNaN(date.getTime())) return 'Invalid Date';
              const day = date.getDate().toString().padStart(2, '0');
              const month = (date.getMonth() + 1).toString().padStart(2, '0');
              const year = date.getFullYear();
              return `${day}/${month}/${year}`;
            })() : 'Unknown Date',
          weight_kg: typeof log.weight_kg === 'number' && !isNaN(log.weight_kg) ? log.weight_kg : 0,
          height_cm: typeof log.height_cm === 'number' && !isNaN(log.height_cm) ? log.height_cm : 0,
          neck_circumference_cm: typeof log.neck_circumference_cm === 'number' && !isNaN(log.neck_circumference_cm) ? log.neck_circumference_cm : 0,
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
        }));

        // Calculate body fat for each measurement
        const dataWithBodyFat = processedData.map(log => {
          const height = log.height_cm || selectedClient?.height_cm;
          const calculatedBodyFat = calculateBodyFat(
            height,
            log.waist_circumference_cm,
            log.neck_circumference_cm,
            selectedClient?.gender
          );
          
          return {
            ...log,
            calculated_body_fat: calculatedBodyFat ? parseFloat(calculatedBodyFat.toFixed(1)) : null,
            height_used: height
          };
        });

        setWeightLogs(dataWithBodyFat);
        setFilteredLogs(dataWithBodyFat);
      }
      
      // Close dialog and reset form
      setShowAddDialog(false);
      resetForm();
      
    } catch (err) {
      console.error('❌ Error saving measurement:', err);
      setError(`Failed to save measurement: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (measurement) => {
    setFormData({
      measurement_date: measurement.original_date ? new Date(measurement.original_date).toISOString().split('T')[0] : '',
      weight_kg: measurement.weight_kg?.toString() || '',
      height_cm: measurement.height_cm?.toString() || selectedClient?.height_cm?.toString() || '',
      neck_circumference_cm: measurement.neck_circumference_cm?.toString() || '',
      waist_circumference_cm: measurement.waist_circumference_cm?.toString() || '',
      hip_circumference_cm: measurement.hip_circumference_cm?.toString() || '',
      arm_circumference_cm: measurement.arm_circumference_cm?.toString() || '',
      notes: measurement.notes || ''
    });
    setEditingMeasurement(measurement);
    setShowAddDialog(true);
  };

  const handleDelete = async (measurement) => {
    if (!confirm('Are you sure you want to delete this measurement? This action cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      await WeightLogs.delete(measurement.id);
      
      // Refresh data
      const data = await WeightLogs.getByUserCode(selectedClient.user_code);
      if (data && data.length > 0) {
        const processedData = data.map((log) => ({
          ...log,
          original_date: log.measurement_date,
          measurement_date: log.measurement_date ? 
            (() => {
              const date = new Date(log.measurement_date);
              if (isNaN(date.getTime())) return 'Invalid Date';
              const day = date.getDate().toString().padStart(2, '0');
              const month = (date.getMonth() + 1).toString().padStart(2, '0');
              const year = date.getFullYear();
              return `${day}/${month}/${year}`;
            })() : 'Unknown Date',
          weight_kg: typeof log.weight_kg === 'number' && !isNaN(log.weight_kg) ? log.weight_kg : 0,
          height_cm: typeof log.height_cm === 'number' && !isNaN(log.height_cm) ? log.height_cm : 0,
          neck_circumference_cm: typeof log.neck_circumference_cm === 'number' && !isNaN(log.neck_circumference_cm) ? log.neck_circumference_cm : 0,
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
        }));

        // Calculate body fat for each measurement
        const dataWithBodyFat = processedData.map(log => {
          const height = log.height_cm || selectedClient?.height_cm;
          const calculatedBodyFat = calculateBodyFat(
            height,
            log.waist_circumference_cm,
            log.neck_circumference_cm,
            selectedClient?.gender
          );
          
          return {
            ...log,
            calculated_body_fat: calculatedBodyFat ? parseFloat(calculatedBodyFat.toFixed(1)) : null,
            height_used: height
          };
        });

        setWeightLogs(dataWithBodyFat);
        setFilteredLogs(dataWithBodyFat);
      } else {
        setWeightLogs([]);
        setFilteredLogs([]);
      }
      
    } catch (err) {
      console.error('❌ Error deleting measurement:', err);
      setError(`Failed to delete measurement: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDialogClose = () => {
    setShowAddDialog(false);
    resetForm();
  };

  // Render chart based on type with RTL support
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
      margin: { 
        top: 20, 
        right: 60, 
        left: 60, 
        bottom: 20 
      }
    };

    // Common axis props with RTL support
    const commonAxisProps = {
      stroke: "#6b7280",
      fontSize: 11, // Slightly smaller font for better fit
      tickLine: false,
      axisLine: false,
      style: {
        direction: 'ltr', // Always keep chart elements in LTR direction
        textAnchor: 'middle', // Center align all labels
        unicodeBidi: 'plaintext' // Prevent number reversal
      }
    };

    // Custom tick formatter to prevent reversal and ensure proper date display
    const formatTick = (value) => {
      if (typeof value === 'string' && value.includes('/')) {
        // This is a date, ensure it's not reversed and is properly formatted
        return value;
      }
      return value;
    };

    // Custom Y-axis formatter to prevent number reversal
    const formatYAxisTick = (value) => {
      // Ensure numbers are displayed correctly
      return value.toString();
    };

    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                {...commonAxisProps}
                angle={0} // No rotation for better readability
                textAnchor="middle"
                height={80} // Increased height for better spacing
                tickFormatter={formatTick}
                interval="preserveStartEnd" // Show first and last tick, skip some in between
                minTickGap={30} // Minimum gap between ticks to prevent overlap
                style={{
                  direction: 'ltr',
                  textAnchor: 'middle',
                  unicodeBidi: 'plaintext'
                }}
              />
              <YAxis 
                {...commonAxisProps}
                domain={getYAxisDomain()}
                orientation="left" // Always use left orientation for consistency
                tickFormatter={formatYAxisTick}
                style={{
                  direction: 'ltr',
                  textAnchor: 'end',
                  unicodeBidi: 'plaintext'
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{
                  direction: isRTL ? 'rtl' : 'ltr',
                  textAlign: isRTL ? 'right' : 'left'
                }}
              />
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
                    connectNulls={true}
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
                {...commonAxisProps}
                angle={0} // No rotation for better readability
                textAnchor="middle"
                height={80} // Increased height for better spacing
                tickFormatter={formatTick}
                interval="preserveStartEnd" // Show first and last tick, skip some in between
                minTickGap={30} // Minimum gap between ticks to prevent overlap
                style={{
                  direction: 'ltr',
                  textAnchor: 'middle',
                  unicodeBidi: 'plaintext'
                }}
              />
              <YAxis 
                {...commonAxisProps}
                domain={getYAxisDomain()}
                orientation="left" // Always use left orientation for consistency
                tickFormatter={formatYAxisTick}
                style={{
                  direction: 'ltr',
                  textAnchor: 'end',
                  unicodeBidi: 'plaintext'
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{
                  direction: isRTL ? 'rtl' : 'ltr',
                  textAlign: isRTL ? 'right' : 'left'
                }}
              />
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
                {...commonAxisProps}
                angle={0} // No rotation for better readability
                textAnchor="middle"
                height={80} // Increased height for better spacing
                tickFormatter={formatTick}
                interval="preserveStartEnd" // Show first and last tick, skip some in between
                minTickGap={30} // Minimum gap between ticks to prevent overlap
                style={{
                  direction: 'ltr',
                  textAnchor: 'middle',
                  unicodeBidi: 'plaintext'
                }}
              />
              <YAxis 
                {...commonAxisProps}
                domain={getYAxisDomain()}
                orientation="left" // Always use left orientation for consistency
                tickFormatter={formatYAxisTick}
                style={{
                  direction: 'ltr',
                  textAnchor: 'end',
                  unicodeBidi: 'plaintext'
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{
                  direction: isRTL ? 'rtl' : 'ltr',
                  textAlign: isRTL ? 'right' : 'left'
                }}
              />
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
          
          {/* Add Measurement CTA */}
          {selectedClient && (
            <div className="flex justify-center mt-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      resetForm();
                      setShowAddDialog(true);
                    }}
                    size="lg"
                    className="gap-3 bg-gradient-to-r from-primary to-primary-dark hover:from-primary/90 hover:to-primary-dark/90 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-8 py-4 text-lg font-semibold"
                  >
                    <Plus className="h-6 w-6" />
                    {translations.addMeasurement || 'Add New Measurement'}
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          )}
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
              <div style={{ textAlign: isRTL ? 'right' : 'left' }}>
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
              <div 
                style={{ 
                  direction: 'ltr', // Force LTR direction for chart container
                  transform: 'none', // Prevent any transforms
                  textAlign: 'left' // Always left align
                }}
                className="chart-container-override"
              >
                {renderChart()}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Data Table */}
      {filteredLogs.length > 0 && (
        <section className="container mx-auto px-6 pb-20">
          <Card className="glass-premium border-border/40 shadow-premium">
            <CardHeader>
              <div style={{ textAlign: isRTL ? 'right' : 'left' }}>
                <CardTitle className="text-xl font-bold text-gradient-primary">
                  {translations.measurementHistory}
                </CardTitle>
                <CardDescription>
                  {translations.measurementHistoryDescription}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>{translations.date || 'Date'}</th>
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>{translations.weightKg || 'Weight (kg)'}</th>
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>{translations.heightCm || 'Height (cm)'}</th>
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>Body Fat %</th>
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>{translations.neckCircumference || 'Neck (cm)'}</th>
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>{translations.waistCircumference || 'Waist (cm)'}</th>
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>{translations.hipCircumference || 'Hip (cm)'}</th>
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>{translations.armCircumference || 'Arm (cm)'}</th>
                      <th className={`p-4 font-semibold text-foreground/80 ${isRTL ? 'text-right' : 'text-left'}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.slice(0, displayedLogsCount).map((log, index) => (
                      <tr key={index} className="border-b border-border/20 hover:bg-muted/20 transition-colors duration-200">
                        <td className={`p-4 text-sm ${isRTL ? 'text-right' : 'text-left'} text-foreground/80`}>{log.measurement_date}</td>
                        <td className={`p-4 text-sm font-medium ${isRTL ? 'text-right' : 'text-left'}`}>{log.weight_kg}</td>
                        <td className={`p-4 text-sm font-medium ${isRTL ? 'text-right' : 'text-left'}`}>{log.height_cm}</td>
                        <td className={`p-4 text-sm font-medium ${isRTL ? 'text-right' : 'text-left'}`}>
                          {log.calculated_body_fat !== null ? (
                            <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
                              {log.calculated_body_fat}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className={`p-4 text-sm font-medium ${isRTL ? 'text-right' : 'text-left'}`}>{log.neck_circumference_cm}</td>
                        <td className={`p-4 text-sm font-medium ${isRTL ? 'text-right' : 'text-left'}`}>{log.waist_circumference_cm}</td>
                        <td className={`p-4 text-sm font-medium ${isRTL ? 'text-right' : 'text-left'}`}>{log.hip_circumference_cm}</td>
                        <td className={`p-4 text-sm font-medium ${isRTL ? 'text-right' : 'text-left'}`}>{log.arm_circumference_cm}</td>
                        <td className={`p-4 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleEdit(log)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => handleDelete(log)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLogs.length > displayedLogsCount && (
                  <div className="flex justify-center mt-6 gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDisplayedLogsCount(prev => prev + 5)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {translations.loadMore}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDisplayedLogsCount(filteredLogs.length)}
                      className="text-primary hover:text-primary/80"
                    >
                      {translations.showAll}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
  
      {/* Add/Edit Measurement Dialog */}
      <Dialog open={showAddDialog} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingMeasurement ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingMeasurement ? (translations.editMeasurement || 'Edit Measurement') : (translations.addMeasurement || 'Add New Measurement')}
            </DialogTitle>
            <DialogDescription>
              {editingMeasurement 
                ? 'Update the body measurement data for this client.'
                : 'Enter body measurement data for the selected client. Weight is required, other measurements are optional.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-6">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="measurement_date">
                {translations.measurementDate || 'Measurement Date'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="measurement_date"
                type="date"
                value={formData.measurement_date}
                onChange={(e) => setFormData(prev => ({ ...prev, measurement_date: e.target.value }))}
                className={formErrors.measurement_date ? 'border-destructive' : ''}
              />
              {formErrors.measurement_date && (
                <p className="text-sm text-destructive">{formErrors.measurement_date}</p>
              )}
            </div>

            {/* Weight and Height */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight_kg">
                  {translations.weightKg || 'Weight (kg)'} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="weight_kg"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="70.5"
                  value={formData.weight_kg}
                  onChange={(e) => setFormData(prev => ({ ...prev, weight_kg: e.target.value }))}
                  className={formErrors.weight_kg ? 'border-destructive' : ''}
                />
                {formErrors.weight_kg && (
                  <p className="text-sm text-destructive">{formErrors.weight_kg}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="height_cm">
                  {translations.heightCm || 'Height (cm)'}
                </Label>
                <Input
                  id="height_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="175.0"
                  value={formData.height_cm}
                  onChange={(e) => setFormData(prev => ({ ...prev, height_cm: e.target.value }))}
                  className={formErrors.height_cm ? 'border-destructive' : ''}
                />
                {formErrors.height_cm && (
                  <p className="text-sm text-destructive">{formErrors.height_cm}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Optional: Updates client profile if changed
                </p>
              </div>
            </div>

            {/* Circumference measurements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="neck_circumference_cm">
                  {translations.neckCircumference || 'Neck Circumference (cm)'}
                </Label>
                <Input
                  id="neck_circumference_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="38.0"
                  value={formData.neck_circumference_cm}
                  onChange={(e) => setFormData(prev => ({ ...prev, neck_circumference_cm: e.target.value }))}
                  className={formErrors.neck_circumference_cm ? 'border-destructive' : ''}
                />
                {formErrors.neck_circumference_cm && (
                  <p className="text-sm text-destructive">{formErrors.neck_circumference_cm}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="waist_circumference_cm">
                  {translations.waistCircumference || 'Waist Circumference (cm)'}
                </Label>
                <Input
                  id="waist_circumference_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="85.0"
                  value={formData.waist_circumference_cm}
                  onChange={(e) => setFormData(prev => ({ ...prev, waist_circumference_cm: e.target.value }))}
                  className={formErrors.waist_circumference_cm ? 'border-destructive' : ''}
                />
                {formErrors.waist_circumference_cm && (
                  <p className="text-sm text-destructive">{formErrors.waist_circumference_cm}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hip_circumference_cm">
                  {translations.hipCircumference || 'Hip Circumference (cm)'}
                </Label>
                <Input
                  id="hip_circumference_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="95.0"
                  value={formData.hip_circumference_cm}
                  onChange={(e) => setFormData(prev => ({ ...prev, hip_circumference_cm: e.target.value }))}
                  className={formErrors.hip_circumference_cm ? 'border-destructive' : ''}
                />
                {formErrors.hip_circumference_cm && (
                  <p className="text-sm text-destructive">{formErrors.hip_circumference_cm}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="arm_circumference_cm">
                  {translations.armCircumference || 'Arm Circumference (cm)'}
                </Label>
                <Input
                  id="arm_circumference_cm"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="32.0"
                  value={formData.arm_circumference_cm}
                  onChange={(e) => setFormData(prev => ({ ...prev, arm_circumference_cm: e.target.value }))}
                  className={formErrors.arm_circumference_cm ? 'border-destructive' : ''}
                />
                {formErrors.arm_circumference_cm && (
                  <p className="text-sm text-destructive">{formErrors.arm_circumference_cm}</p>
                )}
              </div>
            </div>


            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this measurement..."
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            {/* Body fat calculation preview */}
            {selectedClient && formData.height_cm && formData.waist_circumference_cm && formData.neck_circumference_cm && (
              <div className="p-4 bg-gradient-to-r from-primary/5 to-success/5 rounded-lg border border-primary/20">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  Body Fat Auto-Calculation
                </h4>
                <p className="text-sm font-medium text-primary">
                  Will be calculated and stored: {calculateBodyFat(
                    parseFloat(formData.height_cm) || 0,
                    parseFloat(formData.waist_circumference_cm) || 0,
                    parseFloat(formData.neck_circumference_cm) || 0,
                    selectedClient.gender
                  )?.toFixed(1) || 'N/A'}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Navy Method Formula - Height: {formData.height_cm}cm, Waist: {formData.waist_circumference_cm}cm, Neck: {formData.neck_circumference_cm}cm
                </p>
                <p className="text-xs text-success mt-1 font-medium">
                  ✓ This will be automatically saved to the database
                </p>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleDialogClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {editingMeasurement ? (translations.updateMeasurement || 'Update') : (translations.saveMeasurement || 'Save')} Measurement
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
} 