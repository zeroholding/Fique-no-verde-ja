-- Migração: Adicionar tabelas de clientes e origens
-- Data: 2025-11-06
-- Descrição: Criação das tabelas client_origins e clients para gerenciamento de clientes

-- Tabela de origens de clientes
CREATE TABLE IF NOT EXISTS client_origins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para a tabela de origens
CREATE INDEX IF NOT EXISTS idx_client_origins_name ON client_origins(name);
CREATE INDEX IF NOT EXISTS idx_client_origins_is_active ON client_origins(is_active);

-- Trigger para atualizar updated_at nas origens
CREATE TRIGGER update_client_origins_updated_at
    BEFORE UPDATE ON client_origins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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

-- Índices para a tabela de clientes
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_cpf_cnpj ON clients(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_clients_origin_id ON clients(origin_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by_user_id ON clients(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients(is_active);

-- Trigger para atualizar updated_at nos clientes
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comentários nas tabelas
COMMENT ON TABLE client_origins IS 'Tabela de origens/fontes de clientes (Indicação, Redes Sociais, etc)';
COMMENT ON TABLE clients IS 'Tabela de clientes do sistema';

COMMENT ON COLUMN client_origins.id IS 'ID único da origem (UUID)';
COMMENT ON COLUMN client_origins.name IS 'Nome da origem (ex: Instagram, Indicação, Google)';
COMMENT ON COLUMN client_origins.description IS 'Descrição detalhada da origem';
COMMENT ON COLUMN client_origins.is_active IS 'Indica se a origem está ativa';

COMMENT ON COLUMN clients.id IS 'ID único do cliente (UUID)';
COMMENT ON COLUMN clients.name IS 'Nome completo do cliente';
COMMENT ON COLUMN clients.phone IS 'Telefone do cliente';
COMMENT ON COLUMN clients.birth_date IS 'Data de nascimento do cliente';
COMMENT ON COLUMN clients.email IS 'Email do cliente';
COMMENT ON COLUMN clients.cpf_cnpj IS 'CPF ou CNPJ do cliente';
COMMENT ON COLUMN clients.origin_id IS 'ID da origem do cliente';
COMMENT ON COLUMN clients.is_active IS 'Indica se o cliente está ativo';
COMMENT ON COLUMN clients.created_by_user_id IS 'ID do usuário que cadastrou o cliente';

-- Inserir algumas origens padrão
INSERT INTO client_origins (name, description) VALUES
    ('Instagram', 'Cliente veio através do Instagram'),
    ('Facebook', 'Cliente veio através do Facebook'),
    ('Indicação', 'Cliente foi indicado por outro cliente'),
    ('Google', 'Cliente encontrou através de busca no Google'),
    ('WhatsApp', 'Cliente entrou em contato via WhatsApp'),
    ('Site', 'Cliente entrou em contato pelo site')
ON CONFLICT (name) DO NOTHING;

-- Verificação final
SELECT 'Migração concluída com sucesso!' as status;
SELECT COUNT(*) as total_origens FROM client_origins;
