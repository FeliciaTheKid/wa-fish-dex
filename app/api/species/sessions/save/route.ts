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
        id: body.id,
        location: body.location || 'Unknown',
        notes: body.notes || '',
        temp: body.temp || '--',
        wind: body.wind || '--',
        cond: body.cond || '--',
        startTime: body.startTime,
        endTime: new Date().toISOString(),
        lat: body.lat,
        lon: body.lon
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