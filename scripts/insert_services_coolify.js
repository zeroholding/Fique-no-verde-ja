const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function insertServices() {
  console.log('=== INSERINDO SERVIÇOS NO COOLIFY ===\n');
  
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('Conectado!\n');
    
    const services = [
      {
        id: '7618e745-490d-4264-b349-7827ef07e3ae',
        name: 'Reclamação',
        description: 'Serviço de remoção de reclamações',
        base_price: 40,
        sla: 'Até 72 horas',
        highlights: JSON.stringify(['Cálculo progressivo de preço', 'Primeiras 10 unidades com valor especial', 'Desconto a partir da 11ª unidade']),
        is_active: true,
        created_at: '2025-11-26T18:51:00.714Z',
        updated_at: '2025-11-26T18:51:00.714Z'
      },
      {
        id: '42b1d178-1f56-46ef-8048-ecfbdfc02582',
        name: 'Atrasos',
        description: 'Serviço de remoção de atrasos',
        base_price: 30,
        sla: 'Até 72 horas',
        highlights: JSON.stringify(['Preço escalonado por quantidade', 'Desconto progressivo em grandes volumes', 'Processamento rápido']),
        is_active: true,
        created_at: '2025-11-26T18:51:00.714Z',
        updated_at: '2025-11-26T18:51:00.714Z'
      }
    ];

    for (const svc of services) {
      await client.query(`
        INSERT INTO services (id, name, description, base_price, sla, highlights, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [svc.id, svc.name, svc.description, svc.base_price, svc.sla, svc.highlights, svc.is_active, svc.created_at, svc.updated_at]);
      console.log(`✅ Inserido: ${svc.name}`);
    }
    
    // Verify
    const result = await client.query('SELECT id, name FROM services');
    console.log(`\nTotal services agora: ${result.rows.length}`);
    result.rows.forEach(r => console.log(`  - ${r.name}`));
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

insertServices();
