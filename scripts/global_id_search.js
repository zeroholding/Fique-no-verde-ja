
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function searchGlobal() {
  const phantomId = '7f093a19-4ba6-455b-b9d0-087093557e0e';
  try {
    const { data: tables } = await supabase.rpc('exec_sql', { 
      query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" 
    });

    for (const { table_name } of tables) {
       const { data: cols } = await supabase.rpc('exec_sql', { 
         query: `SELECT column_name FROM information_schema.columns WHERE table_name = '${table_name}' AND data_type IN ('uuid', 'text', 'character varying')` 
       });
       
       for (const { column_name } of cols) {
          const { data: found } = await supabase.rpc('exec_sql', { 
            query: `SELECT '${table_name}.${column_name}' as source FROM ${table_name} WHERE ${column_name}::text = '${phantomId}' LIMIT 1` 
          });
          if (found && found.length > 0) {
             console.log(`FOUND! Table: ${table_name}, Column: ${column_name}`);
          }
       }
    }
    console.log("Search finished.");
  } catch (e) {
    console.log("ERROR:" + e.message);
  }
}
searchGlobal();
