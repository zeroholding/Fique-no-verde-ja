import { createClient } from "@supabase/supabase-js";

// Configuração do cliente Supabase (para uso público/client-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente admin com service_role key (para uso server-side com bypass de RLS)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseServiceKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Controle de transações (simulado, pois Supabase RPC não suporta BEGIN/COMMIT/ROLLBACK)
let transactionQueries: string[] = [];
let inTransaction = false;

// Função query compatível com PostgreSQL para executar SQL raw via Supabase
export async function query<T = any>(text: string, params?: any[]) {
  try {
    const trimmedText = text.trim().toUpperCase();

    // Lidar com comandos de transação
    if (trimmedText === 'BEGIN') {
      inTransaction = true;
      transactionQueries = [];
      console.log('[TRANSACTION] BEGIN - Iniciando transação simulada');
      return { rows: [], rowCount: 0 };
    }

    if (trimmedText === 'COMMIT') {
      inTransaction = false;
      transactionQueries = [];
      console.log('[TRANSACTION] COMMIT - Finalizando transação simulada');
      return { rows: [], rowCount: 0 };
    }

    if (trimmedText === 'ROLLBACK') {
      inTransaction = false;
      transactionQueries = [];
      console.log('[TRANSACTION] ROLLBACK - Revertendo transação simulada');
      // Nota: Em uma implementação real, você precisaria reverter as mudanças
      // Como estamos usando Supabase RPC, não podemos reverter queries já executadas
      return { rows: [], rowCount: 0 };
    }

    // Substitui placeholders $1, $2, etc. pelos valores reais
    let processedText = text;
    if (params && params.length > 0) {
      // Substitui placeholders do maior para o menor para evitar conflito ($1 dentro de $10)
      for (let index = params.length - 1; index >= 0; index--) {
        const placeholder = `$${index + 1}`;
        const param = params[index];
        let value: string;

        if (param === null || param === undefined) {
          value = 'NULL';
        } else if (typeof param === 'string') {
          value = `'${param.replace(/'/g, "''")}'`;
        } else if (typeof param === 'number' || typeof param === 'boolean') {
          value = String(param);
        } else if (Array.isArray(param)) {
          value = `ARRAY[${param.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(',')}]`;
        } else {
          value = `'${JSON.stringify(param).replace(/'/g, "''")}'`;
        }

        processedText = processedText.replaceAll(placeholder, value);
      }
    }

    if (inTransaction) {
      transactionQueries.push(processedText);
    }

    // Remove quebras de linha e espaços extras que podem quebrar a RPC
    const sanitizedText = processedText.replace(/\s+/g, ' ').trim();

    // Executa a query usando o Supabase RPC
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      query: sanitizedText
    });

    if (error) {
      throw error;
    }

    // Retorna no formato compatível com pg (node-postgres)
    return {
      rows: data || [],
      rowCount: data?.length || 0
    };
  } catch (error) {
    console.error("Erro na query:", { text, params, error });
    throw error;
  }
}

export default supabase;
