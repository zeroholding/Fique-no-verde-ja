-- Update pricing for Reclamacao and Atraso services
-- Vigencia: 25 de nov. de 2025

BEGIN;

-- 1. Update 'Reclamacao' (Complaints)
-- Remove existing ranges to ensure clean slate
DELETE FROM service_price_ranges
WHERE service_id IN (SELECT id FROM services WHERE name = 'Reclamacao');

-- Insert new ranges for Reclamacao
-- Range 1: 1-10 units, R$ 40.00 (Comum & Pacote)
INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '01', 1, 10, 40.00, '2025-11-25' FROM services WHERE name = 'Reclamacao';

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '02', 1, 10, 40.00, '2025-11-25' FROM services WHERE name = 'Reclamacao';

-- Range 2: 11+ units, R$ 15.00 (Comum & Pacote)
INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '01', 11, NULL, 15.00, '2025-11-25' FROM services WHERE name = 'Reclamacao';

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '02', 11, NULL, 15.00, '2025-11-25' FROM services WHERE name = 'Reclamacao';


-- 2. Update 'Atraso' (Delays)
-- Remove existing ranges
DELETE FROM service_price_ranges
WHERE service_id IN (SELECT id FROM services WHERE name = 'Atraso');

-- Insert new ranges for Atraso
-- Range 1: 1-10 units, R$ 30.00 (Comum & Pacote)
INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '01', 1, 10, 30.00, '2025-11-25' FROM services WHERE name = 'Atraso';

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '02', 1, 10, 30.00, '2025-11-25' FROM services WHERE name = 'Atraso';

-- Range 2: 11-20 units, R$ 20.00 (Comum & Pacote)
INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '01', 11, 20, 20.00, '2025-11-25' FROM services WHERE name = 'Atraso';

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '02', 11, 20, 20.00, '2025-11-25' FROM services WHERE name = 'Atraso';

-- Range 3: 21+ units, R$ 15.00 (Comum & Pacote)
INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '01', 21, NULL, 15.00, '2025-11-25' FROM services WHERE name = 'Atraso';

INSERT INTO service_price_ranges (service_id, sale_type, min_quantity, max_quantity, unit_price, effective_from)
SELECT id, '02', 21, NULL, 15.00, '2025-11-25' FROM services WHERE name = 'Atraso';

COMMIT;
