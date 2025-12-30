const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Manually load env vars
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const parseEnv = (key) => {
  const regex = new RegExp(`${key}=["']?([^"'\n]+)["']?`);
  const match = envContent.match(regex);
  return match ? match[1] : null;
};

const supabaseUrl = parseEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = parseEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function importClients() {
  const filePath = path.join(__dirname, '../clientesantigos.csv');
  console.log(`Reading file: ${filePath}`);

  // Read entire file content using latin1
  const fileContent = fs.readFileSync(filePath, { encoding: 'latin1' });
  const lines = fileContent.split(/\r?\n/);

  const clients = [];
  let isFirstLine = true;

  for (const line of lines) {
    if (!line.trim()) continue;
    
    if (isFirstLine) {
        if (line.trim().toLowerCase().startsWith('id,')) {
            isFirstLine = false;
            continue;
        }
        isFirstLine = false;
    }

    const cols = line.split(',');
    if (cols.length < 8) continue;

    const name = cols[2]?.trim();
    if (!name) continue;

    const phone = cols[3]?.trim();
    const typeRaw = cols[5]?.trim();
    const email = cols[7]?.trim();
    const cpf = cols[8]?.trim();
    const birthDateRaw = cols[4]?.trim();
    const clientType = typeRaw === 'CLIENTE COMUM' ? 'common' : 'common'; 

    const formatDate = (dateStr) => {
        if (!dateStr || dateStr.length < 8) return null;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
        return null;
    };

    const birthDate = formatDate(birthDateRaw);
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;
    
    clients.push({
        name,
        phone,
        client_type: clientType,
        email: email && email.includes('@') ? email : null,
        cpf_cnpj: cleanCpf,
        birth_date: birthDate,
    });
  }

  console.log(`Parsed ${clients.length} clients.`);
  
  // Cleanup previously imported clients (Heuristic: birth_date is not null AND created_at is today)
  // Or just delete all clients created today? Safer to be specific.
  // Actually, user said "Antes eu usava planilha".
  // The system probably didn't have birth_date before.
  // So deleting where birth_date IS NOT NULL is a decent cleanup if they confirm no other birth dates were added.
  // BUT safer: Delete clients where created_at > now() - 1 hour.
  
  console.log("Cleaning up previous import (Deleting clients created in the last 1 hour)...");
  // Get ID of clients created recently
  const { data: toDelete, error: listError } = await supabase
    .from('clients')
    .select('id')
    .gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    
  if (toDelete && toDelete.length > 0) {
      console.log(`Found ${toDelete.length} recently imported clients to delete.`);
      const deleteIds = toDelete.map(c => c.id);
      
      // Batch delete to avoid payload limits
      for (let i = 0; i < deleteIds.length; i += 100) {
          const batchIds = deleteIds.slice(i, i + 100);
          await supabase.from('clients').delete().in('id', batchIds);
      }
      console.log("✅ Cleanup complete.");
  }

  console.log(`Processing import batches (latin1 -> utf8 happens automatically by node buffer string convert)...`);

  // Insert in batches
  const BATCH_SIZE = 50;
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    
    // Check duplicates manually to avoid failing the whole batch
    const safeBatch = [];
    
    for (const client of batch) {
        if (client.cpf_cnpj) {
            const { data: existing } = await supabase
                .from('clients')
                .select('id')
                .eq('cpf_cnpj', client.cpf_cnpj)
                .single();
            
            if (existing) {
                skippedCount++;
                continue;
            }
        }
        safeBatch.push(client);
    }
    
    if (safeBatch.length > 0) {
        const { error } = await supabase.from('clients').insert(safeBatch);
        if (error) {
            console.error(`Error inserting batch ${i}:`, error.message);
            errorCount += safeBatch.length;
        } else {
            successCount += safeBatch.length;
            process.stdout.write('.');
        }
    }
  }

  console.log(`\n\nImport Finished!`);
  console.log(`Success: ${successCount}`);
  console.log(`Skipped (Duplicate CPF): ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
}

importClients();
