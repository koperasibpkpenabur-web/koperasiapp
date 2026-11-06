import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fxyssksvbuxnbthfrpzy.supabase.co';
const supabaseKey = 'sb_publishable_JUIGMNHK9hiFS4Y3CIAQ1Q_29xSzuq1';

// Menggunakan sessionStorage agar sesi otomatis berakhir saat tab atau browser ditutup (Opsi C)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
