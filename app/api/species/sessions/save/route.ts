import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    const { data, error } = await supabase
      .from('Sessions') // <--- Changed from 'Session' to match your DB
     .upsert([{
        id: body.sessionId,
        startTime: body.startTime ? new Date(body.startTime).toISOString() : new Date().toISOString(),
        endTime: new Date().toISOString(),
        location: body.location || 'Unknown',
        notes: body.notes || '',
        // --- ADD THESE WEATHER FIELDS ---
        temp: body.weather?.temp || '--',
        wind: body.weather?.wind || '--',
        cond: body.weather?.cond || '--',
        // --- GPS DATA ---
        distance: body.distance || 0,
        path: body.path || []
      }])
      .select()
      .single()

    if (error) {
      console.error("Supabase Session Error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error("Critical Session API Error:", err)
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
  }
}
