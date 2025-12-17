-- Migration to Unified Wallet (Single Cycle)
-- 1. Create a temporary table to calculate totals for duplicate packages
CREATE TEMP TABLE package_totals AS
SELECT
    client_id,
    service_id,
    COUNT(*) as pkg_count,
    MAX(created_at) as latest_created_at, -- Keep the most recent one
    SUM(available_quantity) as total_available,
    SUM(consumed_quantity) as total_consumed,
    SUM(initial_quantity) as total_initial
FROM client_packages
WHERE is_active = true
GROUP BY client_id, service_id
HAVING COUNT(*) > 1;

-- 2. Update the "Main" package (the most recent one) with the summed totals
UPDATE client_packages cp
SET
    available_quantity = pt.total_available,
    consumed_quantity = pt.total_consumed,
    initial_quantity = pt.total_initial,
    updated_at = NOW()
FROM package_totals pt
WHERE cp.client_id = pt.client_id
  AND cp.service_id = pt.service_id
  AND cp.created_at = pt.latest_created_at;

-- 3. Deactivate/Delete the "Old" packages (all except the most recent one)
UPDATE client_packages cp
SET is_active = false,
    updated_at = NOW() -- Soft delete / mark inactive
FROM package_totals pt
WHERE cp.client_id = pt.client_id
  AND cp.service_id = pt.service_id
  AND cp.created_at < pt.latest_created_at
  AND cp.is_active = true;

-- 4. Verify & Add Constraint (Optional but recommended for strictness)
-- First, ensure no duplicates remain active (The steps above should handle it)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_active_client_package_service'
    ) THEN
        CREATE UNIQUE INDEX unique_active_client_package_service 
        ON client_packages (client_id, service_id) 
        WHERE is_active = true;
    END IF;
END $$;
