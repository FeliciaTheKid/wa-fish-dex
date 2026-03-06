'use server'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function logCatch(formData: FormData) {
  const supabase = await createClient()
  const name = formData.get('speciesName')

  const { error } = await supabase
    .from('species')
    .insert([{ name }])

  if (error) {
    console.error('Error logging fish:', error)
    return
  }

  // This tells the app to refresh the "Total Species" count immediately
  revalidatePath('/')
}
