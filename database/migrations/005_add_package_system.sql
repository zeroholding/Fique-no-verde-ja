-- =====================================================
-- SISTEMA DE PACOTES PRÉ-PAGOS
-- Permite que clientes comprem pacotes antecipados
-- e consumam aos poucos em atendimentos futuros
-- =====================================================

-- =============================
-- 1. TABELA DE PACOTES DOS CLIENTES
-- =============================
CREATE TABLE IF NOT EXISTS client_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,

    -- Quantidades
    initial_quantity INTEGER NOT NULL, -- Quantidade total comprada
    consumed_quantity INTEGER NOT NULL DEFAULT 0, -- Quantidade já consumida
    available_quantity INTEGER NOT NULL, -- Saldo disponível (calculado)

    -- Valores
    unit_price NUMERIC(12,2) NOT NULL, -- Preço unitário pago
    total_paid NUMERIC(12,2) NOT NULL, -- Total pago pelo pacote

    -- Validade
    expires_at DATE, -- Data de expiração (NULL = sem expiração)
    is_active BOOLEAN DEFAULT true,

    -- Controle
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_positive_initial_qty CHECK (initial_quantity > 0),
    CONSTRAINT check_positive_consumed_qty CHECK (consumed_quantity >= 0),
    CONSTRAINT check_positive_available_qty CHECK (available_quantity >= 0),
    CONSTRAINT check_consumed_not_exceed CHECK (consumed_quantity <= initial_quantity),
    CONSTRAINT check_available_matches CHECK (available_quantity = initial_quantity - consumed_quantity),
    CONSTRAINT check_positive_unit_price CHECK (unit_price > 0),
    CONSTRAINT check_positive_total_paid CHECK (total_paid > 0)
);

CREATE INDEX IF NOT EXISTS idx_client_packages_client_id ON client_packages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_service_id ON client_packages(service_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_sale_id ON client_packages(sale_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_is_active ON client_packages(is_active);
CREATE INDEX IF NOT EXISTS idx_client_packages_expires_at ON client_packages(expires_at);

COMMENT ON TABLE client_packages IS 'Pacotes pré-pagos dos clientes com saldo disponível';
COMMENT ON COLUMN client_packages.initial_quantity IS 'Quantidade total comprada no pacote';
COMMENT ON COLUMN client_packages.consumed_quantity IS 'Quantidade já consumida do pacote';
COMMENT ON COLUMN client_packages.available_quantity IS 'Saldo disponível (initial - consumed)';
COMMENT ON COLUMN client_packages.expires_at IS 'Data de expiração do pacote (NULL = sem expiração)';

-- =============================
-- 2. TABELA DE CONSUMOS DE PACOTES
-- =============================
CREATE TABLE IF NOT EXISTS package_consumptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID NOT NULL REFERENCES client_packages(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,

    -- Quantidade consumida
    quantity INTEGER NOT NULL,

    -- Valor do consumo (para histórico)
    unit_price NUMERIC(12,2) NOT NULL, -- Preço que foi pago no pacote
    total_value NUMERIC(12,2) NOT NULL, -- Total do consumo (quantity * unit_price)

    -- Controle
    consumed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_positive_quantity CHECK (quantity > 0),
    CONSTRAINT check_positive_unit_price CHECK (unit_price > 0),
    CONSTRAINT check_positive_total_value CHECK (total_value > 0)
);

CREATE INDEX IF NOT EXISTS idx_package_consumptions_package_id ON package_consumptions(package_id);
CREATE INDEX IF NOT EXISTS idx_package_consumptions_sale_id ON package_consumptions(sale_id);
CREATE INDEX IF NOT EXISTS idx_package_consumptions_consumed_at ON package_consumptions(consumed_at);

COMMENT ON TABLE package_consumptions IS 'Histórico de consumos dos pacotes pré-pagos';
COMMENT ON COLUMN package_consumptions.quantity IS 'Quantidade consumida do pacote';
COMMENT ON COLUMN package_consumptions.total_value IS 'Valor do consumo (quantidade × preço do pacote)';

-- =============================
-- 3. TRIGGER PARA ATUALIZAR updated_at
-- =============================
CREATE TRIGGER update_client_packages_updated_at
    BEFORE UPDATE ON client_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================
-- 4. VIEW: PACOTES ATIVOS COM SALDO
-- =============================
CREATE OR REPLACE VIEW v_active_packages AS
SELECT
    cp.id,
    cp.client_id,
    c.name as client_name,
    cp.service_id,
    s.name as service_name,
    cp.initial_quantity,
    cp.consumed_quantity,
    cp.available_quantity,
    cp.unit_price,
    cp.total_paid,
    cp.expires_at,
    cp.created_at,
    -- Calcular se está expirado
    CASE
        WHEN cp.expires_at IS NOT NULL AND cp.expires_at < CURRENT_DATE THEN true
        ELSE false
    END as is_expired,
    -- Calcular total economizado (diferença entre preço normal e pacote)
    COALESCE(
        (s.base_price - cp.unit_price) * cp.available_quantity,
        0
    ) as savings_available
FROM client_packages cp
JOIN clients c ON cp.client_id = c.id
JOIN services s ON cp.service_id = s.id
WHERE cp.is_active = true
  AND cp.available_quantity > 0
  AND (cp.expires_at IS NULL OR cp.expires_at >= CURRENT_DATE)
ORDER BY cp.created_at DESC;

COMMENT ON VIEW v_active_packages IS 'Pacotes ativos com saldo disponível (não expirados)';

-- =============================
-- 5. VIEW: HISTÓRICO DE CONSUMOS
-- =============================
CREATE OR REPLACE VIEW v_package_consumption_history AS
SELECT
    pc.id,
    pc.package_id,
    cp.client_id,
    c.name as client_name,
    s.name as service_name,
    pc.sale_id,
    pc.quantity,
    pc.unit_price,
    pc.total_value,
    pc.consumed_at,
    u.first_name || ' ' || u.last_name as attendant_name
FROM package_consumptions pc
JOIN client_packages cp ON pc.package_id = cp.id
JOIN clients c ON cp.client_id = c.id
JOIN services s ON cp.service_id = s.id
JOIN sales sal ON pc.sale_id = sal.id
JOIN users u ON sal.attendant_id = u.id
ORDER BY pc.consumed_at DESC;

COMMENT ON VIEW v_package_consumption_history IS 'Histórico completo de consumos de pacotes';

-- =============================
-- 6. FUNÇÃO: CONSUMIR PACOTE
-- =============================
-- Esta função será usada para consumir um pacote de forma atômica
CREATE OR REPLACE FUNCTION consume_package(
    p_package_id UUID,
    p_sale_id UUID,
    p_quantity INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_available INTEGER;
    v_unit_price NUMERIC(12,2);
BEGIN
    -- Buscar pacote e travar linha (FOR UPDATE)
    SELECT available_quantity, unit_price
    INTO v_available, v_unit_price
    FROM client_packages
    WHERE id = p_package_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
    FOR UPDATE;

    -- Verificar se encontrou o pacote
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pacote não encontrado ou inativo';
    END IF;

    -- Verificar se tem saldo suficiente
    IF v_available < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente no pacote. Disponível: %, Solicitado: %', v_available, p_quantity;
    END IF;

    -- Atualizar o pacote
    UPDATE client_packages
    SET consumed_quantity = consumed_quantity + p_quantity,
        available_quantity = available_quantity - p_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_package_id;

    -- Registrar o consumo
    INSERT INTO package_consumptions (package_id, sale_id, quantity, unit_price, total_value)
    VALUES (p_package_id, p_sale_id, p_quantity, v_unit_price, v_unit_price * p_quantity);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION consume_package IS 'Consome quantidade de um pacote de forma atômica (com lock)';

-- =============================
-- 7. FUNÇÃO: ESTORNAR CONSUMO DE PACOTE
-- =============================
-- Usada quando uma venda é cancelada
CREATE OR REPLACE FUNCTION refund_package_consumption(
    p_sale_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_consumption RECORD;
BEGIN
    -- Buscar todos os consumos relacionados à venda
    FOR v_consumption IN
        SELECT package_id, quantity
        FROM package_consumptions
        WHERE sale_id = p_sale_id
    LOOP
        -- Devolver a quantidade ao pacote
        UPDATE client_packages
        SET consumed_quantity = consumed_quantity - v_consumption.quantity,
            available_quantity = available_quantity + v_consumption.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_consumption.package_id;

        -- Deletar o registro de consumo
        DELETE FROM package_consumptions
        WHERE sale_id = p_sale_id AND package_id = v_consumption.package_id;
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refund_package_consumption IS 'Estorna consumos de pacote quando uma venda é cancelada';

-- =============================
-- FIM DO SCRIPT
-- =====================================================
