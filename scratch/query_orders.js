import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fxyssksvbuxnbthfrpzy.supabase.co';
const supabaseKey = 'sb_publishable_JUIGMNHK9hiFS4Y3CIAQ1Q_29xSzuq1';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('orders').select('id, order_phase, created_at').order('created_at', { ascending: false });
  console.log('All orders:', data);
  if (error) console.error(error);
}

run();
