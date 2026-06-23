import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kkrpgxhqgbywavkjonqm.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrcnBneGhxZ2J5d2F2a2pvbnFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjU0MzAsImV4cCI6MjA4OTk0MTQzMH0.yNenBh3R1v3OH0ZVXzYG6T9abQBzttPbIdh5BKTlm4k'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
