import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    inviteCode: '',
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteParam =
      params.get('invite') || params.get('token') || params.get('code');

    if (inviteParam) {
      setFormData((prev) => ({
        ...prev,
        inviteCode: inviteParam,
      }));
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      return setError('Passwords do not match');
    }

    if (!formData.inviteCode.trim()) {
      return setError('An invitation code is required to register. Please request one from your administrator.');
    }

    try {
      setError('');
      setLoading(true);
      const { error } = await signUp({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        inviteCode: formData.inviteCode.trim(),
      });
      if (error) throw error;
      navigate('/login');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="inviteCode">Invitation Code</Label>
                <Input
                  id="inviteCode"
                  name="inviteCode"
                  type="text"
                  placeholder="Enter your invitation code"
                  value={formData.inviteCode}
                  onChange={handleChange}
                  required
                />
                <span className="text-xs text-muted-foreground">
                  Contact an administrator to request access.
                </span>
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
              </div>
              {error && (
                <div className="text-sm text-red-500">
                  {error}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Register'}
            </Button>
            <div className="text-sm text-center">
              Already have an account?{' '}
              <Button 
                variant="link" 
                className="p-0" 
                onClick={() => navigate('/login')}
              >
                Login
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
} 