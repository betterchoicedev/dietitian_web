
import React, { useState, useEffect } from 'react';
import { Client } from '@/api/entities';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  AlertCircle,
  Save,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';

export default function EditClient() {
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    user_code: '', // Changed from code to user_code
    user_id_number: '',
    age: '',
    height: '',
    weight: '',
    gender: '',
    activity_level: '',
    goal: '',
    notes: '',
    dietary_restrictions: []
  });

  const dietaryRestrictionOptions = [
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
    { value: 'gluten-free', label: 'Gluten-Free' },
    { value: 'dairy-free', label: 'Dairy-Free' },
    { value: 'nut-free', label: 'Nut-Free' },
    { value: 'low-carb', label: 'Low Carb' },
    { value: 'keto', label: 'Keto' },
    { value: 'paleo', label: 'Paleo' },
    { value: 'fish-allergy', label: 'Fish Allergy' },
    { value: 'shellfish-allergy', label: 'Shellfish Allergy' },
    { value: 'egg-allergy', label: 'Egg Allergy' },
    { value: 'soy-allergy', label: 'Soy Allergy' },
    { value: 'kosher', label: 'Kosher' },
    { value: 'halal', label: 'Halal' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      // Convert string numbers to actual numbers
      const updatedFormData = {
        ...formData,
        age: formData.age ? Number(formData.age) : null,
        height: formData.height ? Number(formData.height) : null,
        weight: formData.weight ? Number(formData.weight) : null,
        user_id_number: formData.user_id_number ? Number(formData.user_id_number) : null
      };

      // Remove any undefined or null values
      Object.keys(updatedFormData).forEach(key => {
        if (updatedFormData[key] === undefined || updatedFormData[key] === null || updatedFormData[key] === '') {
          delete updatedFormData[key];
        }
      });

      // Ensure user_code is present
      if (!updatedFormData.user_code) {
        if (client && client.user_code) {
          updatedFormData.user_code = client.user_code;
        } else {
          updatedFormData.user_code = updatedFormData.user_code || generateUserCode();
        }
      }

      // Remove old code field if it exists
      delete updatedFormData.code;

      await Client.update(client.id, updatedFormData);
      
      // Show success message or redirect
      navigate(createPageUrl('ClientProfile'));
    } catch (error) {
      console.error("Error updating client:", error);
      setError("Failed to update client data. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    loadClient();
  }, []);

  const generateUserCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return code;
  };

  const loadClient = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const urlParams = new URLSearchParams(window.location.search);
      const clientId = urlParams.get('id');
      
      if (!clientId) {
        setError("No client ID provided");
        return;
      }

      const clientData = await Client.get(clientId);
      if (!clientData) {
        setError("Client not found");
        return;
      }

      setClient(clientData);
      setFormData({
        full_name: clientData.full_name || '',
        email: clientData.email || '',
        phone: clientData.phone || '',
        user_code: clientData.user_code || clientData.code || '', // Handle both old and new format
        user_id_number: clientData.user_id_number || '',
        age: clientData.age || '',
        height: clientData.height || '',
        weight: clientData.weight || '',
        gender: clientData.gender || '',
        activity_level: clientData.activity_level || '',
        goal: clientData.goal || '',
        notes: clientData.notes || '',
        dietary_restrictions: clientData.dietary_restrictions || []
      });
    } catch (error) {
      console.error("Error loading client:", error);
      setError("Failed to load client data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRestrictionChange = (values) => {
    setFormData(prev => ({
      ...prev,
      dietary_restrictions: values
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          onClick={() => navigate(createPageUrl('ClientProfile'))}
          className="mt-4"
          variant="outline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Profile
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Edit Client Profile</h1>
        <Button 
          variant="outline"
          onClick={() => navigate(createPageUrl('ClientProfile'))}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Client Information</CardTitle>
            <CardDescription>
              Update the client's personal information and contact details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Basic Information */}
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user_code">Client Code</Label>
                <Input
                  id="user_code"
                  name="user_code"
                  value={formData.user_code}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user_id_number">User ID Number</Label>
                <Input
                  id="user_id_number"
                  name="user_id_number"
                  type="number"
                  value={formData.user_id_number}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Physical Information */}
            <div className="pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Physical Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    name="height"
                    type="number"
                    value={formData.height}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input
                    id="weight"
                    name="weight"
                    type="number"
                    value={formData.weight}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    name="age"
                    type="number"
                    value={formData.age}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select 
                    value={formData.gender} 
                    onValueChange={(value) => handleSelectChange('gender', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Health Information */}
            <div className="pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Health Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="activity_level">Activity Level</Label>
                  <Select 
                    value={formData.activity_level} 
                    onValueChange={(value) => handleSelectChange('activity_level', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
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
                <div className="space-y-2">
                  <Label htmlFor="goal">Goal</Label>
                  <Select 
                    value={formData.goal} 
                    onValueChange={(value) => handleSelectChange('goal', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lose">Weight Loss</SelectItem>
                      <SelectItem value="maintain">Weight Maintenance</SelectItem>
                      <SelectItem value="gain">Weight Gain</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Dietary Restrictions */}
            <div className="pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Dietary Restrictions</h3>
              <div className="space-y-2">
                <Label htmlFor="dietary_restrictions">Select all that apply</Label>
                <MultiSelect
                  options={dietaryRestrictionOptions}
                  selectedValues={formData.dietary_restrictions}
                  onChange={handleRestrictionChange}
                  id="dietary_restrictions"
                  placeholder="Select restrictions..."
                />
              </div>
            </div>

            {/* Notes */}
            <div className="pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Additional Notes</h3>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Add any additional notes about the client..."
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
