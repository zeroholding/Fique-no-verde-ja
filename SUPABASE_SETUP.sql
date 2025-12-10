-- =====================================================
-- SUPABASE SETUP SCRIPT
-- Consolidated from schema.sql, sales-schema.sql, and migrations
-- Run this in the Supabase SQL Editor
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CORE TABLES (from schema.sql)
-- =====================================================

-- Users Table
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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- Client Origins
CREATE TABLE IF NOT EXISTS client_origins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO client_origins (name, description) VALUES
    ('Instagram', 'Cliente veio através do Instagram'),
    ('Facebook', 'Cliente veio através do Facebook'),
    ('Indicação', 'Cliente foi indicado por outro cliente'),
    ('Google', 'Cliente encontrou através de busca no Google'),
    ('WhatsApp', 'Cliente entrou em contato via WhatsApp'),
    ('Site', 'Cliente entrou em contato pelo site')
ON CONFLICT (name) DO NOTHING;

-- Clients Table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    birth_date DATE,
    email VARCHAR(255),
    cpf_cnpj VARCHAR(18),
    origin_id UUID REFERENCES client_origins(id) ON DELETE SET NULL,
    client_type VARCHAR(20) NOT NULL DEFAULT 'common'
        CHECK (client_type IN ('common', 'package')),
    responsible_name VARCHAR(200),
    reference_contact VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);

-- Services Table
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

INSERT INTO services (name, description, base_price, sla, highlights)
VALUES
    ('Reclamacao', 'Atendimento completo para relatos formais', 0, 'Ate 3 dias uteis', '["Checklist completo", "Retorno em 72h"]'::jsonb),
    ('Atraso', 'Tratativa padrao para pedidos atrasados', 0, 'Ate 48 horas', '["Monitoramento diario", "Comunicacao ativa"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Service Price Ranges
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

-- =====================================================
-- 2. SALES SYSTEM (from sales-schema.sql)
-- =====================================================

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Price Ranges
CREATE TABLE IF NOT EXISTS price_ranges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    min_quantity INTEGER NOT NULL,
    max_quantity INTEGER,
    unit_price DECIMAL(10, 2) NOT NULL,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales Table
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    attendant_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sale_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observations TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'confirmada', 'cancelada')),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'dinheiro',
    general_discount_type VARCHAR(20),
    general_discount_value DECIMAL(10, 2) DEFAULT 0,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    confirmed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sale Items Table
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount_type VARCHAR(20),
    discount_value DECIMAL(10, 2) DEFAULT 0,
    subtotal DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Commission Policies
CREATE TABLE IF NOT EXISTS commission_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    value DECIMAL(10, 2) NOT NULL,
    base VARCHAR(20) NOT NULL DEFAULT 'net',
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Commissions
CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    sale_item_id UUID REFERENCES sale_items(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    base_amount DECIMAL(10, 2) NOT NULL,
    commission_type VARCHAR(20) NOT NULL,
    commission_rate DECIMAL(10, 2) NOT NULL,
    commission_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'a_pagar',
    reference_date DATE NOT NULL,
    payment_date DATE,
    considers_business_days BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 3. PACKAGES SYSTEM (from 005_add_package_system.sql)
-- =====================================================

CREATE TABLE IF NOT EXISTS client_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    initial_quantity INTEGER NOT NULL,
    consumed_quantity INTEGER NOT NULL DEFAULT 0,
    available_quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_paid NUMERIC(12,2) NOT NULL,
    expires_at DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS package_consumptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID NOT NULL REFERENCES client_packages(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_value NUMERIC(12,2) NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 4. MIGRATIONS APPLIED
-- =====================================================

-- 006: Add sale_type to sale_items
ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS sale_type VARCHAR(2) NOT NULL DEFAULT '01'
CHECK (sale_type IN ('01', '02'));

-- 013: Add package client fields
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) NOT NULL DEFAULT 'common'
        CHECK (client_type IN ('common', 'package')),
    ADD COLUMN IF NOT EXISTS responsible_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS reference_contact VARCHAR(200);

UPDATE clients
SET client_type = 'package'
WHERE client_type = 'common'
  AND id IN (SELECT DISTINCT client_id FROM client_packages);

CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);

COMMENT ON COLUMN clients.client_type IS 'Tipo de cliente: common (padrao) ou package (transportadora)';
COMMENT ON COLUMN clients.responsible_name IS 'Nome do responsavel pelo contrato/conta (clientes de pacote)';
COMMENT ON COLUMN clients.reference_contact IS 'Contato de referencia do cliente de pacote (telefone/email)';

-- =====================================================
-- 5. FUNCTIONS & TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns WHERE column_name = 'updated_at' AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- Package Consumption Functions
CREATE OR REPLACE FUNCTION consume_package(
    p_package_id UUID,
    p_sale_id UUID,
    p_quantity INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_available INTEGER;
    v_unit_price NUMERIC(12,2);
BEGIN
    SELECT available_quantity, unit_price
    INTO v_available, v_unit_price
    FROM client_packages
    WHERE id = p_package_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pacote não encontrado ou inativo';
    END IF;

    IF v_available < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente no pacote. Disponível: %, Solicitado: %', v_available, p_quantity;
    END IF;

    UPDATE client_packages
    SET consumed_quantity = consumed_quantity + p_quantity,
        available_quantity = available_quantity - p_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_package_id;

    INSERT INTO package_consumptions (package_id, sale_id, quantity, unit_price, total_value)
    VALUES (p_package_id, p_sale_id, p_quantity, v_unit_price, v_unit_price * p_quantity);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refund_package_consumption(
    p_sale_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_consumption RECORD;
BEGIN
    FOR v_consumption IN
        SELECT package_id, quantity
        FROM package_consumptions
        WHERE sale_id = p_sale_id
    LOOP
        UPDATE client_packages
        SET consumed_quantity = consumed_quantity - v_consumption.quantity,
            available_quantity = available_quantity + v_consumption.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_consumption.package_id;

        DELETE FROM package_consumptions
        WHERE sale_id = p_sale_id AND package_id = v_consumption.package_id;
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
