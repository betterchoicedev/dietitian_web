import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check active sessions and sets the user
    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }

        setUser(session?.user ?? null);
        
        // Listen for changes on auth state (sign in, sign out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
          setUser(session?.user ?? null);
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
    signUp: async (data) => {
      try {
        const { data: authData, error } = await supabase.auth.signUp(data);
        if (error) throw error;
        return { data: authData, error: null };
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