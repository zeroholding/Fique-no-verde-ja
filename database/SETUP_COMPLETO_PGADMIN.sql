-- ================================================================================
-- SETUP COMPLETO DO BANCO DE DADOS FQNJ
-- ================================================================================
-- Este arquivo contÃ©m TODOS os comandos SQL necessÃ¡rios para criar o banco
-- de dados completo do sistema FQNJ, incluindo:
-- - Banco de dados
-- - ExtensÃµes
-- - Tabelas de usuÃ¡rios
-- - Tabelas de sessÃµes
-- - Tabelas de clientes e origens
-- - Ãndices e triggers
-- - Dados iniciais
-- ================================================================================

-- PASSO 1: Criar o banco de dados (execute este comando no banco postgres)
-- ================================================================================
-- IMPORTANTE: Execute este comando conectado ao banco "postgres" primeiro!
-- Depois conecte-se ao banco "fqnj_db" para executar o restante

CREATE DATABASE fqnj_db;

-- ================================================================================
-- PASSO 2: Conecte-se ao banco fqnj_db e execute os comandos abaixo
-- ================================================================================

-- ExtensÃ£o para gerar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================================
-- TABELAS PRINCIPAIS
-- ================================================================================

-- Tabela de usuÃ¡rios
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    created_by_admin BOOLEAN DEFAULT false,
    admin_generated_password TEXT
);

-- Tabela de sessÃµes (opcional, para controle de tokens)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Tabela de origens de clientes
CREATE TABLE IF NOT EXISTS client_origins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    birth_date DATE,
    email VARCHAR(255),
    cpf_cnpj VARCHAR(18),
    origin_id UUID REFERENCES client_origins(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ================================================================================
-- ÃNDICES PARA MELHOR PERFORMANCE
-- ================================================================================

-- Ãndices para users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- Ãndices para sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Ãndices para client_origins
CREATE INDEX IF NOT EXISTS idx_client_origins_name ON client_origins(name);
CREATE INDEX IF NOT EXISTS idx_client_origins_is_active ON client_origins(is_active);

-- Ãndices para clients
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_cpf_cnpj ON clients(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_clients_origin_id ON clients(origin_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by_user_id ON clients(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients(is_active);

-- ================================================================================
-- FUNÃ‡Ã•ES E TRIGGERS
-- ================================================================================

-- FunÃ§Ã£o para atualizar o updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para atualizar updated_at na tabela users
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para atualizar updated_at na tabela client_origins
CREATE TRIGGER update_client_origins_updated_at
    BEFORE UPDATE ON client_origins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para atualizar updated_at na tabela clients
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ================================================================================
-- COMENTÃRIOS NAS TABELAS E COLUNAS
-- ================================================================================

-- ComentÃ¡rios nas tabelas
COMMENT ON TABLE users IS 'Tabela de usuÃ¡rios do sistema';
COMMENT ON TABLE sessions IS 'Tabela de sessÃµes e tokens de autenticaÃ§Ã£o';
COMMENT ON TABLE client_origins IS 'Tabela de origens/fontes de clientes (IndicaÃ§Ã£o, Redes Sociais, etc)';
COMMENT ON TABLE clients IS 'Tabela de clientes do sistema';

-- ComentÃ¡rios da tabela users
COMMENT ON COLUMN users.id IS 'ID Ãºnico do usuÃ¡rio (UUID)';
COMMENT ON COLUMN users.first_name IS 'Primeiro nome do usuÃ¡rio';
COMMENT ON COLUMN users.last_name IS 'Sobrenome do usuÃ¡rio';
COMMENT ON COLUMN users.email IS 'Email Ãºnico do usuÃ¡rio';
COMMENT ON COLUMN users.phone IS 'Telefone formatado do usuÃ¡rio';
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt da senha';
COMMENT ON COLUMN users.is_active IS 'Indica se o usuÃ¡rio estÃ¡ ativo';
COMMENT ON COLUMN users.is_admin IS 'Indica se o usuÃ¡rio possui privilÃ©gios administrativos';
COMMENT ON COLUMN users.created_by_admin IS 'Indica se a conta foi criada a partir do painel administrativo';
COMMENT ON COLUMN users.admin_generated_password IS 'Senha de provisionamento criada via painel admin';

-- ComentÃ¡rios da tabela client_origins
COMMENT ON COLUMN client_origins.id IS 'ID Ãºnico da origem (UUID)';
COMMENT ON COLUMN client_origins.name IS 'Nome da origem (ex: Instagram, IndicaÃ§Ã£o, Google)';
COMMENT ON COLUMN client_origins.description IS 'DescriÃ§Ã£o detalhada da origem';
COMMENT ON COLUMN client_origins.is_active IS 'Indica se a origem estÃ¡ ativa';

-- ComentÃ¡rios da tabela clients
COMMENT ON COLUMN clients.id IS 'ID Ãºnico do cliente (UUID)';
COMMENT ON COLUMN clients.name IS 'Nome completo do cliente';
COMMENT ON COLUMN clients.phone IS 'Telefone do cliente';
COMMENT ON COLUMN clients.birth_date IS 'Data de nascimento do cliente';
COMMENT ON COLUMN clients.email IS 'Email do cliente';
COMMENT ON COLUMN clients.cpf_cnpj IS 'CPF ou CNPJ do cliente';
COMMENT ON COLUMN clients.origin_id IS 'ID da origem do cliente';
COMMENT ON COLUMN clients.is_active IS 'Indica se o cliente estÃ¡ ativo';
COMMENT ON COLUMN clients.created_by_user_id IS 'ID do usuÃ¡rio que cadastrou o cliente';

-- ================================================================================
-- DADOS INICIAIS
-- ================================================================================

-- Inserir origens padrÃ£o
INSERT INTO client_origins (name, description) VALUES
    ('Instagram', 'Cliente veio atravÃ©s do Instagram'),
    ('Facebook', 'Cliente veio atravÃ©s do Facebook'),
    ('IndicaÃ§Ã£o', 'Cliente foi indicado por outro cliente'),
    ('Google', 'Cliente encontrou atravÃ©s de busca no Google'),
    ('WhatsApp', 'Cliente entrou em contato via WhatsApp'),
    ('Site', 'Cliente entrou em contato pelo site'),
    ('LinkedIn', 'Cliente veio atravÃ©s do LinkedIn'),
    ('TikTok', 'Cliente veio atravÃ©s do TikTok'),
    ('Youtube', 'Cliente veio atravÃ©s do Youtube'),
    ('Outdoor', 'Cliente viu outdoor ou propaganda fÃ­sica'),
    ('Panfleto', 'Cliente recebeu panfleto'),
    ('Evento', 'Cliente conheceu em algum evento')
ON CONFLICT (name) DO NOTHING;

-- ================================================================================
-- VERIFICAÃ‡ÃƒO FINAL
-- ================================================================================

-- Verificar se as tabelas foram criadas corretamente
SELECT
    'Tabelas criadas com sucesso!' as status,
    (SELECT COUNT(*) FROM users) as total_usuarios,
    (SELECT COUNT(*) FROM client_origins) as total_origens,
    (SELECT COUNT(*) FROM clients) as total_clientes;

-- Listar todas as origens cadastradas
SELECT id, name, description, is_active, created_at
FROM client_origins
ORDER BY name;

-- ================================================================================
-- SETUP CONCLUÃDO!
-- ================================================================================
-- Agora vocÃª pode:
-- 1. Criar seu primeiro usuÃ¡rio admin atravÃ©s da aplicaÃ§Ã£o
-- 2. Fazer login e acessar o painel administrativo
-- 3. Cadastrar clientes e gerenciar origens
-- ================================================================================

-- Tabela de servicos
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    sla VARCHAR(120) NOT NULL,
    highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active);

CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE services IS 'Catalogo de servicos oferecidos';
COMMENT ON COLUMN services.name IS 'Nome amigavel do servico';
COMMENT ON COLUMN services.base_price IS 'Valor base sugerido do servico';
COMMENT ON COLUMN services.sla IS 'Prazo esperado de atendimento';
COMMENT ON COLUMN services.highlights IS 'Lista de diferenciais do servico';

INSERT INTO services (name, description, base_price, sla, highlights)
VALUES
    (
        'Reclamacao',
        'Atendimento completo para relatos formais de clientes, com investigacao e retorno documentado.',
        0,
        'Ate 3 dias uteis',
        '[''Checklist completo de validacao'',''Garante retorno em ate 72h'',''Recomendado para casos sensiveis'']'::jsonb
    ),
    (
        'Atraso',
        'Tratativa padrao para pedidos ou entregas que extrapolaram o prazo combinado.',
        0,
        'Ate 48 horas',
        '[''Monitoramento diario'',''Comunicacao ativa com o cliente'',''Foco em regularizar fluxos logisticos'']'::jsonb
    )
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS service_price_ranges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    sale_type VARCHAR(2) NOT NULL DEFAULT '01',
    min_quantity INTEGER NOT NULL DEFAULT 1,
    max_quantity INTEGER,
    unit_price NUMERIC(12,2) NOT NULL,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_price_ranges_service_id ON service_price_ranges(service_id);
CREATE INDEX IF NOT EXISTS idx_service_price_ranges_sale_type ON service_price_ranges(sale_type);

COMMENT ON TABLE service_price_ranges IS 'Faixas de preco por servico';
COMMENT ON COLUMN service_price_ranges.sale_type IS 'Tipo de venda (01-Comum, 02-Pacote)';
COMMENT ON COLUMN service_price_ranges.min_quantity IS 'Quantidade minima';
COMMENT ON COLUMN service_price_ranges.max_quantity IS 'Quantidade maxima (NULL = sem limite)';
COMMENT ON COLUMN service_price_ranges.unit_price IS 'Valor unitario aplicado na faixa';
COMMENT ON COLUMN service_price_ranges.effective_from IS 'Data de vigencia do preco';

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT s.id, '01', 1, 10, 40, CURRENT_DATE
FROM services s
WHERE s.name = 'Reclamacao'
  AND NOT EXISTS (
    SELECT 1 FROM service_price_ranges r
    WHERE r.service_id = s.id AND r.sale_type = '01' AND r.min_quantity = 1 AND r.max_quantity = 10
  );

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT s.id, '01', 11, NULL, 15, CURRENT_DATE
FROM services s
WHERE s.name = 'Reclamacao'
  AND NOT EXISTS (
    SELECT 1 FROM service_price_ranges r
    WHERE r.service_id = s.id AND r.sale_type = '01' AND r.min_quantity = 11 AND r.max_quantity IS NULL
  );

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT s.id, '01', 1, 10, 30, CURRENT_DATE
FROM services s
WHERE s.name = 'Atraso'
  AND NOT EXISTS (
    SELECT 1 FROM service_price_ranges r
    WHERE r.service_id = s.id AND r.sale_type = '01' AND r.min_quantity = 1 AND r.max_quantity = 10
  );

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT s.id, '01', 11, 20, 20, CURRENT_DATE
FROM services s
WHERE s.name = 'Atraso'
  AND NOT EXISTS (
    SELECT 1 FROM service_price_ranges r
    WHERE r.service_id = s.id AND r.sale_type = '01' AND r.min_quantity = 11 AND r.max_quantity = 20
  );

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT s.id, '01', 21, NULL, 15, CURRENT_DATE
FROM services s
WHERE s.name = 'Atraso'
  AND NOT EXISTS (
    SELECT 1 FROM service_price_ranges r
    WHERE r.service_id = s.id AND r.sale_type = '01' AND r.min_quantity = 21 AND r.max_quantity IS NULL
  );
