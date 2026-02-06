const { Client } = require('pg');
const path = require('path');

// Conexão direta com VPS (Extraída de scripts anteriores)
/* 
   AVISO: Usando credenciais encontradas nos scripts de manutenção para diagnosticar o banco de produção.
*/
const connectionString = 'postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres';

async function runComparison() {
    console.log("=== ANÁLISE DETALHADA: VENDAS X COMISSÕES (02/02/2026) ===");

    const client = new Client({ connectionString });

    try {
        await client.connect();
        
        const targetDate = '2026-02-02'; 

        // Busca Vendas
        const salesQuery = `
            SELECT id, sale_number::text, sale_date, total, status, attendant_id, 
                   (SELECT sale_type FROM sale_items WHERE sale_id = sales.id LIMIT 1) as sale_type_inferred
            FROM sales
            WHERE (sale_date AT TIME ZONE 'America/Sao_Paulo')::date = $1::date
            ORDER BY sale_date DESC
        `;
        const salesRes = await client.query(salesQuery, [targetDate]);
        const sales = salesRes.rows;

        // Busca Comissões
        const commQuery = `
            SELECT c.id, c.sale_id, c.reference_date, c.commission_amount, c.status, c.user_id,
                   (SELECT first_name || ' ' || last_name FROM users WHERE id = c.user_id) as attendant_name
            FROM commissions c
            WHERE (c.reference_date AT TIME ZONE 'America/Sao_Paulo')::date = $1::date
        `;
        const commRes = await client.query(commQuery, [targetDate]);
        const commissions = commRes.rows;

        // Processamento (Mesma lógica anterior)
        const salesWithComm = sales.filter(s => commissions.some(c => c.sale_id === s.id));
        const missingCommissions = sales.filter(s => !commissions.some(c => c.sale_id === s.id));
        const extraCommissions = commissions.filter(c => !sales.some(s => s.id === c.sale_id));

        console.log(`\nRESUMO GERAL:`);
        console.log(`- Total de Vendas (02/02): ${sales.length}`);
        console.log(`- Total de Comissões (02/02): ${commissions.length}`);
        
        // Listar Comissões encontradas para entender status
        console.log(`\n🔍 DETALHE DAS COMISSÕES ENCONTRADAS:`);
        console.log("ID Venda  | Status Comm | Valor Comm | Atendente (User)       | Data Ref ISO");
        console.log("----------------------------------------------------------------------------------");
        commissions.forEach(c => {
             console.log(`| ${c.sale_id.slice(0,8)} | ${(c.status||'N/A').padEnd(11)} | R$ ${Number(c.commission_amount).toFixed(2).padEnd(8)} | ${(c.attendant_name||c.user_id||'NULL').slice(0,22).padEnd(22)} | ${new Date(c.reference_date).toISOString()}`);
        });

        console.log(`- Vendas COM Comissão: ${salesWithComm.length}`);
        console.log(`- Vendas SEM Comissão: ${missingCommissions.length}`);
        console.log(`- Comissões "Extras" (Venda de outro dia?): ${extraCommissions.length}`);

        console.log(`\n🚨 VENDAS SEM COMISSÃO (${missingCommissions.length}):`);
        
        if (missingCommissions.length > 0) {
            console.log("\nID Venda  | Status     | Tp | Valor      | Motivo Provável");
            console.log("-------------------------------------------------------------------");
            missingCommissions.forEach(sale => {
                let reason = "Desconhecido";
                let type = sale.sale_type_inferred || 'N/A';
                
                if (sale.status === 'cancelado') reason = "Cancelada";
                else if (sale.status === 'estornado') reason = "Estornada";
                else if (!sale.attendant_id) reason = "Sem Atendente";
                else if (type === '02') reason = "Pacote (Sem Comissão)";
                else reason = "Erro/Pendente";

                console.log(`| ${sale.id.slice(0,8)} | ${sale.status.padEnd(10)} | ${type.padEnd(2)} | R$ ${Number(sale.total).toFixed(2).padEnd(8)} | ${reason}`);
            });
        } 

    } catch (e) {
        console.error("ERRO CONEXÃO:", e.message);
    } finally {
        await client.end();
    }
}

runComparison();
