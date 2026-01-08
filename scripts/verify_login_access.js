const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
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

async function verifyLogin() {
  const email = 'acessopcvictor@gmail.com';
  const passwordToCheck = '7c78tnt0';

  console.log(`Verifying login access for: ${email}`);
  
  // 1. Fetch Hash
  const { data: user, error } = await supabase
    .from('users')
    .select('password_hash')
    .eq('email', email)
    .single();

  if (error || !user) {
    console.error("User not found or error:", error?.message);
    return;
  }

  // 2. Compare
  const isValid = await bcrypt.compare(passwordToCheck, user.password_hash);

  if (isValid) {
      console.log("✅ SUCCESS: The password matches the hash in the database.");
      console.log("User can login with this password.");
  } else {
      console.error("❌ FAILURE: Password does NOT match the hash.");
  }
}

verifyLogin();
