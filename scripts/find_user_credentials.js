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

async function findUser() {
  const email = 'acessopcvictor@gmail.com';
  console.log(`Searching for user: ${email}...`);

  const { data: users, error } = await supabase
    .from('users')
    .select('id, first_name, last_name, email, password_hash, admin_generated_password')
    .eq('email', email);

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  if (!users || users.length === 0) {
      console.log("User not found.");
  } else {
      const user = users[0];
      console.log("User Found:");
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.first_name} ${user.last_name}`);
      console.log(`Email: ${user.email}`);
      console.log(`Admin Generated Password: ${user.admin_generated_password || 'NULL'}`);
      console.log(`Password Hash: ${user.password_hash ? '(Hashed - Cannot decrypt)' : 'NULL'}`);
  }
}

findUser();
