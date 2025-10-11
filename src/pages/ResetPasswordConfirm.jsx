import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FloatingLanguageToggle } from '@/components/ui/language-toggle';

export default function ResetPasswordConfirm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { updatePassword } = useAuth();
  const { translations } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });
  const [isValidSession, setIsValidSession] = useState(false);

  useEffect(() => {
    // Check if we have the required URL parameters for password reset
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    const reset = searchParams.get('reset');
    
    console.log('URL parameters:', { token, type, reset, allParams: Object.fromEntries(searchParams.entries()) });

    // Check if this is a password reset flow (either from URL params or reset flag)
    if ((token && type === 'recovery') || reset === 'true') {
      // Supabase automatically handles the session when the user clicks the reset link
      // We just need to verify the session is valid
      const checkSession = async () => {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          console.log('Session check result:', { session, error });
          
          if (error) {
            console.error('Session error:', error);
            setError(translations.invalidResetLink);
            return;
          }
          
          if (session) {
            console.log('Valid session found, user:', session.user?.email);
            setIsValidSession(true);
          } else {
            console.log('No session found');
            setError(translations.invalidResetLink);
          }
        } catch (error) {
          console.error('Error checking session:', error);
          setError(translations.invalidResetLink);
        }
      };
      
      checkSession();
    } else {
      // If no reset parameters, check if user is logged in and redirect appropriately
      const checkIfLoggedIn = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // User is logged in but not in reset flow, redirect to dashboard
            console.log('User is logged in, redirecting to dashboard');
            navigate('/dashboard');
          } else {
            // No session and no reset parameters, show error
            setError(translations.invalidResetLink);
          }
        } catch (error) {
          console.error('Error checking session:', error);
          setError(translations.invalidResetLink);
        }
      };
      
      checkIfLoggedIn();
    }
  }, [searchParams, translations.invalidResetLink, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const validatePassword = (password) => {
    if (password.length < 6) {
      return translations.passwordTooShort;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate passwords
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(translations.passwordsDoNotMatch);
      return;
    }

    try {
      setError('');
      setLoading(true);
      
      // Use direct Supabase call since we're in a recovery session
      const { data, error } = await supabase.auth.updateUser({
        password: formData.password
      });
      
      if (error) {
        throw error;
      }
      
      setSuccess(true);
    } catch (error) {
      console.error('Password update error:', error);
      setError(error.message || translations.failedToUpdatePassword);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  if (!isValidSession) {
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
              <CardTitle className="text-2xl text-error">{translations.invalidResetLink}</CardTitle>
              <CardDescription className="text-base">{translations.invalidResetLinkMessage}</CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-col gap-4 pt-2">
              <Button 
                onClick={handleBackToLogin}
                className="w-full h-12 text-base font-semibold"
                size="lg"
              >
                {translations.backToLogin}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
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
              <CardTitle className="text-2xl text-success">{translations.passwordUpdatedSuccess}</CardTitle>
              <CardDescription className="text-base">{translations.passwordUpdatedMessage}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-success/10 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-muted-foreground mb-4">
                  {translations.passwordUpdatedDescription}
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pt-2">
              <Button 
                onClick={handleBackToLogin}
                className="w-full h-12 text-base font-semibold"
                size="lg"
              >
                {translations.backToLogin}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

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
            <CardTitle className="text-2xl">{translations.setNewPassword}</CardTitle>
            <CardDescription className="text-base">{translations.setNewPasswordDescription}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-foreground/80">{translations.newPassword}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder={translations.enterNewPassword}
                    value={formData.password}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    className="h-11 bg-white/80 backdrop-blur-sm border-border/60 shadow-sm hover:border-primary/40 focus:border-primary/60 transition-all duration-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground/80">{translations.confirmNewPassword}</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder={translations.enterConfirmPassword}
                    value={formData.confirmPassword}
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
                {loading ? translations.updatingPassword : translations.updatePassword}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
