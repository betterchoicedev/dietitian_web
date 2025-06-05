import React, { useState, useEffect } from 'react';
import { User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BookUser, 
  Briefcase, 
  CircleCheck, 
  Clock, 
  DollarSign,
  GraduationCap,
  Languages,
  MapPin,
  UserCircle,
  AlertCircle
} from 'lucide-react';

export default function Settings() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    specialization: '',
    certification: '',
    years_of_experience: '',
    clinic_name: '',
    clinic_address: '',
    profile_bio: '',
    languages: [],
    consultation_fee: '',
    available_times: [],
    social_media: {
      linkedin: '',
      twitter: '',
      instagram: ''
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('success');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setIsLoading(true);
      const userData = await User.me();
      setUser(userData);
      setFormData({
        full_name: userData.full_name || '',
        email: userData.email || '',
        specialization: userData.specialization || '',
        certification: userData.certification || '',
        years_of_experience: userData.years_of_experience || '',
        clinic_name: userData.clinic_name || '',
        clinic_address: userData.clinic_address || '',
        profile_bio: userData.profile_bio || '',
        languages: userData.languages || [],
        consultation_fee: userData.consultation_fee || '',
        available_times: userData.available_times || [],
        social_media: userData.social_media || {
          linkedin: '',
          twitter: '',
          instagram: ''
        }
      });
    } catch (error) {
      console.error('Error loading user data:', error);
      setMessageType('error');
      setMessage('Failed to load user data. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        return {
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: value
          }
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleMultiSelectChange = (field, values) => {
    setFormData(prev => ({
      ...prev,
      [field]: values
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    
    try {
      // Only send the fields that can be updated
      const updateData = {
        specialization: formData.specialization,
        certification: formData.certification,
        years_of_experience: formData.years_of_experience ? Number(formData.years_of_experience) : undefined,
        clinic_name: formData.clinic_name,
        clinic_address: formData.clinic_address,
        profile_bio: formData.profile_bio,
        languages: formData.languages,
        consultation_fee: formData.consultation_fee ? Number(formData.consultation_fee) : undefined,
        available_times: formData.available_times,
        social_media: formData.social_media
      };
      
      await User.updateMyUserData(updateData);
      setMessageType('success');
      setMessage('Profile updated successfully');
      
      // Reload user data to get the updated values
      await loadUserData();
    } catch (error) {
      console.error('Error saving profile:', error);
      setMessageType('error');
      setMessage('Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Sample languages options
  const languageOptions = [
    { label: 'English', value: 'English' },
    { label: 'Spanish', value: 'Spanish' },
    { label: 'French', value: 'French' },
    { label: 'German', value: 'German' },
    { label: 'Italian', value: 'Italian' },
    { label: 'Portuguese', value: 'Portuguese' },
    { label: 'Mandarin', value: 'Mandarin' },
    { label: 'Cantonese', value: 'Cantonese' },
    { label: 'Japanese', value: 'Japanese' },
    { label: 'Korean', value: 'Korean' },
    { label: 'Arabic', value: 'Arabic' },
    { label: 'Russian', value: 'Russian' },
    { label: 'Hindi', value: 'Hindi' }
  ];

  // Sample available times options
  const timesOptions = [
    { label: 'Monday 9-5', value: 'Monday 9-5' },
    { label: 'Tuesday 9-5', value: 'Tuesday 9-5' },
    { label: 'Wednesday 9-5', value: 'Wednesday 9-5' },
    { label: 'Thursday 9-5', value: 'Thursday 9-5' },
    { label: 'Friday 9-5', value: 'Friday 9-5' },
    { label: 'Saturday 9-1', value: 'Saturday 9-1' },
    { label: 'Monday Evenings', value: 'Monday Evenings' },
    { label: 'Tuesday Evenings', value: 'Tuesday Evenings' },
    { label: 'Wednesday Evenings', value: 'Wednesday Evenings' },
    { label: 'Thursday Evenings', value: 'Thursday Evenings' },
    { label: 'Friday Evenings', value: 'Friday Evenings' }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your profile information and preferences
        </p>
      </div>

      {message && (
        <Alert variant={messageType === 'error' ? 'destructive' : 'default'} className={messageType === 'success' ? 'bg-green-50 text-green-800 border-green-200' : ''}>
          {messageType === 'error' ? <AlertCircle className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="professional">Professional Info</TabsTrigger>
          <TabsTrigger value="practice">Practice Details</TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit}>
          <TabsContent value="profile" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCircle className="h-5 w-5 text-green-600" />
                  <CardTitle>Basic Information</CardTitle>
                </div>
                <CardDescription>
                  Your account details and personal information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={formData.full_name}
                      disabled
                    />
                    <p className="text-xs text-gray-500">This cannot be changed directly</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      disabled
                    />
                    <p className="text-xs text-gray-500">This cannot be changed directly</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profileBio">Professional Biography</Label>
                  <Textarea
                    id="profileBio"
                    rows={4}
                    placeholder="Tell your clients about yourself, your experience, and your approach..."
                    value={formData.profile_bio}
                    onChange={(e) => handleInputChange('profile_bio', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="languages">Languages</Label>
                  <MultiSelect
                    id="languages"
                    options={languageOptions}
                    selectedValues={formData.languages}
                    onChange={(values) => handleMultiSelectChange('languages', values)}
                    placeholder="Select languages you speak..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Social Media</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="linkedin">LinkedIn</Label>
                      <Input
                        id="linkedin"
                        placeholder="linkedin.com/in/yourprofile"
                        value={formData.social_media?.linkedin || ''}
                        onChange={(e) => handleInputChange('social_media.linkedin', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="twitter">Twitter</Label>
                      <Input
                        id="twitter"
                        placeholder="@yourusername"
                        value={formData.social_media?.twitter || ''}
                        onChange={(e) => handleInputChange('social_media.twitter', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="instagram">Instagram</Label>
                      <Input
                        id="instagram"
                        placeholder="@yourusername"
                        value={formData.social_media?.instagram || ''}
                        onChange={(e) => handleInputChange('social_media.instagram', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="professional" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-blue-600" />
                  <CardTitle>Professional Information</CardTitle>
                </div>
                <CardDescription>
                  Your professional qualifications and expertise
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="specialization">Specialization</Label>
                  <Input
                    id="specialization"
                    placeholder="e.g. Sports Nutrition, Weight Management, Pediatric Nutrition"
                    value={formData.specialization}
                    onChange={(e) => handleInputChange('specialization', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="certification">Certification</Label>
                  <Input
                    id="certification"
                    placeholder="e.g. Registered Dietitian, PhD in Nutrition"
                    value={formData.certification}
                    onChange={(e) => handleInputChange('certification', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experience">Years of Experience</Label>
                  <Input
                    id="experience"
                    type="number"
                    min="0"
                    placeholder="e.g. 5"
                    value={formData.years_of_experience}
                    onChange={(e) => handleInputChange('years_of_experience', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consultationFee">Consultation Fee ($)</Label>
                  <Input
                    id="consultationFee"
                    type="number"
                    min="0"
                    placeholder="e.g. 100"
                    value={formData.consultation_fee}
                    onChange={(e) => handleInputChange('consultation_fee', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="availableTimes">Available Consultation Times</Label>
                  <MultiSelect
                    id="availableTimes"
                    options={timesOptions}
                    selectedValues={formData.available_times}
                    onChange={(values) => handleMultiSelectChange('available_times', values)}
                    placeholder="Select your available times..."
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="practice" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-purple-600" />
                  <CardTitle>Practice Details</CardTitle>
                </div>
                <CardDescription>
                  Information about your clinic or practice
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clinicName">Clinic or Practice Name</Label>
                  <Input
                    id="clinicName"
                    placeholder="e.g. BetterChoice Nutrition Center"
                    value={formData.clinic_name}
                    onChange={(e) => handleInputChange('clinic_name', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clinicAddress">Clinic Address</Label>
                  <Textarea
                    id="clinicAddress"
                    placeholder="e.g. 123 Health Street, New York, NY"
                    value={formData.clinic_address}
                    onChange={(e) => handleInputChange('clinic_address', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardFooter className="flex justify-end pt-6">
                <Button 
                  type="submit" 
                  className="bg-green-600 hover:bg-green-700"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Saving...
                    </>
                  ) : 'Save Changes'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </form>
      </Tabs>
    </div>
  );
}