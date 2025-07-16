
import React, { useState, useEffect } from 'react';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Search, 
  UserPlus, 
  Users as UsersIcon, 
  Mail, 
  Phone, 
  Edit,
  Plus,
  ArrowUpDown,
  Filter,
  MoreVertical,
  Trash2,
  User as UserIcon,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';

const generateUniqueCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
};

const generateUserIdNumber = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [formData, setFormData] = useState({});

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const userData = await User.me();
      
      const clientList = await Client.filter({ dietitian_id: userData.id });
      const sortedClients = [...clientList].sort((a, b) => {
        if (sortBy === 'name') {
          return sortDirection === 'asc' 
            ? a.full_name.localeCompare(b.full_name)
            : b.full_name.localeCompare(a.full_name);
        } else if (sortBy === 'date') {
          return sortDirection === 'asc'
                    ? new Date(a.created_at) - new Date(b.created_at)
        : new Date(b.created_at) - new Date(a.created_at);
        }
        return 0;
      });
      
      setClients(sortedClients);
      
      if (sortedClients.length === 0) {
        await addSampleClients(userData.id);
        const updatedClientList = await Client.filter({ dietitian_id: userData.id });
        setClients(updatedClientList);
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addSampleClients = async (dietitianId) => {
    try {
      const sampleClients = [
        {
          user_code: "XKMPVR",
          user_id_number: 234567,
          full_name: "Sarah Johnson",
          email: "sarah.j@example.com",
          phone: "555-0123",
          height: 165,
          weight: 68,
          age: 34,
          gender: "female",
          activity_level: "moderate",
          goal: "lose",
          notes: "Wants to lose weight for upcoming wedding",
          dietary_restrictions: ["dairy-free"],
          dietitian_id: dietitianId
        },
        {
          user_code: "WNBHTL",
          user_id_number: 345678,
          full_name: "Michael Chen",
          email: "m.chen@example.com",
          phone: "555-0124",
          height: 178,
          weight: 75,
          age: 28,
          gender: "male",
          activity_level: "very",
          goal: "maintain",
          notes: "Training for marathon",
          dietary_restrictions: [],
          dietitian_id: dietitianId
        },
        {
          user_code: "PQRSTU",
          user_id_number: 456789,
          full_name: "Emma Wilson",
          email: "e.wilson@example.com",
          phone: "555-0125",
          height: 170,
          weight: 62,
          age: 42,
          gender: "female",
          activity_level: "light",
          goal: "maintain",
          notes: "Vegetarian diet",
          dietary_restrictions: ["vegetarian"],
          dietitian_id: dietitianId
        },
        {
          user_code: "DEFGHJ",
          user_id_number: 567890,
          full_name: "David Brown",
          email: "d.brown@example.com",
          phone: "555-0126",
          height: 183,
          weight: 82,
          age: 25,
          gender: "male",
          activity_level: "extra",
          goal: "gain",
          notes: "Bodybuilding focus",
          dietary_restrictions: [],
          dietitian_id: dietitianId
        },
        {
          user_code: "UVWXYZ",
          user_id_number: 678901,
          full_name: "Lisa Martinez",
          email: "l.martinez@example.com",
          phone: "555-0127",
          height: 162,
          weight: 58,
          age: 31,
          gender: "female",
          activity_level: "moderate",
          goal: "maintain",
          notes: "Gluten sensitivity",
          dietary_restrictions: ["gluten-free"],
          dietitian_id: dietitianId
        }
      ];

      for (const client of sampleClients) {
        await Client.create(client);
      }
    } catch (error) {
      console.error('Error adding sample clients:', error);
    }
  };

  const setupCurrentUser = async () => {
    try {
      const userData = await User.me();
      
      if (!userData.specialization && !userData.profile_bio) {
        const userProfileData = {
          specialization: "Weight Management and Sports Nutrition",
          certification: "Registered Dietitian, MS in Clinical Nutrition",
          years_of_experience: 8,
          clinic_name: "BetterChoice Nutrition Center",
          clinic_address: "123 Health Street, Suite 450, San Francisco, CA 94110",
          profile_bio: "I'm a certified nutritionist with over 8 years of experience helping clients achieve their health goals through personalized nutrition plans. My approach focuses on sustainable lifestyle changes rather than quick fixes.",
          languages: ["English", "Spanish", "French"],
          consultation_fee: 120,
          available_times: ["Monday 9-5", "Wednesday 9-5", "Friday 9-5", "Tuesday Evenings"],
          social_media: {
            linkedin: "linkedin.com/in/yourprofile",
            twitter: "@nutritionist",
            instagram: "@betterchoice.nutrition"
          }
        };
        
        await User.updateMyUserData(userProfileData);
        console.log("Updated current user with sample data");
      }
    } catch (error) {
      console.error("Error setting up user data:", error);
    }
  };

  useEffect(() => {
    loadClients();
    setupCurrentUser();
  }, [sortBy, sortDirection]);

  const filteredClients = clients.filter(client => 
    client.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.user_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (client) => {
    setCurrentUser(client);
    setFormData({
      user_code: client.user_code || '',
      user_id_number: client.user_id_number || '',
      full_name: client.full_name || '',
      email: client.email || '',
      phone: client.phone || '',
      height: client.height || '',
      weight: client.weight || '',
      age: client.age || '',
      gender: client.gender || '',
      activity_level: client.activity_level || '',
      goal: client.goal || '',
      notes: client.notes || ''
    });
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setCurrentUser(null);
    setFormData({
      user_code: generateUniqueCode(),
      user_id_number: generateUserIdNumber(),
      full_name: '',
      email: '',
      phone: '',
      height: '',
      weight: '',
      age: '',
      gender: '',
      activity_level: '',
      goal: '',
      notes: ''
    });
    setDialogOpen(true);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const userData = await User.me();
      const clientData = { 
        ...formData,
        user_code: formData.user_code || generateUniqueCode(),
        dietitian_id: userData.id 
      };
      
      delete clientData.code;
      
      if (currentUser) {
        await Client.update(currentUser.id, clientData);
      } else {
        await Client.create(clientData);
      }
      
      setDialogOpen(false);
      await loadClients();
    } catch (error) {
      console.error('Error saving client:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (client) => {
    setClientToDelete(client);
    setConfirmDialogOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!clientToDelete) return;
    
    try {
      await Client.delete(clientToDelete.id);
      setConfirmDialogOpen(false);
      await loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
    }
  };
  
  const selectClient = async (client) => {
    try {
      await User.updateMyUserData({ selectedClientId: client.id });
      navigate(createPageUrl('Dashboard'));
    } catch (error) {
      console.error('Error selecting client:', error);
    }
  };
  
  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your clients and their information
          </p>
        </div>
        <Button 
          onClick={handleAdd}
          className="bg-green-600 hover:bg-green-700"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Search className="w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Select
            value={`${sortBy}_${sortDirection}`}
            onValueChange={(value) => {
              const [field, direction] = value.split('_');
              setSortBy(field);
              setSortDirection(direction);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">Name (A-Z)</SelectItem>
              <SelectItem value="name_desc">Name (Z-A)</SelectItem>
              <SelectItem value="date_desc">Newest first</SelectItem>
              <SelectItem value="date_asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>
                    <div className="flex items-center space-x-1 cursor-pointer" onClick={() => toggleSort('name')}>
                      <span>Name</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead>User Code</TableHead>
                  <TableHead>User ID Number</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Goal</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length > 0 ? (
                  filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-6 w-6 rounded-full"
                          onClick={() => selectClient(client)}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{client.full_name}</TableCell>
                      <TableCell className="font-mono text-sm">{client.user_code || '—'}</TableCell>
                      <TableCell className="font-mono text-sm">{client.user_id_number || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col space-y-1 text-sm">
                          <div className="flex items-center space-x-1">
                            <Mail className="h-3 w-3 text-gray-400" />
                            <span>{client.email || '—'}</span>
                          </div>
                          {client.phone && (
                            <div className="flex items-center space-x-1">
                              <Phone className="h-3 w-3 text-gray-400" />
                              <span>{client.phone}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {client.height && client.weight ? (
                            <span>
                              {client.height}cm, {client.weight}kg
                              {client.age ? `, ${client.age} y.o.` : ''}
                            </span>
                          ) : (
                            <span className="text-gray-400">No data</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.goal && (
                          <Badge variant="outline" className={
                            client.goal === 'lose' ? 'border-orange-200 text-orange-700 bg-orange-50' :
                            client.goal === 'maintain' ? 'border-blue-200 text-blue-700 bg-blue-50' :
                            'border-green-200 text-green-700 bg-green-50'
                          }>
                            {client.goal === 'lose' ? 'Lose Weight' :
                             client.goal === 'maintain' ? 'Maintain Weight' :
                             'Gain Weight'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => selectClient(client)}>
                              <Check className="mr-2 h-4 w-4" />
                              <span>Select Client</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(client)}>
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Edit Details</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteClick(client)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-gray-500">
                      {isLoading ? (
                        <div className="flex justify-center items-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
                        </div>
                      ) : searchTerm ? (
                        'No clients match your search'
                      ) : (
                        'No clients added yet'
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{currentUser ? 'Edit Client' : 'Add New Client'}</DialogTitle>
            <DialogDescription>
              {currentUser ? 'Update client information' : 'Enter the details to add a new client'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="user_code">Client Code</Label>
                  <Input
                    id="user_code"
                    required
                    value={formData.user_code}
                    onChange={(e) => setFormData({...formData, user_code: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_id_number">User ID Number</Label>
                  <Input
                    id="user_id_number"
                    required
                    value={formData.user_id_number}
                    onChange={(e) => setFormData({...formData, user_id_number: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData({...formData, height: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    value={formData.weight}
                    onChange={(e) => setFormData({...formData, weight: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    value={formData.age}
                    onChange={(e) => setFormData({...formData, age: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select 
                    value={formData.gender} 
                    onValueChange={(value) => setFormData({...formData, gender: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="activity_level">Activity Level</Label>
                  <Select 
                    value={formData.activity_level} 
                    onValueChange={(value) => setFormData({...formData, activity_level: value})}
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
                    onValueChange={(value) => setFormData({...formData, goal: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lose">Lose Weight</SelectItem>
                      <SelectItem value="maintain">Maintain Weight</SelectItem>
                      <SelectItem value="gain">Gain Weight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="bg-green-600 hover:bg-green-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Saving...
                  </>
                ) : currentUser ? 'Save Changes' : 'Add Client'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the client "{clientToDelete?.full_name}"? 
              This action cannot be undone and will remove all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDelete}
            >
              Delete Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
