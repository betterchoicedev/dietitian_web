import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'betterchoice-primary-auth'
  }
})

// Second Supabase client for the meal_plans table
const secondSupabaseUrl = import.meta.env.VITE_SECOND_SUPABASE_URL
const secondSupabaseKey = import.meta.env.VITE_SECOND_SUPABASE_ANON_KEY

export const secondSupabase = createClient(secondSupabaseUrl, secondSupabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'betterchoice-secondary-auth'
  }
})

// ⚠️ SECURITY NOTE: Admin operations (like deleting auth users) require service role keys.
// These operations are currently done via direct API calls in Users.jsx.
// For better security, consider moving these operations to your Python backend (backend/backend.py).
// The service role key should NEVER be exposed in the frontend - it bypasses all RLS policies. 