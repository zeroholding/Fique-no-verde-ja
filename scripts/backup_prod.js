
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Config
const DB_CONNECTION = "postgresql://postgres:AprFcG9XCYwflSyN3mXQld7sPVvuvcHAYZIqfhGdt5ax6Jt2yW8UYKtUk05tdFIA@72.61.62.227:5434/postgres";
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_FILE = path.join(__dirname, `../backups/prod_backup_${TIMESTAMP}.sql`);
const BACKUP_DIR = path.join(__dirname, '../backups');

if (!fs.existsSync(BACKUP_DIR)){
    fs.mkdirSync(BACKUP_DIR);
}

console.log(`Iniciando Backup do Banco de Dados (Prod 5434)...`);
console.log(`Arquivo alvo: ${BACKUP_FILE}`);

// Note: Requires pg_dump installed in system path. If not, this might fail.
// We'll assume the environment has it or we can't do binary backup easily.
// Windows usually needs explicit path, but let's try 'pg_dump' first.
// If this fails, we might just have to trust the Node scripts data extraction, but full dump is better.

const cmd = `pg_dump "${DB_CONNECTION}" -F c -b -v -f "${BACKUP_FILE}"`;

exec(cmd, (error, stdout, stderr) => {
    if (error) {
        console.error(`Erro no backup: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`Log do pg_dump: ${stderr}`);
    }
    console.log(`Backup concluído com sucesso: ${BACKUP_FILE}`);
});
