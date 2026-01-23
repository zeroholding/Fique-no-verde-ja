const { Client } = require('pg');

const supabaseConn = 'postgresql://postgres:mmSpgjWDXtTSPjtM@db.xqkhmtrxcpjmxtwpqacg.supabase.co:5432/postgres';
const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function auditDatabases() {
  console.log('=== AUDITORIA COMPLETA: SUPABASE vs COOLIFY ===\n');
  
  const supabase = new Client({ connectionString: supabaseConn, ssl: { rejectUnauthorized: false } });
  const coolify = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await supabase.connect();
    await coolify.connect();
    console.log('✅ Conectado a ambos os bancos!\n');
    
    // 1. Functions
    console.log('--- FUNÇÕES ---');
    const supFuncs = await supabase.query(`SELECT proname FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND pg_proc.prokind = 'f'`);
    const coolFuncs = await coolify.query(`SELECT proname FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND pg_proc.prokind = 'f'`);
    const supFuncNames = supFuncs.rows.map(r => r.proname);
    const coolFuncNames = coolFuncs.rows.map(r => r.proname);
    const missingFuncs = supFuncNames.filter(f => !coolFuncNames.includes(f));
    console.log(`Supabase: ${supFuncNames.length} | Coolify: ${coolFuncNames.length}`);
    if (missingFuncs.length) console.log(`❌ Faltando no Coolify: ${missingFuncs.join(', ')}`);
    else console.log('✅ Todas as funções migradas!');
    
    // 2. Triggers
    console.log('\n--- TRIGGERS ---');
    const supTriggers = await supabase.query(`SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public'`);
    const coolTriggers = await coolify.query(`SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public'`);
    console.log(`Supabase: ${supTriggers.rows.length} | Coolify: ${coolTriggers.rows.length}`);
    const supTriggerNames = supTriggers.rows.map(r => r.trigger_name);
    const coolTriggerNames = coolTriggers.rows.map(r => r.trigger_name);
    const missingTriggers = supTriggerNames.filter(t => !coolTriggerNames.includes(t));
    if (missingTriggers.length) {
      console.log(`❌ Faltando no Coolify:`);
      missingTriggers.forEach(t => {
        const trig = supTriggers.rows.find(r => r.trigger_name === t);
        console.log(`   - ${t} (tabela: ${trig.event_object_table})`);
      });
    } else console.log('✅ Todos os triggers migrados!');
    
    // 3. Indexes
    console.log('\n--- INDEXES ---');
    const supIdx = await supabase.query(`SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey'`);
    const coolIdx = await coolify.query(`SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey'`);
    console.log(`Supabase: ${supIdx.rows.length} | Coolify: ${coolIdx.rows.length}`);
    const missingIdx = supIdx.rows.filter(s => !coolIdx.rows.some(c => c.indexname === s.indexname));
    if (missingIdx.length) {
      console.log(`❌ Faltando no Coolify:`);
      missingIdx.forEach(i => console.log(`   - ${i.indexname} (tabela: ${i.tablename})`));
    } else console.log('✅ Todos os indexes migrados!');
    
    // 4. Foreign Keys
    console.log('\n--- FOREIGN KEYS ---');
    const supFk = await supabase.query(`SELECT constraint_name, table_name FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND constraint_schema = 'public'`);
    const coolFk = await coolify.query(`SELECT constraint_name, table_name FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND constraint_schema = 'public'`);
    console.log(`Supabase: ${supFk.rows.length} | Coolify: ${coolFk.rows.length}`);
    const missingFk = supFk.rows.filter(s => !coolFk.rows.some(c => c.constraint_name === s.constraint_name));
    if (missingFk.length) {
      console.log(`❌ Faltando no Coolify: ${missingFk.length} FKs`);
    } else console.log('✅ Todas as FKs migradas!');
    
    // 5. Extensions
    console.log('\n--- EXTENSÕES ---');
    const supExt = await supabase.query(`SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql')`);
    const coolExt = await coolify.query(`SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql')`);
    console.log(`Supabase: ${supExt.rows.map(r => r.extname).join(', ')}`);
    console.log(`Coolify: ${coolExt.rows.map(r => r.extname).join(', ')}`);
    const missingExt = supExt.rows.filter(s => !coolExt.rows.some(c => c.extname === s.extname));
    if (missingExt.length) console.log(`❌ Faltando: ${missingExt.map(e => e.extname).join(', ')}`);
    else console.log('✅ Todas as extensões presentes!');
    
    // 6. Primary Keys
    console.log('\n--- PRIMARY KEYS ---');
    const supPk = await supabase.query(`SELECT constraint_name, table_name FROM information_schema.table_constraints WHERE constraint_type = 'PRIMARY KEY' AND constraint_schema = 'public'`);
    const coolPk = await coolify.query(`SELECT constraint_name, table_name FROM information_schema.table_constraints WHERE constraint_type = 'PRIMARY KEY' AND constraint_schema = 'public'`);
    console.log(`Supabase: ${supPk.rows.length} | Coolify: ${coolPk.rows.length}`);
    const missingPk = supPk.rows.filter(s => !coolPk.rows.some(c => c.table_name === s.table_name));
    if (missingPk.length) {
      console.log(`❌ Tabelas sem PK no Coolify:`);
      missingPk.forEach(p => console.log(`   - ${p.table_name}`));
    } else console.log('✅ Todas as PKs presentes!');
    
    console.log('\n=== AUDITORIA CONCLUÍDA ===');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await supabase.end();
    await coolify.end();
  }
}

auditDatabases();
