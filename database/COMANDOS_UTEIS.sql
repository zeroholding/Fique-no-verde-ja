-- ================================================================================
-- COMANDOS ÚTEIS - BANCO DE DADOS FQNJ
-- ================================================================================
-- Este arquivo contém comandos SQL úteis para administração e manutenção
-- ================================================================================

-- ================================================================================
-- VERIFICAÇÕES E CONSULTAS
-- ================================================================================

-- Ver todas as tabelas do banco
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Ver estrutura de uma tabela
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;

-- Contar registros em todas as tabelas
SELECT
    'users' as tabela,
    COUNT(*) as total
FROM users
UNION ALL
SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL
SELECT 'client_origins', COUNT(*) FROM client_origins
UNION ALL
SELECT 'clients', COUNT(*) FROM clients;

-- ================================================================================
-- GESTÃO DE USUÁRIOS
-- ================================================================================

-- Ver todos os usuários
SELECT
    id,
    first_name || ' ' || last_name as nome_completo,
    email,
    phone,
    is_admin,
    is_active,
    created_at
FROM users
ORDER BY created_at DESC;

-- Tornar um usuário administrador
UPDATE users
SET is_admin = true
WHERE email = 'seu-email@exemplo.com';

-- Ver apenas administradores
SELECT
    first_name || ' ' || last_name as nome,
    email,
    created_at
FROM users
WHERE is_admin = true;

-- Ativar/Desativar um usuário
UPDATE users SET is_active = false WHERE email = 'usuario@exemplo.com';
UPDATE users SET is_active = true WHERE email = 'usuario@exemplo.com';

-- ================================================================================
-- GESTÃO DE ORIGENS
-- ================================================================================

-- Listar todas as origens
SELECT
    id,
    name,
    description,
    is_active,
    created_at
FROM client_origins
ORDER BY name;

-- Ver quantos clientes tem cada origem
SELECT
    co.name as origem,
    COUNT(c.id) as total_clientes
FROM client_origins co
LEFT JOIN clients c ON c.origin_id = co.id
GROUP BY co.id, co.name
ORDER BY total_clientes DESC;

-- Adicionar nova origem
INSERT INTO client_origins (name, description)
VALUES ('Nova Origem', 'Descrição da origem');

-- Desativar uma origem
UPDATE client_origins
SET is_active = false
WHERE name = 'Nome da Origem';

-- ================================================================================
-- GESTÃO DE CLIENTES
-- ================================================================================

-- Listar todos os clientes com suas origens
SELECT
    c.id,
    c.name,
    c.phone,
    c.email,
    c.cpf_cnpj,
    c.birth_date,
    co.name as origem,
    c.created_at
FROM clients c
LEFT JOIN client_origins co ON c.origin_id = co.id
ORDER BY c.created_at DESC;

-- Buscar cliente por nome
SELECT
    c.name,
    c.phone,
    c.email,
    co.name as origem
FROM clients c
LEFT JOIN client_origins co ON c.origin_id = co.id
WHERE c.name ILIKE '%parte do nome%';

-- Buscar cliente por telefone
SELECT
    c.name,
    c.phone,
    c.email,
    co.name as origem
FROM clients c
LEFT JOIN client_origins co ON c.origin_id = co.id
WHERE c.phone LIKE '%99999%';

-- Buscar cliente por CPF/CNPJ
SELECT
    c.name,
    c.phone,
    c.email,
    c.cpf_cnpj
FROM clients c
WHERE c.cpf_cnpj = '123.456.789-00';

-- Clientes por mês de cadastro
SELECT
    TO_CHAR(created_at, 'YYYY-MM') as mes,
    COUNT(*) as total_clientes
FROM clients
GROUP BY mes
ORDER BY mes DESC;

-- Clientes aniversariantes do mês atual
SELECT
    name,
    phone,
    email,
    birth_date,
    EXTRACT(YEAR FROM AGE(birth_date)) as idade
FROM clients
WHERE EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
ORDER BY EXTRACT(DAY FROM birth_date);

-- ================================================================================
-- ESTATÍSTICAS E RELATÓRIOS
-- ================================================================================

-- Dashboard de estatísticas gerais
SELECT
    (SELECT COUNT(*) FROM users) as total_usuarios,
    (SELECT COUNT(*) FROM users WHERE is_admin = true) as total_admins,
    (SELECT COUNT(*) FROM clients) as total_clientes,
    (SELECT COUNT(*) FROM client_origins) as total_origens;

-- Origem mais comum
SELECT
    co.name as origem,
    COUNT(c.id) as total_clientes,
    ROUND(COUNT(c.id)::numeric / NULLIF((SELECT COUNT(*) FROM clients), 0) * 100, 2) as percentual
FROM client_origins co
LEFT JOIN clients c ON c.origin_id = co.id
GROUP BY co.name
ORDER BY total_clientes DESC
LIMIT 5;

-- Clientes cadastrados nos últimos 30 dias
SELECT
    name,
    phone,
    email,
    created_at
FROM clients
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY created_at DESC;

-- Média de idade dos clientes
SELECT
    ROUND(AVG(EXTRACT(YEAR FROM AGE(birth_date))), 1) as idade_media,
    MIN(EXTRACT(YEAR FROM AGE(birth_date))) as idade_minima,
    MAX(EXTRACT(YEAR FROM AGE(birth_date))) as idade_maxima
FROM clients
WHERE birth_date IS NOT NULL;

-- ================================================================================
-- LIMPEZA E MANUTENÇÃO
-- ================================================================================

-- Ver sessões expiradas
SELECT
    s.id,
    u.email,
    s.created_at,
    s.expires_at
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.expires_at < CURRENT_TIMESTAMP;

-- Limpar sessões expiradas
DELETE FROM sessions
WHERE expires_at < CURRENT_TIMESTAMP;

-- Ver clientes sem origem definida
SELECT
    name,
    phone,
    email,
    created_at
FROM clients
WHERE origin_id IS NULL;

-- Ver clientes sem dados de contato
SELECT
    name,
    created_at
FROM clients
WHERE phone IS NULL AND email IS NULL;

-- ================================================================================
-- BACKUP E EXPORTAÇÃO
-- ================================================================================

-- Exportar clientes para CSV (copie o resultado)
COPY (
    SELECT
        c.name,
        c.phone,
        c.email,
        c.cpf_cnpj,
        c.birth_date,
        co.name as origem,
        c.created_at
    FROM clients c
    LEFT JOIN client_origins co ON c.origin_id = co.id
    ORDER BY c.created_at DESC
) TO 'C:/temp/clientes.csv' WITH CSV HEADER;

-- ================================================================================
-- RESET COMPLETO (USE COM CUIDADO!)
-- ================================================================================

-- ATENÇÃO: Estes comandos deletam TODOS OS DADOS!
-- Remova os comentários apenas se tiver certeza!

-- Deletar todos os clientes
-- DELETE FROM clients;

-- Deletar todas as origens (vai falhar se houver clientes vinculados)
-- DELETE FROM client_origins;

-- Resetar sequências (se necessário)
-- ALTER SEQUENCE IF EXISTS clients_id_seq RESTART WITH 1;

-- ================================================================================
-- QUERIES DE DESENVOLVIMENTO
-- ================================================================================

-- Ver último cliente cadastrado
SELECT
    c.name,
    c.phone,
    c.email,
    co.name as origem,
    u.first_name || ' ' || u.last_name as cadastrado_por,
    c.created_at
FROM clients c
LEFT JOIN client_origins co ON c.origin_id = co.id
LEFT JOIN users u ON c.created_by_user_id = u.id
ORDER BY c.created_at DESC
LIMIT 1;

-- Ver quem cadastrou mais clientes
SELECT
    u.first_name || ' ' || u.last_name as usuario,
    u.email,
    COUNT(c.id) as total_clientes_cadastrados
FROM users u
LEFT JOIN clients c ON c.created_by_user_id = u.id
WHERE u.is_admin = true
GROUP BY u.id, u.first_name, u.last_name, u.email
ORDER BY total_clientes_cadastrados DESC;

-- Ver últimas 10 atividades (clientes cadastrados)
SELECT
    'Cliente cadastrado: ' || c.name as atividade,
    u.first_name || ' ' || u.last_name as usuario,
    c.created_at as data_hora
FROM clients c
LEFT JOIN users u ON c.created_by_user_id = u.id
ORDER BY c.created_at DESC
LIMIT 10;

-- ================================================================================
-- FIM DOS COMANDOS ÚTEIS
-- ================================================================================
