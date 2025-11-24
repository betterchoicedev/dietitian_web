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

// Second Supabase admin client for auth operations (if service role key is available)
const secondSupabaseServiceRoleKey = import.meta.env.VITE_SECOND_SUPABASE_SERVICE_ROLE_KEY

export const secondSupabaseAdmin = secondSupabaseServiceRoleKey
  ? createClient(secondSupabaseUrl, secondSupabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null 