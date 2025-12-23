const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkSchema() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching data:', error);
  } else {
    console.log('Commission Record Sample:');
    console.log(JSON.stringify(data, null, 2));
    if (data && data.length > 0) {
        console.log('Keys:', Object.keys(data[0]));
    }
  }
}

checkSchema();
