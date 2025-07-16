import React, { useState, useEffect } from 'react';
import { ChatUser } from '@/api/entities';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  Search, 
  UserPlus, 
  Users as UsersIcon, 
  Mail, 
  Phone, 
  Edit,
  Plus,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

const generateUniqueCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const chars = letters + numbers;
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export default function Clients() {
  const { translations } = useLanguage();
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentClient, setCurrentClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  
  // Sorting and filtering state
  const [sortField, setSortField] = useState('full_name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filters, setFilters] = useState({
    goal: 'all',
    activity: 'all',
    gender: 'all',
    ageRange: { min: '', max: '' }
  });
  const [showFilters, setShowFilters] = useState(false);
  
  const [formData, setFormData] = useState({
    user_code: '',
    full_name: '',
    email: '',
    phone_number: '',
    city: '',
    age: '',
    date_of_birth: '',
    gender: '',
    weight_kg: '',
    height_cm: '',
    food_allergies: '',
    macros: {
      fat: '',
      carbs: '',
      protein: ''
    },
    dailyTotalCalories: '',
    recommendations: '',
    food_limitations: '',
    Activity_level: '',
    goal: '',
    number_of_meals: '',
    client_preference: '',
    region: 'israel'
  });

  // Add macro slider state
  const [macroSliders, setMacroSliders] = useState({ protein: 0, carbs: 0, fat: 0 });

  useEffect(() => {
    loadClients();
  }, []);

  // Helper to recalculate macros so that 4*protein + 4*carbs + 9*fat = calories
  const recalculateMacros = (changed, value, calories, prevMacros) => {
    // Clamp value to min/max
    const min = { protein: 0, carbs: 0, fat: 0 };
    const max = { protein: 300, carbs: 400, fat: 150 };
    value = Math.max(min[changed], Math.min(max[changed], value));
    let macros = { ...prevMacros, [changed]: value };
    // Calculate remaining calories
    let calUsed = 0;
    if (changed === 'protein') calUsed = 4 * value;
    if (changed === 'carbs') calUsed = 4 * value;
    if (changed === 'fat') calUsed = 9 * value;
    let otherMacros = Object.keys(macros).filter(m => m !== changed);
    let otherCal = calories - (changed === 'fat' ? 9 : 4) * value;
    // Distribute remaining calories proportionally to the other two macros
    let totalPrev = otherMacros.reduce((sum, m) => sum + (prevMacros[m] || 0), 0) || 1;
    let newMacros = { ...macros };
    otherMacros.forEach(m => {
      let factor = (prevMacros[m] || 0) / totalPrev;
      let calPerGram = m === 'fat' ? 9 : 4;
      let grams = Math.max(min[m], Math.min(max[m], Math.round((otherCal * factor) / calPerGram)));
      newMacros[m] = grams;
    });
    // Final adjustment to ensure total calories match
    let totalCals = 4 * newMacros.protein + 4 * newMacros.carbs + 9 * newMacros.fat;
    if (totalCals !== calories) {
      // Adjust the last macro to fix rounding
      let last = otherMacros[1];
      let calPerGram = last === 'fat' ? 9 : 4;
      newMacros[last] += Math.round((calories - totalCals) / calPerGram);
      newMacros[last] = Math.max(min[last], Math.min(max[last], newMacros[last]));
    }
    return newMacros;
  };

  // Sorting function
  const sortClients = (clients) => {
    return [...clients].sort((a, b) => {
      // First, prioritize users with names over those without names
      const aHasName = a.full_name && a.full_name.trim() !== '';
      const bHasName = b.full_name && b.full_name.trim() !== '';
      
      if (aHasName && !bHasName) return -1; // a has name, b doesn't - a comes first
      if (!aHasName && bHasName) return 1;  // b has name, a doesn't - b comes first
      
      // If both have names or both don't have names, apply normal sorting
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      // Handle nested properties
      if (sortField === 'macros.protein') {
        aValue = a.macros?.protein || 0;
        bValue = b.macros?.protein || 0;
      } else if (sortField === 'macros.carbs') {
        aValue = a.macros?.carbs || 0;
        bValue = b.macros?.carbs || 0;
      } else if (sortField === 'macros.fat') {
        aValue = a.macros?.fat || 0;
        bValue = b.macros?.fat || 0;
      }
      
      // Convert to numbers for numeric fields
      if (['age', 'weight_kg', 'height_cm', 'dailyTotalCalories'].includes(sortField)) {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      }
      
      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  // Filtering function
  const filterClients = (clients) => {
    return clients.filter(client => {
      // Goal filter
      if (filters.goal && filters.goal !== 'all' && client.goal !== filters.goal) return false;
      
      // Activity filter
      if (filters.activity && filters.activity !== 'all' && client.Activity_level !== filters.activity) return false;
      
      // Gender filter
      if (filters.gender && filters.gender !== 'all' && client.gender !== filters.gender) return false;
      
      // Age range filter
      if (filters.ageRange.min && client.age < parseInt(filters.ageRange.min)) return false;
      if (filters.ageRange.max && client.age > parseInt(filters.ageRange.max)) return false;
      
      return true;
    });
  };

  // Handle sort column click
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      goal: 'all',
      activity: 'all',
      gender: 'all',
      ageRange: { min: '', max: '' }
    });
  };

  // Get sort icon
  const getSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  // Sync macro sliders with formData and calories
  useEffect(() => {
    let cals = parseInt(formData.dailyTotalCalories) || 0;
    if (cals > 0) {
      // If all macros are empty or 0, initialize to 30% protein, 40% carbs, 30% fat
      if ((!macroSliders.protein && !macroSliders.carbs && !macroSliders.fat) || 
          (macroSliders.protein === 0 && macroSliders.carbs === 0 && macroSliders.fat === 0)) {
        let p = Math.round((0.3 * cals) / 4);
        let c = Math.round((0.4 * cals) / 4);
        let f = Math.round((0.3 * cals) / 9);
        setMacroSliders({ protein: p, carbs: c, fat: f });
        setFormData(fd => ({ ...fd, macros: { protein: p, carbs: c, fat: f } }));
      } else {
        // Recalculate macros to match calories
        let totalCals = 4 * macroSliders.protein + 4 * macroSliders.carbs + 9 * macroSliders.fat;
        if (totalCals !== cals) {
          let newMacros = recalculateMacros('protein', macroSliders.protein, cals, macroSliders);
          setMacroSliders(newMacros);
          setFormData(fd => ({ ...fd, macros: newMacros }));
        }
      }
    }
  }, [formData.dailyTotalCalories]);

  // When macroSliders change, update formData.macros
  useEffect(() => {
    setFormData(fd => ({ ...fd, macros: macroSliders }));
  }, [macroSliders]);

  // Reset macro sliders when dialog opens for new user
  useEffect(() => {
    if (dialogOpen && !currentClient) {
      setMacroSliders({ protein: 0, carbs: 0, fat: 0 });
    }
  }, [dialogOpen, currentClient]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const clientData = await ChatUser.list();
      setClients(clientData || []);
      setError(null);
    } catch (error) {
      console.error('Error loading clients:', error);
      setError(translations.failedToLoadClients);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(client => 
    client.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.user_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.phone_number?.includes(searchTerm)
  );

  // Apply filters and sorting
  const processedClients = sortClients(filterClients(filteredClients));

  // Limit displayed clients to 5 unless "Show All" is clicked or searching
  const displayedClients = searchTerm || showAll ? processedClients : processedClients.slice(0, 5);
  const hasMoreClients = !searchTerm && !showAll && processedClients.length > 5;

  const resetForm = () => {
    setFormData({
      user_code: generateUniqueCode(),
      full_name: '',
      email: '',
      phone_number: '',
      city: '',
      age: '',
      date_of_birth: '',
      gender: '',
      weight_kg: '',
      height_cm: '',
      food_allergies: '',
      macros: {
        fat: '',
        carbs: '',
        protein: ''
      },
      dailyTotalCalories: '',
      recommendations: '',
      food_limitations: '',
      Activity_level: '',
      goal: '',
      number_of_meals: '5',
      client_preference: '',
      region: 'israel'
    });
    // Reset macro sliders to 0 when adding new user
    setMacroSliders({ protein: 0, carbs: 0, fat: 0 });
  };

  const handleAdd = () => {
    setCurrentClient(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (client) => {
    setCurrentClient(client);
    
    // Parse macros for sliders
    const proteinValue = client.macros?.protein ? parseInt(client.macros.protein.toString().replace('g', '')) || 0 : 0;
    const carbsValue = client.macros?.carbs ? parseInt(client.macros.carbs.toString().replace('g', '')) || 0 : 0;
    const fatValue = client.macros?.fat ? parseInt(client.macros.fat.toString().replace('g', '')) || 0 : 0;
    
    setFormData({
      user_code: client.user_code || generateUniqueCode(),
      full_name: client.full_name || '',
      email: client.email || '',
      phone_number: client.phone_number || '',
      city: client.city || '',
      age: client.age?.toString() || '',
      date_of_birth: client.date_of_birth || '',
      gender: client.gender || '',
      weight_kg: client.weight_kg?.toString() || '',
      height_cm: client.height_cm?.toString() || '',
      food_allergies: Array.isArray(client.food_allergies) ? client.food_allergies.join(', ') : client.food_allergies || '',
      macros: {
        fat: client.macros?.fat ? client.macros.fat.toString().replace('g', '') : '',
        carbs: client.macros?.carbs ? client.macros.carbs.toString().replace('g', '') : '',
        protein: client.macros?.protein ? client.macros.protein.toString().replace('g', '') : ''
      },
      dailyTotalCalories: client.dailyTotalCalories?.toString() || '',
      recommendations: typeof client.recommendations === 'object' ? JSON.stringify(client.recommendations, null, 2) : client.recommendations || '',
      food_limitations: Array.isArray(client.food_limitations) ? client.food_limitations.join(', ') : 
                       typeof client.food_limitations === 'object' ? JSON.stringify(client.food_limitations, null, 2) : 
                       client.food_limitations || '',
      Activity_level: client.Activity_level || '',
      goal: client.goal || '',
      number_of_meals: client.number_of_meals?.toString() || '5',
      client_preference: typeof client.client_preference === 'object' ? JSON.stringify(client.client_preference, null, 2) : client.client_preference || '',
      region: client.region || 'israel'
    });
    
    // Set macro sliders to match the client's macros
    setMacroSliders({ protein: proteinValue, carbs: carbsValue, fat: fatValue });
    setDialogOpen(true);
  };

  const parseJsonField = (value, fieldType = 'object') => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch (e) {
      // If JSON parsing fails, convert text to appropriate structure
      const trimmedValue = value.trim();
      
      if (fieldType === 'array') {
        // Convert to array format
        if (trimmedValue.includes(',')) {
          return trimmedValue.split(',').map(item => item.trim()).filter(item => item);
        }
        return [trimmedValue];
      } else if (fieldType === 'recommendations') {
        // Convert to recommendations object format
        if (trimmedValue.includes(',')) {
          const items = trimmedValue.split(',').map(item => item.trim());
          const result = {};
          items.forEach((item, index) => {
            result[`recommendation_${index + 1}`] = item;
          });
          return result;
        }
        return { general: trimmedValue };
      }
      
      // Default: return as string
      return trimmedValue;
    }
  };

  const parseArrayField = (value) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return [];
    
    // Try JSON parsing first
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      return [parsed.toString()];
    } catch (e) {
      // Convert text to array
      if (value.includes(',')) {
        return value.split(',').map(item => item.trim()).filter(item => item);
      }
      return [value.trim()];
    }
  };

  const parseMacrosField = (protein, carbs, fat) => {
    const result = {};
    
    // Handle protein
    if (protein) {
      if (typeof protein === 'number' && protein > 0) {
        result.protein = `${protein}g`;
      } else if (typeof protein === 'string' && protein.trim()) {
        const p = protein.trim();
        result.protein = p.endsWith('g') ? p : `${p}g`;
      }
    }
    
    // Handle carbs
    if (carbs) {
      if (typeof carbs === 'number' && carbs > 0) {
        result.carbs = `${carbs}g`;
      } else if (typeof carbs === 'string' && carbs.trim()) {
        const c = carbs.trim();
        result.carbs = c.endsWith('g') ? c : `${c}g`;
      }
    }
    
    // Handle fat
    if (fat) {
      if (typeof fat === 'number' && fat > 0) {
        result.fat = `${fat}g`;
      } else if (typeof fat === 'string' && fat.trim()) {
        const f = fat.trim();
        result.fat = f.endsWith('g') ? f : `${f}g`;
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.full_name || formData.full_name.trim() === '') {
        throw new Error('Full name is required');
      }

      const submitData = {
        ...formData,
        full_name: formData.full_name.trim(),
        email: formData.email ? formData.email.trim() : '',
        phone_number: formData.phone_number ? formData.phone_number.trim() : '',
        city: formData.city ? formData.city.trim() : '',
        age: formData.age ? parseInt(formData.age) : null,
        weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
        height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
        dailyTotalCalories: formData.dailyTotalCalories ? parseInt(formData.dailyTotalCalories) : null,
        number_of_meals: formData.number_of_meals ? parseInt(formData.number_of_meals) : 5,
        food_allergies: parseArrayField(formData.food_allergies),
        food_limitations: parseJsonField(formData.food_limitations, 'array'),
        macros: parseMacrosField(macroSliders.protein, macroSliders.carbs, macroSliders.fat),
        recommendations: parseJsonField(formData.recommendations, 'recommendations'),
        client_preference: parseJsonField(formData.client_preference, 'array')
      };

      console.log('Submitting macros:', {
        macroSliders,
        parsedMacros: parseMacrosField(macroSliders.protein, macroSliders.carbs, macroSliders.fat),
        submitDataMacros: submitData.macros
      });

      if (currentClient) {
        await ChatUser.update(currentClient.user_code, submitData);
      } else {
        await ChatUser.create(submitData);
      }

      setDialogOpen(false);
      loadClients();
      resetForm();
    } catch (error) {
      console.error('Error saving client:', error);
      const errorMessage = currentClient ? translations.failedToUpdateClient : translations.failedToCreateClient;
      setError(`${errorMessage} ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const calculateBMI = (weight, height) => {
    // Handle different field names and formats
    let weightValue = weight || 0;
    let heightValue = height || 0;
    
    if (!weightValue || !heightValue) return null;
    
    // Convert to numbers and validate
    let weightNum = parseFloat(weightValue);
    let heightNum = parseFloat(heightValue);
    
    // Validate reasonable ranges
    if (isNaN(weightNum) || isNaN(heightNum)) return null;
    if (weightNum <= 0 || weightNum > 1000) return null; // Weight should be between 0-1000kg
    
    // Handle height in different formats
    if (heightNum <= 0) return null;
    
    // If height is very small (like 1.82), assume it's in meters, convert to cm
    if (heightNum > 0 && heightNum < 10) {
      heightNum = heightNum * 100; // Convert meters to centimeters
    }
    
    // Height should be reasonable (between 50cm and 300cm)
    if (heightNum < 50 || heightNum > 300) return null;
    
    const heightInM = heightNum / 100;
    const bmi = weightNum / (heightInM * heightInM);
    
    // Validate BMI is in reasonable range
    if (bmi < 5 || bmi > 100) return null; // BMI should be between 5-100
    
    return bmi.toFixed(1);
  };

  const getBMIStatus = (bmi) => {
    if (!bmi) return '';
    const bmiNum = parseFloat(bmi);
    if (bmiNum < 18.5) return translations.underweight;
    if (bmiNum < 25) return translations.normal;
    if (bmiNum < 30) return translations.overweight;
    return translations.obese;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{translations.clientManagement}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {translations.manageClientProfiles}
          </p>
        </div>
        <Button 
          onClick={handleAdd}
          className="bg-green-600 hover:bg-green-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          {translations.addNewClient}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center space-x-2">
        <Search className="w-5 h-5 text-gray-400" />
        <Input
          placeholder={translations.searchClients}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            // Reset "Show All" when searching
            if (e.target.value && showAll) {
              setShowAll(false);
            }
          }}
          className="max-w-sm"
        />
        
        {/* Filter Button */}
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="ml-2">
              <Filter className="h-4 w-4 mr-2" />
              {translations.filterBy}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{translations.filterBy}</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-6 px-2 text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  {translations.clearFilters}
                </Button>
              </div>
              
              <Separator />
              
              {/* Goal Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{translations.filterByGoal}</Label>
                <Select
                  value={filters.goal}
                  onValueChange={(value) => setFilters({...filters, goal: value === 'all' ? '' : value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={translations.allGoals} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{translations.allGoals}</SelectItem>
                    <SelectItem value="lose">{translations.loseWeight}</SelectItem>
                    <SelectItem value="maintain">{translations.maintainWeight}</SelectItem>
                    <SelectItem value="gain">{translations.gainWeight}</SelectItem>
                    <SelectItem value="muscle">{translations.buildMuscle}</SelectItem>
                    <SelectItem value="health">{translations.improveHealth}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Activity Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{translations.filterByActivity}</Label>
                <Select
                  value={filters.activity}
                  onValueChange={(value) => setFilters({...filters, activity: value === 'all' ? '' : value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={translations.allActivities} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{translations.allActivities}</SelectItem>
                    <SelectItem value="sedentary">{translations.sedentary}</SelectItem>
                    <SelectItem value="light">{translations.lightActivity}</SelectItem>
                    <SelectItem value="moderate">{translations.moderateActivity}</SelectItem>
                    <SelectItem value="very">{translations.veryActive}</SelectItem>
                    <SelectItem value="extra">{translations.extraActive}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Gender Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{translations.filterByGender}</Label>
                <Select
                  value={filters.gender}
                  onValueChange={(value) => setFilters({...filters, gender: value === 'all' ? '' : value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={translations.allGenders} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{translations.allGenders}</SelectItem>
                    <SelectItem value="male">{translations.male}</SelectItem>
                    <SelectItem value="female">{translations.female}</SelectItem>
                    <SelectItem value="other">{translations.other}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Age Range Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{translations.filterByAge}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Min"
                    type="number"
                    value={filters.ageRange.min}
                    onChange={(e) => setFilters({
                      ...filters, 
                      ageRange: {...filters.ageRange, min: e.target.value}
                    })}
                  />
                  <Input
                    placeholder="Max"
                    type="number"
                    value={filters.ageRange.max}
                    onChange={(e) => setFilters({
                      ...filters, 
                      ageRange: {...filters.ageRange, max: e.target.value}
                    })}
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Filter Summary */}
      {(filters.goal !== 'all' || filters.activity !== 'all' || filters.gender !== 'all' || filters.ageRange.min || filters.ageRange.max) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">{translations.filterBy}:</span>
          {filters.goal && filters.goal !== 'all' && (
            <Badge variant="secondary" className="text-xs">
              {translations.goal}: {translations[filters.goal] || filters.goal}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setFilters({...filters, goal: 'all'})}
              />
            </Badge>
          )}
          {filters.activity && filters.activity !== 'all' && (
            <Badge variant="secondary" className="text-xs">
              {translations.activityLevel}: {translations[filters.activity] || filters.activity}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setFilters({...filters, activity: 'all'})}
              />
            </Badge>
          )}
          {filters.gender && filters.gender !== 'all' && (
            <Badge variant="secondary" className="text-xs">
              {translations.gender}: {translations[filters.gender] || filters.gender}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setFilters({...filters, gender: 'all'})}
              />
            </Badge>
          )}
          {(filters.ageRange.min || filters.ageRange.max) && (
            <Badge variant="secondary" className="text-xs">
              {translations.age}: {filters.ageRange.min || '0'} - {filters.ageRange.max || '∞'}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => setFilters({...filters, ageRange: { min: '', max: '' }})}
              />
            </Badge>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>
                {translations.clients} ({displayedClients.length}{showAll || searchTerm ? '' : ` ${translations.of} ${processedClients.length}`})
              </CardTitle>
              <CardDescription>
                {translations.viewAndManageClients}
              </CardDescription>
            </div>
            {hasMoreClients && (
              <Button 
                variant="outline" 
                onClick={() => setShowAll(true)}
                className="text-green-600 border-green-600 hover:bg-green-50"
              >
                {translations.showAll} ({processedClients.length})
              </Button>
            )}
            {showAll && !searchTerm && processedClients.length > 5 && (
              <Button 
                variant="outline" 
                onClick={() => setShowAll(false)}
                className="text-gray-600 border-gray-600 hover:bg-gray-50"
              >
                {translations.showLess}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('full_name')}
                    >
                      <div className="flex items-center gap-1">
                        {translations.name}
                        {getSortIcon('full_name')}
                      </div>
                    </TableHead>
                    <TableHead>{translations.contact}</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('user_code')}
                    >
                      <div className="flex items-center gap-1">
                        {translations.clientCode}
                        {getSortIcon('user_code')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('age')}
                    >
                      <div className="flex items-center gap-1">
                        {translations.physical}
                        {getSortIcon('age')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('goal')}
                    >
                      <div className="flex items-center gap-1">
                        {translations.goals}
                        {getSortIcon('goal')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('dailyTotalCalories')}
                    >
                      <div className="flex items-center gap-1">
                        {translations.macros}
                        {getSortIcon('dailyTotalCalories')}
                      </div>
                    </TableHead>
                    <TableHead>{translations.region}</TableHead>
                    <TableHead>{translations.meals}</TableHead>
                    <TableHead className="text-right">{translations.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedClients.length > 0 ? (
                    displayedClients.map((client) => {
                      // Handle different field name formats
                      const weight = client.weight_kg || client.weight || client.Weight;
                      let height = client.height_cm || client.height || client.Height;
                      
                      // Convert height to cm for display if it's in meters
                      let displayHeight = height;
                      if (height && parseFloat(height) > 0 && parseFloat(height) < 10) {
                        displayHeight = (parseFloat(height) * 100).toFixed(0);
                      }
                      
                      const bmi = calculateBMI(weight, height);
                      return (
                        <TableRow key={client.user_code || client.id}>
                          <TableCell className="font-medium">
                            <div>
                              <div>{client.full_name}</div>
                              {client.age && (
                                <div className="text-sm text-gray-500">
                                  {client.age} {translations.yearsOld}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {client.email && (
                                <div className="flex items-center gap-1 text-sm">
                                  <Mail className="h-3 w-3" />
                                  {client.email}
                                </div>
                              )}
                              {client.phone_number && (
                                <div className="flex items-center gap-1 text-sm">
                                  <Phone className="h-3 w-3" />
                                  {client.phone_number}
                                </div>
                              )}
                              {client.city && (
                                <div className="text-sm text-gray-500">{client.city}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {client.user_code || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {height && weight ? (
                                <div>
                                  <div>{displayHeight}cm, {weight}kg</div>
                                  {bmi ? (
                                    <div className="text-gray-500">
                                      BMI: {bmi} ({getBMIStatus(bmi)})
                                    </div>
                                  ) : (
                                    <div className="text-red-400 text-xs">
                                      {translations.invalidBmiData}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">{translations.noDataAvailable}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {client.goal && (
                                <Badge variant="secondary" className="mb-1">
                                  {client.goal}
                                </Badge>
                              )}
                              {client.Activity_level && (
                                <div className="text-gray-500">{client.Activity_level} {translations.activity}</div>
                              )}
                              {client.dailyTotalCalories && (
                                <div className="text-gray-500">{client.dailyTotalCalories} {translations.kcalPerDay}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {client.macros && (client.macros.protein || client.macros.carbs || client.macros.fat) ? (
                              <div className="text-sm space-y-1">
                                {client.macros.protein && (
                                  <div className="text-blue-600">
                                    P: {typeof client.macros.protein === 'string' && client.macros.protein.includes('g') ? 
                                         client.macros.protein : `${client.macros.protein}g`}
                                  </div>
                                )}
                                {client.macros.carbs && (
                                  <div className="text-orange-600">
                                    C: {typeof client.macros.carbs === 'string' && client.macros.carbs.includes('g') ? 
                                         client.macros.carbs : `${client.macros.carbs}g`}
                                  </div>
                                )}
                                {client.macros.fat && (
                                  <div className="text-purple-600">
                                    F: {typeof client.macros.fat === 'string' && client.macros.fat.includes('g') ? 
                                         client.macros.fat : `${client.macros.fat}g`}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">{translations.noMacrosSet}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {client.region || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {client.number_of_meals || '—'} {translations.meals}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(client)}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-6 text-gray-500">
                        {searchTerm ? translations.noClientsFound : translations.noClientsFoundGeneral}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {currentClient ? translations.editUserInformation : translations.addNewClient}
            </DialogTitle>
            <DialogDescription>
              {currentClient ? translations.editUserDescription : translations.addUserDescription}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6 py-4">
              
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">{translations.basicInformation}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="user_code">{translations.clientCode}</Label>
                    <Input
                      id="user_code"
                      value={formData.user_code}
                      onChange={(e) => setFormData({...formData, user_code: e.target.value})}
                      placeholder="Auto-generated"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="full_name">{translations.fullName} *</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">{translations.email}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone_number">{translations.phoneNumber}</Label>
                    <Input
                      id="phone_number"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">{translations.city}</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date_of_birth">{translations.dateOfBirth}</Label>
                    <Input
                      id="date_of_birth"
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Physical Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">{translations.physicalInformation}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="age">{translations.age}</Label>
                    <Input
                      id="age"
                      type="number"
                      value={formData.age}
                      onChange={(e) => setFormData({...formData, age: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="gender">{translations.gender}</Label>
                    <Select 
                      value={formData.gender} 
                      onValueChange={(value) => setFormData({...formData, gender: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translations.selectGender} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{translations.male}</SelectItem>
                        <SelectItem value="female">{translations.female}</SelectItem>
                        <SelectItem value="other">{translations.other}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="weight_kg">{translations.weightKg}</Label>
                    <Input
                      id="weight_kg"
                      type="number"
                      step="0.1"
                      value={formData.weight_kg}
                      onChange={(e) => setFormData({...formData, weight_kg: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="height_cm">{translations.heightCm}</Label>
                    <Input
                      id="height_cm"
                      type="number"
                      value={formData.height_cm}
                      onChange={(e) => setFormData({...formData, height_cm: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="Activity_level">{translations.activityLevel}</Label>
                    <Select 
                      value={formData.Activity_level} 
                      onValueChange={(value) => setFormData({...formData, Activity_level: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translations.selectActivityLevel} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sedentary">{translations.sedentary}</SelectItem>
                        <SelectItem value="light">{translations.lightActivity}</SelectItem>
                        <SelectItem value="moderate">{translations.moderateActivity}</SelectItem>
                        <SelectItem value="very">{translations.veryActive}</SelectItem>
                        <SelectItem value="extra">{translations.extraActive}</SelectItem>
                        <SelectItem value="extra">{translations.toning}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="goal">{translations.goal}</Label>
                    <Select 
                      value={formData.goal} 
                      onValueChange={(value) => setFormData({...formData, goal: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translations.selectGoal} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lose">{translations.loseWeight}</SelectItem>
                        <SelectItem value="maintain">{translations.maintainWeight}</SelectItem>
                        <SelectItem value="gain">{translations.gainWeight}</SelectItem>
                        <SelectItem value="muscle">{translations.buildMuscle}</SelectItem>
                        <SelectItem value="health">{translations.improveHealth}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Nutrition Information */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium">{translations.nutritionInformation}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="dailyTotalCalories">{translations.dailyTotalCalories}</Label>
                    <Input
                      id="dailyTotalCalories"
                      type="number"
                      value={formData.dailyTotalCalories}
                      onChange={e => {
                        setFormData({ ...formData, dailyTotalCalories: e.target.value });
                        setMacroSliders({ protein: 0, carbs: 0, fat: 0 }); // Reset macros on calorie change
                      }}
                      placeholder="2000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number_of_meals">{translations.numberOfMeals}</Label>
                    <Select 
                      value={formData.number_of_meals} 
                      onValueChange={(value) => setFormData({...formData, number_of_meals: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translations.selectNumberOfMeals} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 {translations.meals}</SelectItem>
                        <SelectItem value="4">4 {translations.meals}</SelectItem>
                        <SelectItem value="5">5 {translations.meals}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">{translations.region}</Label>
                    <Select 
                      value={formData.region} 
                      onValueChange={(value) => setFormData({...formData, region: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translations.selectRegion} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="israel">{translations.israel}</SelectItem>
                        <SelectItem value="us">{translations.unitedStates}</SelectItem>
                        <SelectItem value="uk">{translations.unitedKingdom}</SelectItem>
                        <SelectItem value="canada">{translations.canada}</SelectItem>
                        <SelectItem value="australia">{translations.australia}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{translations.macrosGrams}</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {['protein', 'carbs', 'fat'].map(macro => (
                      <div key={macro}>
                        <Label className="text-sm capitalize">{translations[macro]}</Label>
                        <Slider
                          min={macro === 'fat' ? 0 : 0}
                          max={macro === 'protein' ? 300 : macro === 'carbs' ? 400 : 150}
                          step={1}
                          value={[macroSliders[macro]]}
                          onValueChange={([val]) => {
                            let cals = parseInt(formData.dailyTotalCalories) || 0;
                            if (cals > 0) {
                              setMacroSliders(prev => recalculateMacros(macro, val, cals, prev));
                            }
                          }}
                        />
                        <div className="text-xs text-gray-600 mt-1">{macroSliders[macro]}g</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {translations.macrosSumMatches} <br />
                    <span className="font-mono">{translations.caloriesFormula}</span>
                  </p>
                </div>
              </div>

              {/* Dietary Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">{translations.dietaryInformation}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="food_allergies">{translations.foodAllergies}</Label>
                    <Input
                      id="food_allergies"
                      value={formData.food_allergies}
                      onChange={(e) => setFormData({...formData, food_allergies: e.target.value})}
                      placeholder={translations.foodAllergiesPlaceholder}
                    />
                  </div>
                  <div>
                    <Label htmlFor="food_limitations">{translations.foodLimitations}</Label>
                    <Textarea
                      id="food_limitations"
                      value={formData.food_limitations}
                      onChange={(e) => setFormData({...formData, food_limitations: e.target.value})}
                      placeholder={translations.foodLimitationsPlaceholder}
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {translations.foodLimitationsHelp}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="client_preference">{translations.clientPreferences}</Label>
                    <Textarea
                      id="client_preference"
                      value={formData.client_preference}
                      onChange={(e) => setFormData({...formData, client_preference: e.target.value})}
                      placeholder={translations.clientPreferencesPlaceholder}
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {translations.clientPreferencesHelp}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="recommendations">{translations.recommendations}</Label>
                    <Textarea
                      id="recommendations"
                      value={formData.recommendations}
                      onChange={(e) => setFormData({...formData, recommendations: e.target.value})}
                      placeholder={translations.recommendationsPlaceholder}
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {translations.recommendationsHelp}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={loading}
              >
                {translations.cancel}
              </Button>
              <Button 
                type="submit"
                className="bg-green-600 hover:bg-green-700"
                disabled={loading}
              >
                {loading ? translations.saving : currentClient ? translations.updateClient : translations.addClient}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
