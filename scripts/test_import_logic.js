const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

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

(async () => {
  // Fetch users
  const { data: usersData } = await supabase.from('users').select('id, first_name, last_name, email');
  console.log(`Users loaded: ${usersData.length}`);
  const userMap = new Map();
  usersData.forEach(u => {
      const fullName = `${u.first_name} ${u.last_name || ''}`.trim();
      const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
      userMap.set(normalize(u.first_name), u.id);
      userMap.set(normalize(fullName), u.id);
  });

  const normalize = (str) => str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

  // Fetch client
  const { data: clients } = await supabase.from('clients').select('id, name');
  const clientMap = new Map();
  clients.forEach(c => clientMap.set(normalize(c.name), c.id));
  
  const clientName = 'BOX7 CLAYTON';
  const clientId = clientMap.get(normalize(clientName));
  console.log(`Client '${clientName}' ID: ${clientId}`);
  
  // Debug: print similar keys
  for (const key of clientMap.keys()) {
      if (key.includes('box')) {
          console.log(`Map Key: '${key}' -> ID: ${clientMap.get(key)}`);
      }
  }

  // Attendant Logic
  const emailMap = {
      "ANA SANTOS": "ana@gmail.com",
  };
  const attendantStr = "Ana Santos";
  const attendantKey = attendantStr.toUpperCase().trim();
  let attendantEmail = emailMap[attendantKey];
  console.log(`Attendant Email mapped: ${attendantEmail}`);
  
  let attendantId = null;
  if (attendantEmail) {
      const user = usersData.find(u => u.email === attendantEmail);
      if (user) {
          attendantId = user.id;
          console.log(`Found user by email: ${user.email} -> ${user.id}`);
      } else {
          console.log(`User with email ${attendantEmail} NOT FOUND in usersData.`);
      }
  }

  // Fallback
  let finalAttendantId = attendantId;
  if (!finalAttendantId) {
       finalAttendantId = usersData[0]?.id;
       console.log(`Fallback to first user: ${finalAttendantId}`);
  }
  
  if (!clientId) console.error("Client not found!");
  if (!finalAttendantId) console.error("No attendant found!");
})();
