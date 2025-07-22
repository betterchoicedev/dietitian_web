import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ikkoplkcekzstlnsohby.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlra29wbGtjZWt6c3RsbnNvaGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0NTIxNjIsImV4cCI6MjA1OTAyODE2Mn0.VBE-j-EYd2or-6V5_nFCXMXCFaZckXj_quz2YbuyTYM'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
}) 