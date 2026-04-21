import { Client } from 'pg';
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/mercadolivre_delays' }); // Wait, is it this DB name? In FQN it's usually local. What's the ENV?
// Let's just import their db config.
