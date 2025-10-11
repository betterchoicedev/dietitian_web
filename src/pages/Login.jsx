import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FloatingLanguageToggle } from '@/components/ui/language-toggle';

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { translations } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      const { error: signInError } = await signIn({
        email: formData.email,
        password: formData.password,
      });
      
      if (signInError) {
        throw signInError;
      }
      
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      setError(error.message || translations.failedToSignIn);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 bg-mesh relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 bg-grid opacity-30"></div>
      <div className="absolute top-10 left-10 w-72 h-72 bg-gradient-to-br from-primary/20 to-success/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-gradient-to-br from-success/20 to-info/20 rounded-full blur-3xl"></div>
      
      <FloatingLanguageToggle />
      
      <div className="relative z-10 animate-scale-in">
        <Card className="w-[420px] shadow-2xl">
          <CardHeader className="text-center pb-4">
            {/* Logo section */}
            <div className="flex items-center justify-center mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src="/images/logos/logo-placeholder.png" alt="BetterChoice Logo" className="w-12 h-12 drop-shadow-md" />
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-transparent"></div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-2xl font-bold text-gradient-primary">BetterChoice</h1>
                  <p className="text-sm text-muted-foreground/70">Professional Nutrition Platform</p>
                </div>
              </div>
            </div>
            <CardTitle className="text-2xl">{translations.login}</CardTitle>
            <CardDescription className="text-base">{translations.enterCredentials}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-foreground/80">{translations.email}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={translations.enterEmail}
                    value={formData.email}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    className="h-11 bg-white/80 backdrop-blur-sm border-border/60 shadow-sm hover:border-primary/40 focus:border-primary/60 transition-all duration-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-foreground/80">{translations.password}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder={translations.enterPassword}
                    value={formData.password}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    className="h-11 bg-white/80 backdrop-blur-sm border-border/60 shadow-sm hover:border-primary/40 focus:border-primary/60 transition-all duration-300"
                  />
                </div>
                {error && (
                  <Alert variant="destructive" className="bg-error-bg border-error/30">
                    <AlertDescription className="text-error">{error}</AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-6 pt-2">
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold"
                disabled={loading}
                size="lg"
              >
                {loading ? translations.signingIn : translations.signIn}
              </Button>
              <div className="text-sm text-center text-muted-foreground space-y-2">
                <div>
                  {translations.dontHaveAccount}{' '}
                  <Button 
                    variant="link" 
                    className="p-0 text-primary hover:text-primary-lighter font-semibold" 
                    onClick={() => navigate('/register')}
                    disabled={loading}
                  >
                    {translations.register}
                  </Button>
                </div>
                <div>
                  <Button 
                    variant="link" 
                    className="p-0 text-muted-foreground hover:text-primary font-semibold" 
                    onClick={() => navigate('/reset-password')}
                    disabled={loading}
                  >
                    {translations.forgotPassword}
                  </Button>
                </div>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
} 