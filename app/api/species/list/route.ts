import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('species') // ✅ Correctly matches your new table name
      .select('*')
      .order('date', { ascending: false }) // ✅ Keeps your Log Book chronological

    if (error) {
      console.error("FETCH ERROR:", error.message);
      throw error;
    }
    
    // 🎣 This matches the 'catchData.species' property your page.tsx expects
    return NextResponse.json({ species: data || [] })
  } catch (err: any) {
    console.error("API ROUTE ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
