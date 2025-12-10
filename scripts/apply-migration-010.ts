import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env vars
config({ path: '.env.local' });
config({ path: '.env' });

import { query } from '../lib/db';

async function run() {
  const migrationPath = path.join(process.cwd(), 'database/migrations/010_add_nickname_to_ml_credentials.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('Applying migration from:', migrationPath);
  try {
    const res = await query(sql);
    console.log('Migration applied successfully.', res);
  } catch (error) {
    console.error('Error applying migration:', error);
  }
}

run();
