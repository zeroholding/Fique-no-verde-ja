/**
 * Dados de DEMONSTRACAO do painel Tracken.
 *
 * Serve para apresentar o painel (inclusive para a Tracken) sem depender de
 * volume real. Todos os registros usam shipment_id com prefixo "DEMO", entao a
 * remocao e total e nao encosta em nada de verdade.
 *
 * Uso:
 *   $env:DATABASE_URL="postgresql://..."
 *   node scripts/tracken_seed_demo.mjs seed
 *   node scripts/tracken_seed_demo.mjs purge
 *   node scripts/tracken_seed_demo.mjs status
 */

import pg from "pg";

const PREFIX = "DEMO";

/** Proporcao de transportadoras do painel aprovado. */
const CARRIER_MIX = [
  { code: "TM", weight: 92 },
  { code: "J3", weight: 78 },
  { code: "PEX", weight: 53 },
  { code: "TRANSMOTO", weight: 33 },
];

/** Proporcao de status do painel aprovado. */
const STATUS_MIX = [
  { code: "recepcionado", weight: 142 },
  { code: "em_atendimento", weight: 68 },
  { code: "removido", weight: 32 },
  { code: "negado", weight: 14 },
];

const SELLERS = [
  "Loja Top Imports",
  "MegaStore Brasil",
  "Casa & Cia Utilidades",
  "TechPoint Eletronicos",
  "Moda Viva Confeccoes",
  "AutoPecas Prime",
  "Mundo do Bebe",
  "Ferramentas Silva",
  "Beleza Natural Cosmeticos",
  "Games & Cia",
];

const BUYERS = [
  ["JoaoCompras", "Joao da Silva Oliveira"],
  ["MariaS_2024", "Maria Aparecida Souza"],
  ["pedrinho.rj", "Pedro Henrique Alves"],
  ["AnaClara88", "Ana Clara Ferreira Lima"],
  ["carlos_mg", "Carlos Eduardo Rodrigues"],
  ["JulianaP", "Juliana Pereira Santos"],
  ["rafa.sp", "Rafael Augusto Martins"],
  ["FernandaC", "Fernanda Costa Ribeiro"],
  ["lucas_ba", "Lucas Gabriel Nascimento"],
  ["PatriciaM", "Patricia Mendes Barbosa"],
  ["thiago.rs", "Thiago Moreira Cardoso"],
  ["BeatrizL", "Beatriz Lopes Azevedo"],
];

/** Gerador deterministico, para a demo ser sempre igual. */
let seed = 20260825;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

const pick = (list) => list[Math.floor(random() * list.length)];

/**
 * Expande a proporcao em uma lista e embaralha.
 *
 * O embaralhamento importa: sem ele a lista sai em blocos (os primeiros 92
 * seriam todos TM, os primeiros 142 todos "Recepcionado") e o filtro padrao do
 * painel, que mostra apenas hoje, exibiria uma fatia nada representativa.
 */
function expand(mix) {
  const list = mix.flatMap((entry) => Array(entry.weight).fill(entry.code));

  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }

  return list;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      'DATABASE_URL nao definida. Exporte antes:\n  $env:DATABASE_URL="postgresql://..."'
    );
    process.exit(1);
  }
  return new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
  });
}

async function seedDemo() {
  const client = connect();
  await client.connect();

  try {
    const { rows: carriers } = await client.query(
      `SELECT id, code FROM tracken_carriers WHERE is_active = true`
    );
    if (carriers.length === 0) {
      throw new Error("Nenhuma transportadora cadastrada. Rode a migration 019.");
    }
    const carrierByCode = new Map(carriers.map((c) => [c.code, c.id]));

    const { rows: users } = await client.query(
      `SELECT id FROM users WHERE is_active = true ORDER BY created_at LIMIT 5`
    );
    if (users.length === 0) {
      throw new Error("Nenhum usuario ativo para atribuir os atendimentos.");
    }

    const existentes = await client.query(
      `SELECT COUNT(*)::int AS total FROM tracken_tickets
        WHERE shipment_id LIKE '${PREFIX}%'`
    );
    if (existentes.rows[0].total > 0) {
      console.log(
        `Ja existem ${existentes.rows[0].total} registros de demonstracao. Rode "purge" antes de recriar.`
      );
      return;
    }

    const carrierPool = expand(CARRIER_MIX);
    const statusPool = expand(STATUS_MIX);
    const total = statusPool.length; // 256, como no painel aprovado

    const now = Date.now();
    let criados = 0;

    await client.query("BEGIN");

    for (let index = 0; index < total; index += 1) {
      const carrierCode = carrierPool[index];
      const status = statusPool[index];

      // Metade chega hoje (para os KPIs do filtro padrao), o resto se espalha
      // pelos 6 dias anteriores para alimentar o grafico de tendencia.
      const diasAtras = index < 96 ? 0 : 1 + Math.floor(random() * 6);
      const receivedAt = new Date(
        now - diasAtras * DAY - Math.floor(random() * 10 * HOUR)
      );

      // A venda acontece antes de chegar para nos.
      const saleDate = new Date(
        receivedAt.getTime() - (12 + Math.floor(random() * 36)) * HOUR
      );

      // O limite de envio e o campo critico: alguns vencidos, alguns proximos.
      const offsetLimite = [-30, -6, 4, 10, 20, 30, 44, 60][
        Math.floor(random() * 8)
      ];
      const shippingDeadline = new Date(now + offsetLimite * HOUR);

      const isFinal = status === "removido" || status === "negado";
      const isStarted = isFinal || status === "em_atendimento";

      const startedAt = isStarted
        ? new Date(receivedAt.getTime() + (1 + Math.floor(random() * 5)) * HOUR)
        : null;

      // Cerca de 92% dos finalizados dentro do prazo, para o gauge de SLA
      // exibir um numero parecido com a meta.
      let finishedAt = null;
      if (isFinal) {
        const dentroDoPrazo = random() < 0.92;
        finishedAt = dentroDoPrazo
          ? new Date(shippingDeadline.getTime() - (1 + random() * 20) * HOUR)
          : new Date(shippingDeadline.getTime() + (1 + random() * 12) * HOUR);

        if (finishedAt < startedAt) {
          finishedAt = new Date(startedAt.getTime() + 2 * HOUR);
        }
      }

      const [nickname, fullName] = pick(BUYERS);
      const assignedUser = isStarted ? pick(users).id : null;
      const suffix = String(index + 1).padStart(4, "0");

      const inserted = await client.query(
        `INSERT INTO tracken_tickets (
           shipment_id, order_id, carrier_id,
           buyer_nickname, buyer_name, seller_name, seller_ml_id,
           sale_date, shipping_deadline, received_at,
           status, assigned_user_id, started_at, finished_at,
           ml_claim_id, service_type, tracking_number,
           requested_by, payload_raw
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb
         )
         ON CONFLICT (shipment_id) DO NOTHING
         RETURNING id`,
        [
          `${PREFIX}${suffix}${Math.floor(random() * 900000 + 100000)}`,
          `20000${suffix}${Math.floor(random() * 9000000 + 1000000)}`,
          carrierByCode.get(carrierCode),
          nickname,
          fullName,
          pick(SELLERS),
          String(Math.floor(random() * 900000000 + 100000000)),
          saleDate.toISOString(),
          shippingDeadline.toISOString(),
          receivedAt.toISOString(),
          status,
          assignedUser,
          startedAt ? startedAt.toISOString() : null,
          finishedAt ? finishedAt.toISOString() : null,
          isFinal ? `CLAIM-${suffix}` : null,
          "atraso",
          `ML${Math.floor(random() * 900000000 + 100000000)}BR`,
          "demo@tracken.local",
          JSON.stringify({ origem: "seed de demonstracao" }),
        ]
      );

      const ticket = inserted.rows[0];
      if (!ticket) continue;
      criados += 1;

      // Historico coerente com o estado de cada atendimento.
      await client.query(
        `INSERT INTO tracken_ticket_events
           (ticket_id, event_type, to_status, actor_type, note, created_at)
         VALUES ($1, 'received', 'recepcionado', 'tracken', $2, $3)`,
        [ticket.id, "Recebido via API da Tracken", receivedAt.toISOString()]
      );

      if (startedAt) {
        await client.query(
          `INSERT INTO tracken_ticket_events
             (ticket_id, event_type, from_status, to_status,
              actor_type, actor_user_id, created_at)
           VALUES ($1, 'status_changed', 'recepcionado', 'em_atendimento',
                   'user', $2, $3)`,
          [ticket.id, assignedUser, startedAt.toISOString()]
        );
      }

      if (finishedAt) {
        await client.query(
          `INSERT INTO tracken_ticket_events
             (ticket_id, event_type, from_status, to_status,
              actor_type, actor_user_id, note, created_at)
           VALUES ($1, 'status_changed', 'em_atendimento', $2,
                   'user', $3, $4, $5)`,
          [
            ticket.id,
            status,
            assignedUser,
            status === "removido"
              ? "Atraso removido no Mercado Livre"
              : "Mercado Livre negou a remocao",
            finishedAt.toISOString(),
          ]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`\n${criados} atendimentos de demonstracao criados.`);
    await report(client);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function report(client) {
  const { rows: porStatus } = await client.query(
    `SELECT sm.label, COUNT(*)::int AS total
       FROM tracken_tickets t
       JOIN tracken_status_map sm ON sm.code = t.status
      WHERE t.shipment_id LIKE '${PREFIX}%'
      GROUP BY sm.label, sm.sort_order
      ORDER BY sm.sort_order`
  );
  const { rows: porCarrier } = await client.query(
    `SELECT c.code, COUNT(*)::int AS total
       FROM tracken_tickets t
       JOIN tracken_carriers c ON c.id = t.carrier_id
      WHERE t.shipment_id LIKE '${PREFIX}%'
      GROUP BY c.code ORDER BY total DESC`
  );
  const { rows: hoje } = await client.query(
    `SELECT COUNT(*)::int AS total FROM tracken_tickets
      WHERE shipment_id LIKE '${PREFIX}%'
        AND (received_at AT TIME ZONE 'America/Sao_Paulo')::date
          = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`
  );

  console.log("\nPor status:");
  porStatus.forEach((r) => console.log(`  ${r.label.padEnd(16)} ${r.total}`));
  console.log("\nPor transportadora:");
  porCarrier.forEach((r) => console.log(`  ${r.code.padEnd(16)} ${r.total}`));
  console.log(`\nRecebidos hoje: ${hoje[0].total}`);
}

async function purge() {
  const client = connect();
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `DELETE FROM tracken_tickets WHERE shipment_id LIKE '${PREFIX}%'`
    );
    console.log(`${rowCount} atendimentos de demonstracao removidos.`);

    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS total FROM tracken_tickets`
    );
    console.log(`Atendimentos restantes na base: ${rows[0].total}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function status() {
  const client = connect();
  await client.connect();
  try {
    await report(client);
  } finally {
    await client.end().catch(() => {});
  }
}

const command = process.argv[2];

try {
  if (command === "seed") await seedDemo();
  else if (command === "purge") await purge();
  else if (command === "status") await status();
  else {
    console.log("Comandos: seed | purge | status");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Falhou:", error.message ?? error);
  if (error.detail) console.error("Detalhe:", error.detail);
  process.exitCode = 1;
}
