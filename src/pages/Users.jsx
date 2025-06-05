
import React, { useState, useEffect } from 'react';
import { User } from '@/api/entities';
import { 
  Search, 
  UserPlus, 
  Users as UsersIcon, 
  Mail, 
  Phone, 
  Edit 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const sampleUsers = [
  {
    id: generateUserIdNumber(),
    full_name: 'John Doe',
    email: 'john.doe@example.com',
    user_code: generateUniqueCode(),
    height: 180,
    weight: 75,
    age: 30,
    gender: 'male',
    activity_level: 'moderate',
    goal: 'maintain',
  },
  {
    id: generateUserIdNumber(),
    full_name: 'Jane Smith',
    email: 'jane.smith@example.com',
    user_code: generateUniqueCode(),
    height: 165,
    weight: 60,
    age: 28,
    gender: 'female',
    activity_level: 'light',
    goal: 'lose',
  },
  {
    id: generateUserIdNumber(),
    full_name: 'Alice Johnson',
    email: 'alice.johnson@example.com',
    user_code: generateUniqueCode(),
    height: 170,
    weight: 65,
    age: 22,
    gender: 'female',
    activity_level: 'very',
    goal: 'gain',
  },
];

export default function Users() {
  const [users, setUsers] = useState(sampleUsers);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({
    user_code: '',
    height: '',
    weight: '',
    age: '',
    gender: '',
    activity_level: '',
    goal: ''
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const userData = await User.list();
      setUsers(userData);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (user) => {
    setCurrentUser(user);
    setFormData({
      user_code: user.user_code || '',
      height: user.height || '',
      weight: user.weight || '',
      age: user.age || '',
      gender: user.gender || '',
      activity_level: user.activity_level || '',
      goal: user.goal || ''
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await User.update(currentUser.id, formData);
      setDialogOpen(false);
      loadUsers();
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage user profiles and dietary information
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Search className="w-5 h-5 text-gray-400" />
        <Input
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            View and manage all registered users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>User Code</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.user_code || '—'}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {user.height && user.weight ? (
                            <span>
                              {user.height}cm, {user.weight}kg
                              {user.age ? `, ${user.age} y.o.` : ''}
                            </span>
                          ) : (
                            <span className="text-gray-400">No data</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(user)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User Information</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="user_code" className="text-right">
                  User Code
                </Label>
                <Input
                  id="user_code"
                  value={formData.user_code}
                  onChange={(e) => setFormData({...formData, user_code: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="height" className="text-right">
                  Height (cm)
                </Label>
                <Input
                  id="height"
                  type="number"
                  value={formData.height}
                  onChange={(e) => setFormData({...formData, height: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="weight" className="text-right">
                  Weight (kg)
                </Label>
                <Input
                  id="weight"
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({...formData, weight: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="age" className="text-right">
                  Age
                </Label>
                <Input
                  id="age"
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({...formData, age: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="gender" className="text-right">
                  Gender
                </Label>
                <Select 
                  value={formData.gender} 
                  onValueChange={(value) => setFormData({...formData, gender: value})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="activity_level" className="text-right">
                  Activity
                </Label>
                <Select 
                  value={formData.activity_level} 
                  onValueChange={(value) => setFormData({...formData, activity_level: value})}
                >
                  <SelectTrigger className="col-span-3">
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="goal" className="text-right">
                  Goal
                </Label>
                <Select 
                  value={formData.goal} 
                  onValueChange={(value) => setFormData({...formData, goal: value})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lose">Lose Weight</SelectItem>
                    <SelectItem value="maintain">Maintain Weight</SelectItem>
                    <SelectItem value="gain">Gain Weight</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button 
                type="button" 
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="bg-green-600 hover:bg-green-700"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
