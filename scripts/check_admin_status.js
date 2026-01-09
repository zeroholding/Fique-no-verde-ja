const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAdmin() {
  const userId = '51cbe1f7-0c68-47e0-a565-1ad4aa09f680'; // Gianlucca
  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, email, is_admin')
    .eq('id', userId)
    .single();

  if (error) console.error(error);
  console.log("User:", data);
}

checkAdmin();
