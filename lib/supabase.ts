import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// This is the "bridge" that handles all your lake and species lookups
export const supabase = createClient(supabaseUrl, supabaseAnonKey)