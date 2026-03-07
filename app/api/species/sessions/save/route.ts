import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log("Saving Session ID:", body.sessionId)

    const { data, error } = await supabase
      .from('Sessions') 
      .upsert([{
        id: body.sessionId,
        location: body.location || 'Unknown',
        notes: body.notes || '',
        // These match the new SQL columns we just added
        temp: body.weather?.temp || '--',
        wind: body.weather?.wind || '--',
        cond: body.weather?.cond || '--',
        startTime: body.startTime ? new Date(body.startTime).toISOString() : new Date().toISOString(),
        endTime: new Date().toISOString()
      }])
      .select()

    if (error) {
      // This will show up in your VS Code Terminal
      console.error("SUPABASE ERROR:", error.message, error.details)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data[0])
  } catch (err: any) {
    console.error("CRITICAL API ERROR:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
