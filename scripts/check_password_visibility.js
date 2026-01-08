const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const parseEnv = (key) => {
  const regex = new RegExp(`${key}=["']?([^"'\n]+)["']?`);
  const match = envContent.match(regex);
  return match ? match[1] : null;
};

const supabase = createClient(
  parseEnv('NEXT_PUBLIC_SUPABASE_URL'),
  parseEnv('SUPABASE_SERVICE_ROLE_KEY')
);

async function checkOtherUsers() {
  console.log("Checking password fields for users...");

  // Fetch users where admin_generated_password IS NOT NULL
  const { data: usersWithPass, error } = await supabase
    .from('users')
    .select('email, first_name, admin_generated_password')
    .not('admin_generated_password', 'is', null)
    .limit(5);

  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log(`\nFound ${usersWithPass.length} users WITH visible passwords (admin_generated_password):`);
    usersWithPass.forEach(u => {
        console.log(`- ${u.email} (${u.first_name}): ${u.admin_generated_password}`);
    });
  }

  // Fetch specific user
  const { data: specificUser, error: err2 } = await supabase
    .from('users')
    .select('email, first_name, admin_generated_password')
    .eq('email', 'acessopcvictor@gmail.com')
    .single();
    
   if (specificUser) {
       console.log(`\nTarget User:`);
       console.log(`- ${specificUser.email}: ${specificUser.admin_generated_password || 'NULL (Not visible)'}`);
   }
}

checkOtherUsers();
