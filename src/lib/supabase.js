import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://snqvpuhaesbwhcmtatov.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucXZwdWhhZXNid2hjbXRhdG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxNDA1MDcsImV4cCI6MjA2NDcxNjUwN30.Cwcc1qRcUr0rNuMIkkxN9qKKbvS3ertr500bJS7qzlU'

export const supabase = createClient(supabaseUrl, supabaseKey) 