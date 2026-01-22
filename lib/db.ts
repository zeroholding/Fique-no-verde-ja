import { Pool, PoolClient } from "pg";

// Configuração do pool de conexões PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro no pool:', err);
});

let transactionClient: PoolClient | null = null;

// Função query principal
export async function query<T = any>(text: string, params?: any[]) {
  const trimmedText = text.trim().toUpperCase();

  if (trimmedText === 'BEGIN') {
    transactionClient = await pool.connect();
    await transactionClient.query('BEGIN');
    return { rows: [], rowCount: 0 };
  }

  if (trimmedText === 'COMMIT') {
    if (transactionClient) {
      await transactionClient.query('COMMIT');
      transactionClient.release();
      transactionClient = null;
    }
    return { rows: [], rowCount: 0 };
  }

  if (trimmedText === 'ROLLBACK') {
    if (transactionClient) {
      await transactionClient.query('ROLLBACK');
      transactionClient.release();
      transactionClient = null;
    }
    return { rows: [], rowCount: 0 };
  }

  try {
    const client = transactionClient || pool;
    const result = await client.query(text, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount || 0
    };
  } catch (error) {
    console.error("[DB] Erro:", { sql: text.substring(0, 100), error });
    
    // Se estiver em transação, faz rollback automático para evitar erro 25P02
    if (transactionClient) {
      try {
        await transactionClient.query('ROLLBACK');
        transactionClient.release();
        transactionClient = null;
        console.log("[DB] Auto-rollback executado após erro em transação");
      } catch (rollbackError) {
        console.error("[DB] Erro no rollback:", rollbackError);
      }
    }
    
    throw error;
  }
}

export async function closePool() {
  await pool.end();
}

export { pool };

// ============================================
// Mock do Supabase Client com suporte a chaining
// ============================================

interface QueryBuilder {
  _table: string;
  _selectCols: string;
  _whereClauses: string[];
  _whereParams: any[];
  _orderBy: string | null;
  _limit: number | null;
  _single: boolean;
}

function createQueryBuilder(table: string): any {
  const state: QueryBuilder = {
    _table: table,
    _selectCols: '*',
    _whereClauses: [],
    _whereParams: [],
    _orderBy: null,
    _limit: null,
    _single: false
  };

  const builder: any = {
    select: (cols: string = '*') => {
      state._selectCols = cols;
      return builder;
    },
    eq: (col: string, val: any) => {
      state._whereClauses.push(`"${col}" = $${state._whereParams.length + 1}`);
      state._whereParams.push(val);
      return builder;
    },
    neq: (col: string, val: any) => {
      state._whereClauses.push(`"${col}" != $${state._whereParams.length + 1}`);
      state._whereParams.push(val);
      return builder;
    },
    gt: (col: string, val: any) => {
      state._whereClauses.push(`"${col}" > $${state._whereParams.length + 1}`);
      state._whereParams.push(val);
      return builder;
    },
    gte: (col: string, val: any) => {
      state._whereClauses.push(`"${col}" >= $${state._whereParams.length + 1}`);
      state._whereParams.push(val);
      return builder;
    },
    lt: (col: string, val: any) => {
      state._whereClauses.push(`"${col}" < $${state._whereParams.length + 1}`);
      state._whereParams.push(val);
      return builder;
    },
    lte: (col: string, val: any) => {
      state._whereClauses.push(`"${col}" <= $${state._whereParams.length + 1}`);
      state._whereParams.push(val);
      return builder;
    },
    ilike: (col: string, val: any) => {
      state._whereClauses.push(`"${col}" ILIKE $${state._whereParams.length + 1}`);
      state._whereParams.push(val);
      return builder;
    },
    is: (col: string, val: any) => {
      if (val === null) {
        state._whereClauses.push(`"${col}" IS NULL`);
      } else {
        state._whereClauses.push(`"${col}" IS $${state._whereParams.length + 1}`);
        state._whereParams.push(val);
      }
      return builder;
    },
    in: (col: string, vals: any[]) => {
      const placeholders = vals.map((_, i) => `$${state._whereParams.length + i + 1}`).join(', ');
      state._whereClauses.push(`"${col}" IN (${placeholders})`);
      state._whereParams.push(...vals);
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      const dir = opts?.ascending === false ? 'DESC' : 'ASC';
      state._orderBy = `"${col}" ${dir}`;
      return builder;
    },
    limit: (n: number) => {
      state._limit = n;
      return builder;
    },
    single: () => {
      state._single = true;
      state._limit = 1;
      return builder;
    },
    maybeSingle: () => {
      state._single = true;
      state._limit = 1;
      return builder;
    },
    then: async (resolve: any, reject?: any) => {
      try {
        let sql = `SELECT ${state._selectCols} FROM "${state._table}"`;
        if (state._whereClauses.length > 0) {
          sql += ` WHERE ${state._whereClauses.join(' AND ')}`;
        }
        if (state._orderBy) sql += ` ORDER BY ${state._orderBy}`;
        if (state._limit) sql += ` LIMIT ${state._limit}`;

        const result = await query(sql, state._whereParams);
        const data = state._single ? (result.rows[0] || null) : result.rows;
        resolve({ data, error: null });
      } catch (error) {
        if (reject) reject(error);
        else resolve({ data: null, error });
      }
    }
  };

  return builder;
}

function createInsertBuilder(table: string, data: any | any[]): any {
  const rows = Array.isArray(data) ? data : [data];
  
  const builder: any = {
    select: () => builder,
    single: () => builder,
    then: async (resolve: any, reject?: any) => {
      try {
        const results: any[] = [];
        for (const row of rows) {
          const cols = Object.keys(row).map(k => `"${k}"`).join(', ');
          const vals = Object.values(row);
          const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
          const result = await query(
            `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *`,
            vals
          );
          results.push(result.rows[0]);
        }
        resolve({ data: rows.length === 1 ? results[0] : results, error: null });
      } catch (error) {
        if (reject) reject(error);
        else resolve({ data: null, error });
      }
    }
  };
  return builder;
}

function createUpdateBuilder(table: string, data: any): any {
  const state = {
    whereClauses: [] as string[],
    whereParams: [] as any[],
    data
  };

  const builder: any = {
    eq: (col: string, val: any) => {
      state.whereClauses.push(`"${col}" = $${Object.keys(state.data).length + state.whereParams.length + 1}`);
      state.whereParams.push(val);
      return builder;
    },
    select: () => builder,
    single: () => builder,
    then: async (resolve: any, reject?: any) => {
      try {
        const setClauses = Object.keys(state.data).map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const params = [...Object.values(state.data), ...state.whereParams];
        let sql = `UPDATE "${table}" SET ${setClauses}`;
        if (state.whereClauses.length > 0) {
          sql += ` WHERE ${state.whereClauses.join(' AND ')}`;
        }
        sql += ' RETURNING *';
        const result = await query(sql, params);
        resolve({ data: result.rows, error: null });
      } catch (error) {
        if (reject) reject(error);
        else resolve({ data: null, error });
      }
    }
  };
  return builder;
}

function createDeleteBuilder(table: string): any {
  const state = {
    whereClauses: [] as string[],
    whereParams: [] as any[]
  };

  const builder: any = {
    eq: (col: string, val: any) => {
      state.whereClauses.push(`"${col}" = $${state.whereParams.length + 1}`);
      state.whereParams.push(val);
      return builder;
    },
    then: async (resolve: any, reject?: any) => {
      try {
        let sql = `DELETE FROM "${table}"`;
        if (state.whereClauses.length > 0) {
          sql += ` WHERE ${state.whereClauses.join(' AND ')}`;
        }
        sql += ' RETURNING *';
        const result = await query(sql, state.whereParams);
        resolve({ data: result.rows, error: null });
      } catch (error) {
        if (reject) reject(error);
        else resolve({ data: null, error });
      }
    }
  };
  return builder;
}

export const supabaseAdmin = {
  from: (table: string) => ({
    select: (cols?: string) => createQueryBuilder(table).select(cols || '*'),
    insert: (data: any) => createInsertBuilder(table, data),
    update: (data: any) => createUpdateBuilder(table, data),
    delete: () => createDeleteBuilder(table),
    upsert: (data: any) => createInsertBuilder(table, data) // Simplificado
  }),
  rpc: async (funcName: string, params: any) => {
    if (funcName === 'exec_sql' && params?.query) {
      try {
        const result = await query(params.query);
        return { data: result.rows, error: null };
      } catch (error) {
        return { data: null, error };
      }
    }
    return { data: null, error: new Error(`RPC ${funcName} não suportada`) };
  }
};

export const supabase = supabaseAdmin;
export default supabase;
