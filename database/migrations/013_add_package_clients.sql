-- Migração: adicionar tipo de cliente para pacotes
-- Data: 2025-12-02
-- Descrição: inclui coluna de tipo e campos específicos para clientes de pacotes (transportadoras)

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) NOT NULL DEFAULT 'common'
        CHECK (client_type IN ('common', 'package')),
    ADD COLUMN IF NOT EXISTS responsible_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS reference_contact VARCHAR(200);

-- Marcar como "cliente de pacote" quem já possui pacotes cadastrados
UPDATE clients
SET client_type = 'package'
WHERE client_type = 'common'
  AND id IN (SELECT DISTINCT client_id FROM client_packages);

-- Índice simples para filtros por tipo
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);

COMMENT ON COLUMN clients.client_type IS 'Tipo de cliente: common (padrão) ou package (transportadora)';
COMMENT ON COLUMN clients.responsible_name IS 'Nome do responsável pelo contrato/conta (clientes de pacote)';
COMMENT ON COLUMN clients.reference_contact IS 'Contato de referência do cliente de pacote (telefone/email)';
