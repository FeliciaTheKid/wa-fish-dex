import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // Check your terminal in VS Code to see exactly what is arriving
    console.log("Saving Catch:", body)

    const { data, error } = await supabase
      .from('species')
      .insert([{
        id: body.id,
        name: body.name,
        quantity: Number(body.quantity) || 1,
        weight: body.weight ? Number(body.weight) : null,
        length: body.length ? Number(body.length) : null,
        // 🎣 ADD THIS LINE HERE:
        lure: body.lure || null, 
        date: body.date || new Date().toISOString(),
        location: body.location || 'Unknown',
        sessionId: body.sessionId || null,
        notes: body.notes || '' 
      }])
      .select()

    if (error) {
      // This will tell you if a column name is wrong or a type is mismatched
      console.error("Supabase Database Error:", error.message, error.details)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data[0]) // Return the first (and only) inserted row
  } catch (err) {
    console.error("Critical API Error:", err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
