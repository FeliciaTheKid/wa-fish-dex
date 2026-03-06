import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { count } = await supabase
    .from('species')
    .select('*', { count: 'exact', head: true })
  
  return NextResponse.json({ count: count || 0 })
}