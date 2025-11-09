import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { EventBus } from '@/utils/EventBus';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://dietitian-be.azurewebsites.net';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingMagicLink, setProcessingMagicLink] = useState(false);

  useEffect(() => {
    // Check active sessions and sets the user
    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }

        setUser(session?.user ?? null);

        const handleHashRedirect = async () => {
          if (processingMagicLink) return;
          const hash = window.location.hash;
          if (!hash) return;

          const params = new URLSearchParams(hash.slice(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            try {
              setProcessingMagicLink(true);
              const { data, error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              if (sessionError) {
                console.error('Error setting session from magic link:', sessionError);
              } else {
                setUser(data?.session?.user ?? null);
              }
            } catch (err) {
              console.error('Failed to process magic link:', err);
            } finally {
              setProcessingMagicLink(false);
              window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            }
          }
        };

        handleHashRedirect();

        // Listen for changes on auth state (sign in, sign out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          setUser(session?.user ?? null);
          
          // Emit events for client list refresh
          if (event === 'SIGNED_IN' && session?.user) {
            console.log('🔐 User signed in, emitting userLoggedIn event');
            EventBus.emit('userLoggedIn');
          } else if (event === 'SIGNED_OUT') {
            console.log('🔐 User signed out, emitting userLoggedOut event');
            EventBus.emit('userLoggedOut');
          }
        });

        return () => {
          subscription?.unsubscribe();
        };
      } catch (error) {
        console.error('Error initializing auth:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const value = {
    signUp: async ({ email, password, name, companyId, inviteCode }) => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            name,
            invite_code: inviteCode,
            company_id: companyId || null,
          }),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = result?.error || 'Failed to create account';
          throw new Error(message);
        }

        return { data: result, error: null };
      } catch (error) {
        console.error('Error signing up:', error);
        return { data: null, error };
      }
    },
    signIn: async (data) => {
      try {
        const { data: authData, error } = await supabase.auth.signInWithPassword(data);
        if (error) throw error;
        return { data: authData, error: null };
      } catch (error) {
        console.error('Error signing in:', error);
        return { data: null, error };
      }
    },
    signOut: async () => {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        return { error: null };
      } catch (error) {
        // If session is missing, consider it already signed out (successful)
        if (error.message?.includes('Auth session missing') || error.name === 'AuthSessionMissingError') {
          console.log('Session already expired or missing - treating as successful sign out');
          setUser(null); // Ensure user state is cleared
          return { error: null };
        }
        
        console.error('Error signing out:', error);
        return { error };
      }
    },
    resetPassword: async (email) => {
      try {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password-confirm?reset=true`,
        });
        if (error) throw error;
        return { data, error: null };
      } catch (error) {
        console.error('Error resetting password:', error);
        return { data: null, error };
      }
    },
    updatePassword: async (newPassword) => {
      try {
        // First, get the current session to ensure we're authenticated
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }
        
        if (!session) {
          throw new Error('No active session. Please use the password reset link from your email.');
        }

        // Update the password
        const { data, error } = await supabase.auth.updateUser({
          password: newPassword
        });
        
        if (error) throw error;
        return { data, error: null };
      } catch (error) {
        console.error('Error updating password:', error);
        return { data: null, error };
      }
    },
    user,
    loading,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 