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

const generateRandomPassword = (length) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

async function resetPassword() {
  const email = 'acessopcvictor@gmail.com';
  console.log(`Resetting password for: ${email}...`);

  // 1. Generate Random
  const plainPassword = generateRandomPassword(8);
  console.log(`Generated Password: ${plainPassword}`);

  // 2. Hash it
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(plainPassword, salt);

  // 3. Update DB
  const { data, error } = await supabase
    .from('users')
    .update({
        password_hash: hashedPassword,
        admin_generated_password: plainPassword,
        created_by_admin: true, // Ensuring it's marked as admin-generated context
        updated_at: new Date().toISOString()
    })
    .eq('email', email)
    .select();

  if (error) {
    console.error("Update failed:", error.message);
  } else {
    console.log("Success! Password updated.");
    console.log("New Credentials:");
    console.log(`Email: ${email}`);
    console.log(`Password: ${plainPassword}`);
  }
}

resetPassword();
