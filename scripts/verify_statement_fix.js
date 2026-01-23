const { Client } = require('pg');

const coolifyConn = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5433/postgres';

async function verifyStatementFix() {
  const client = new Client({ connectionString: coolifyConn, ssl: false });
  
  try {
    await client.connect();
    console.log('=== VERIFICAÇÃO: EXTRATO CORRIGIDO (SALES TIPO 02) ===\n');

    // Simular a query da API para um cliente conhecido por ter recargas (FASTFLEX ou FLASH)
    // Vamos usar FASTFLEX que tinha um reload identificado no script anterior
    const targetClient = 'FASTFLEX';

    const res = await client.query(`
      SELECT 
        s.id AS sale_id,
        c.name AS client_name,
        s.sale_date,
        s.total AS value,
        si.quantity,
        si.product_name
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN clients c ON s.client_id = c.id
      WHERE UPPER(c.name) = $1
      AND si.sale_type = '02'
      AND s.status != 'cancelada'
      ORDER BY s.sale_date DESC
    `, [targetClient]);

    console.log(`Encontradas ${res.rows.length} operações de COMPRA/RECARGA para ${targetClient}:\n`);

    for (const r of res.rows) {
      console.log(`[${r.client_name}] ${r.sale_date}`);
      console.log(`    Item: ${r.product_name} | Qtd: ${r.quantity} | Valor: ${r.value}`);
      console.log(`    ID: ${r.sale_id}`);
      console.log('');
    }

    // Verificar se existe alguma venda que ANTES não aparecia
    // A query anterior buscava apenas via client_packages.sale_id
    // Vamos ver quais sales NÃO estariam na query antiga
    
    // 1. Pegar sale_id do client_packages atual
    const currentPkg = await client.query(`
        SELECT sale_id FROM client_packages 
        JOIN clients c ON client_packages.client_id = c.id
        WHERE UPPER(c.name) = $1
    `, [targetClient]);
    
    const pkgSaleId = currentPkg.rows.length > 0 ? currentPkg.rows[0].sale_id : null;
    
    console.log(`--- Comparação com lógica antiga ---`);
    console.log(`Sale ID vinculado ao pacote (Lógica Antiga): ${pkgSaleId}`);
    
    let recoveredCount = 0;
    for (const r of res.rows) {
        if (r.sale_id !== pkgSaleId) {
            console.log(`✅ RECUPERADA: Venda ${r.sale_id} (Recarga) não apareceria antes!`);
            recoveredCount++;
        } else {
            console.log(`ℹ️ MANTIDA: Venda ${r.sale_id} (Criação) já aparecia.`);
        }
    }
    
    console.log(`\nResumo: ${recoveredCount} recargas recuperadas para o extrato de ${targetClient}.`);


  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

verifyStatementFix();
