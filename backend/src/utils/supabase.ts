import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY

export const supabaseEnabled = Boolean(url && key)

export const supabase = supabaseEnabled
  ? createClient(url!, key!, { auth: { persistSession: false } })
  : null

export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'oc-imagenes'
