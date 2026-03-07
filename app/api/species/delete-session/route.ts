import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('id')

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
    }

    // 🎣 Target the parent table 'Sessions'
    const { error } = await supabase
      .from('Sessions') 
      .delete()
      .eq('id', sessionId) // Use 'id' because that's the column name in Sessions

    if (error) throw error

    // Because of your 'Cascade Delete' setting in Supabase,
    // all fish with this sessionId in the 'species' table 
    // are now also deleted. Circuit complete!
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}