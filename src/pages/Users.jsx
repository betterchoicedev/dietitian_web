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
  Plus
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

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
    client_preference: ''
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const clientData = await ChatUser.list();
      setClients(clientData || []);
      setError(null);
    } catch (error) {
      console.error('Error loading clients:', error);
      setError('Failed to load clients. Please try again.');
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
      client_preference: ''
    });
  };

  const handleAdd = () => {
    setCurrentClient(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (client) => {
    setCurrentClient(client);
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
      client_preference: typeof client.client_preference === 'object' ? JSON.stringify(client.client_preference, null, 2) : client.client_preference || ''
    });
    setDialogOpen(true);
  };

  const parseJsonField = (value, fieldType = 'object') => {
    if (!value || value.trim() === '') return null;
    
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
    if (!value || value.trim() === '') return [];
    
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
    if (protein && protein.trim()) {
      const p = protein.trim();
      result.protein = p.endsWith('g') ? p : `${p}g`;
    }
    if (carbs && carbs.trim()) {
      const c = carbs.trim();
      result.carbs = c.endsWith('g') ? c : `${c}g`;
    }
    if (fat && fat.trim()) {
      const f = fat.trim();
      result.fat = f.endsWith('g') ? f : `${f}g`;
    }
    return Object.keys(result).length > 0 ? result : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const submitData = {
        ...formData,
        age: formData.age ? parseInt(formData.age) : null,
        weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
        height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
        dailyTotalCalories: formData.dailyTotalCalories ? parseInt(formData.dailyTotalCalories) : null,
        number_of_meals: formData.number_of_meals ? parseInt(formData.number_of_meals) : 5,
        food_allergies: parseArrayField(formData.food_allergies),
        food_limitations: parseJsonField(formData.food_limitations, 'array'),
        macros: parseMacrosField(formData.macros.protein, formData.macros.carbs, formData.macros.fat),
        recommendations: parseJsonField(formData.recommendations, 'recommendations'),
        client_preference: parseJsonField(formData.client_preference, 'array')
      };

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
      setError(`Failed to ${currentClient ? 'update' : 'create'} client: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const calculateBMI = (weight, height) => {
    if (!weight || !height) return null;
    const heightInM = height / 100;
    const bmi = weight / (heightInM * heightInM);
    return bmi.toFixed(1);
  };

  const getBMIStatus = (bmi) => {
    if (!bmi) return '';
    const bmiNum = parseFloat(bmi);
    if (bmiNum < 18.5) return 'Underweight';
    if (bmiNum < 25) return 'Normal';
    if (bmiNum < 30) return 'Overweight';
    return 'Obese';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your client profiles and information
          </p>
        </div>
        <Button 
          onClick={handleAdd}
          className="bg-green-600 hover:bg-green-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Client
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
          placeholder="Search clients by name, email, code, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clients ({filteredClients.length})</CardTitle>
          <CardDescription>
            View and manage your client profiles
          </CardDescription>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Physical</TableHead>
                    <TableHead>Goals</TableHead>
                    <TableHead>Macros</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.length > 0 ? (
                    filteredClients.map((client) => {
                      const bmi = calculateBMI(client.weight_kg, client.height_cm);
                      return (
                        <TableRow key={client.user_code || client.id}>
                          <TableCell className="font-medium">
                            <div>
                              <div>{client.full_name}</div>
                              {client.age && (
                                <div className="text-sm text-gray-500">
                                  {client.age} years old
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
                              {client.height_cm && client.weight_kg ? (
                                <div>
                                  <div>{client.height_cm}cm, {client.weight_kg}kg</div>
                                  {bmi && (
                                    <div className="text-gray-500">
                                      BMI: {bmi} ({getBMIStatus(bmi)})
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">No data</span>
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
                                <div className="text-gray-500">{client.Activity_level} activity</div>
                              )}
                              {client.dailyTotalCalories && (
                                <div className="text-gray-500">{client.dailyTotalCalories} kcal/day</div>
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
                              <span className="text-gray-400 text-sm">No macros set</span>
                            )}
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
                      <TableCell colSpan={7} className="text-center py-6 text-gray-500">
                        {searchTerm ? 'No clients found matching your search' : 'No clients found. Add your first client to get started.'}
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
              {currentClient ? 'Edit Client Information' : 'Add New Client'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6 py-4">
              
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="user_code">Client Code</Label>
                    <Input
                      id="user_code"
                      value={formData.user_code}
                      onChange={(e) => setFormData({...formData, user_code: e.target.value})}
                      placeholder="Auto-generated"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone_number">Phone Number</Label>
                    <Input
                      id="phone_number"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date_of_birth">Date of Birth</Label>
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
                <h3 className="text-lg font-medium">Physical Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      value={formData.age}
                      onChange={(e) => setFormData({...formData, age: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="gender">Gender</Label>
                    <Select 
                      value={formData.gender} 
                      onValueChange={(value) => setFormData({...formData, gender: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="weight_kg">Weight (kg)</Label>
                    <Input
                      id="weight_kg"
                      type="number"
                      step="0.1"
                      value={formData.weight_kg}
                      onChange={(e) => setFormData({...formData, weight_kg: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="height_cm">Height (cm)</Label>
                    <Input
                      id="height_cm"
                      type="number"
                      value={formData.height_cm}
                      onChange={(e) => setFormData({...formData, height_cm: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="Activity_level">Activity Level</Label>
                    <Select 
                      value={formData.Activity_level} 
                      onValueChange={(value) => setFormData({...formData, Activity_level: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select activity level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sedentary">Sedentary</SelectItem>
                        <SelectItem value="light">Light Activity</SelectItem>
                        <SelectItem value="moderate">Moderate Activity</SelectItem>
                        <SelectItem value="very">Very Active</SelectItem>
                        <SelectItem value="extra">Extra Active</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="goal">Goal</Label>
                    <Select 
                      value={formData.goal} 
                      onValueChange={(value) => setFormData({...formData, goal: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select goal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lose">Lose Weight</SelectItem>
                        <SelectItem value="maintain">Maintain Weight</SelectItem>
                        <SelectItem value="gain">Gain Weight</SelectItem>
                        <SelectItem value="muscle">Build Muscle</SelectItem>
                        <SelectItem value="health">Improve Health</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Nutrition Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Nutrition Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dailyTotalCalories">Daily Total Calories</Label>
                    <Input
                      id="dailyTotalCalories"
                      type="number"
                      value={formData.dailyTotalCalories}
                      onChange={(e) => setFormData({...formData, dailyTotalCalories: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="number_of_meals">Number of Meals</Label>
                    <Input
                      id="number_of_meals"
                      type="number"
                      min="1"
                      max="10"
                      value={formData.number_of_meals}
                      onChange={(e) => setFormData({...formData, number_of_meals: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Macros (grams)</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="macros_protein" className="text-sm">Protein</Label>
                      <Input
                        id="macros_protein"
                        type="number"
                        step="0.1"
                        value={formData.macros.protein}
                        onChange={(e) => setFormData({...formData, macros: {...formData.macros, protein: e.target.value}})}
                        placeholder="160"
                      />
                    </div>
                    <div>
                      <Label htmlFor="macros_carbs" className="text-sm">Carbs</Label>
                      <Input
                        id="macros_carbs"
                        type="number"
                        step="0.1"
                        value={formData.macros.carbs}
                        onChange={(e) => setFormData({...formData, macros: {...formData.macros, carbs: e.target.value}})}
                        placeholder="180"
                      />
                    </div>
                    <div>
                      <Label htmlFor="macros_fat" className="text-sm">Fat</Label>
                      <Input
                        id="macros_fat"
                        type="number"
                        step="0.1"
                        value={formData.macros.fat}
                        onChange={(e) => setFormData({...formData, macros: {...formData.macros, fat: e.target.value}})}
                        placeholder="65"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    ✨ Just enter numbers - "g" will be automatically added (e.g., 160 → 160g)
                  </p>
                </div>
              </div>

              {/* Dietary Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Dietary Information</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="food_allergies">Food Allergies</Label>
                    <Input
                      id="food_allergies"
                      value={formData.food_allergies}
                      onChange={(e) => setFormData({...formData, food_allergies: e.target.value})}
                      placeholder="e.g., nuts, dairy, shellfish (separate with commas)"
                    />
                  </div>
                  <div>
                    <Label htmlFor="food_limitations">Food Limitations</Label>
                    <Textarea
                      id="food_limitations"
                      value={formData.food_limitations}
                      onChange={(e) => setFormData({...formData, food_limitations: e.target.value})}
                      placeholder="Simple text: vegetarian, kosher, low sodium (auto-converts to JSON array)"
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      ✨ Enter simple text like "vegetarian, kosher" and it will auto-convert to ["vegetarian", "kosher"]
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="client_preference">Client Preferences</Label>
                    <Textarea
                      id="client_preference"
                      value={formData.client_preference}
                      onChange={(e) => setFormData({...formData, client_preference: e.target.value})}
                      placeholder="Simple text: loves pasta, mediterranean cuisine, quick meals"
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      ✨ Enter simple text like "loves pasta" and it will auto-convert to ["loves pasta"]
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="recommendations">Recommendations</Label>
                    <Textarea
                      id="recommendations"
                      value={formData.recommendations}
                      onChange={(e) => setFormData({...formData, recommendations: e.target.value})}
                      placeholder="Simple text: drink more water, take vitamin D, exercise 30min daily"
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      ✨ Enter simple text and it will auto-convert to structured recommendations
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
                Cancel
              </Button>
              <Button 
                type="submit"
                className="bg-green-600 hover:bg-green-700"
                disabled={loading}
              >
                {loading ? 'Saving...' : currentClient ? 'Update Client' : 'Add Client'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
