-- COPIE E COLE ESTE CÓDIGO NO "SQL EDITOR" DO SUPABASE
-- E CLIQUE EM "RUN".

-- 1. Remove a função antiga (necessário para mudar o tipo de retorno)
DROP FUNCTION IF EXISTS exec_sql(text);

-- 2. Cria a nova função corrigida
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Tenta executar como uma query que retorna dados (SELECT ou INSERT...RETURNING)
  BEGIN
    EXECUTE 'WITH q AS (' || query || ') SELECT jsonb_agg(q) FROM q' INTO result;
    RETURN COALESCE(result, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    -- Se falhar (ex: INSERT simples sem retorno), executa o comando puro
    EXECUTE query;
    RETURN '[]'::jsonb;
  END;
END;
$$;
