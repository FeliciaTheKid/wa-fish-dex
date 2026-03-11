import { createClient } from '@supabase/supabase-js'

// Use fallback empty strings to prevent the "!' crash during build
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

// 🔎 Helpful "Electrician's Test" for your connection
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase credentials missing. Check Vercel Environment Variables.")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)