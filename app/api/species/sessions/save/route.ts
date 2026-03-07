import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    // 🎣 Log the incoming ID to your terminal for easy debugging
    console.log("Saving Session ID:", body.id)

    const { data, error } = await supabase
      .from('Sessions') 
      .upsert([{
        id: body.id,                 // Matches 'id' from handleFinalizeSession
        location: body.location || 'Unknown',
        notes: body.notes || '',
        temp: body.temp || '--',     // Matches the flat 'temp' sent by phone
        wind: body.wind || '--',     // Matches the flat 'wind' sent by phone
        cond: body.cond || '--',     // Matches the flat 'cond' sent by phone
        startTime: body.startTime,   // Already ISO string from the phone
        endTime: new Date().toISOString()
      }])
      .select()

    if (error) {
      console.error("SUPABASE ERROR:", error.message, error.details)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data[0])
  } catch (err: any) {
    console.error("CRITICAL API ERROR:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
