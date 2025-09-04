import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Second Supabase client for the meal_plans table
const secondSupabaseUrl = import.meta.env.VITE_SECOND_SUPABASE_URL
const secondSupabaseKey = import.meta.env.VITE_SECOND_SUPABASE_ANON_KEY

export const secondSupabase = createClient(secondSupabaseUrl, secondSupabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
}) 