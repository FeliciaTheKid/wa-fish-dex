import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // We use .upsert() here. 
    // If the session was already created, it updates it. 
    // If not, it creates a fresh one.
    const { data, error } = await supabase
      .from('Session')
      .upsert([{
        id: body.sessionId, // The ID we generated on the frontend
        startTime: new Date(body.startTime).toISOString(),
        endTime: new Date().toISOString(),
        distance: body.distance || 0,
        path: body.path || [], // This stores your GPS array as JSON
        location: body.location || 'Unknown'
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