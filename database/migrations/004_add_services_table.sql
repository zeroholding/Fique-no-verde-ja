-- Descricao: Cria tabela de servicos e insere registros padrao
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

