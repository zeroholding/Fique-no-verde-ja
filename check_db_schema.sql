-- Script para listar todas as TABELAS e COLUNAS do banco de dados
-- Rode isso no Supabase SQL Editor para vermos a estrutura atual

SELECT 
    t.table_name AS tabela,
    c.column_name AS coluna,
    c.data_type AS tipo_dado,
    c.is_nullable AS aceita_nulo
FROM 
    information_schema.tables t
JOIN 
    information_schema.columns c ON t.table_name = c.table_name 
    AND t.table_schema = c.table_schema
WHERE 
    t.table_schema = 'public'
ORDER BY 
    t.table_name, 
    c.ordinal_position;
