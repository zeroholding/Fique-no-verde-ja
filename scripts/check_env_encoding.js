const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
console.log("Checking:", envPath);

if (fs.existsSync(envPath)) {
    const buffer = fs.readFileSync(envPath);
    console.log("Buffer Length:", buffer.length);
    console.log("First 4 bytes:", buffer.slice(0, 4));
    
    // Try utf8
    console.log("\n--- UTF-8 ---");
    console.log(buffer.toString('utf8').substring(0, 50));

    // Try utf16le
    console.log("\n--- UTF-16LE ---");
    console.log(buffer.toString('utf16le').substring(0, 50));
} else {
    console.log("File not found");
}
