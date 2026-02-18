const fs = require('fs');
const path = require('path');

const file = 'c:\\Users\\Micro\\Desktop\\GIANLUCA TRABALHO\\Fique-no-verde-ja\\backups\\2026-02-18T12-57-34-962Z\\client_packages.json';
const clientId = '06868111-62d1-41cd-8ad0-154e3b23cf53';

try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pkgs = data.filter(p => p.client_id === clientId);
    console.log(`Found ${pkgs.length} packages for client ${clientId}:`);
    console.log(JSON.stringify(pkgs, null, 2));
} catch (e) {
    console.error(e);
}
