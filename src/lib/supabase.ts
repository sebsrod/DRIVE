import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Faltan variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copia .env.example como .env.local y completa los valores.',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export const PERSONAL_BUCKET = 'personal-documents'
export const SHARED_BUCKET = 'shared-documents'
