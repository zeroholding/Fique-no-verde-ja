import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/fiquenoverdeja",
});

async function run() {
    try {
        console.log("Adicionando novas colunas na tabela evidence_logs...");
        await pool.query(`
            ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
            ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);
            ALTER TABLE evidence_logs ADD COLUMN IF NOT EXISTS evidence_date DATE;
        `);
        console.log("Tabela atualizada com sucesso.");
    } catch (e) {
        console.error("Erro:", e);
    }
    process.exit(0);
}

run();
