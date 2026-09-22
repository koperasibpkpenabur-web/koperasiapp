import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fxyssksvbuxnbthfrpzy.supabase.co';
const supabaseKey = 'sb_publishable_JUIGMNHK9hiFS4Y3CIAQ1Q_29xSzuq1';

export const supabase = createClient(supabaseUrl, supabaseKey);
