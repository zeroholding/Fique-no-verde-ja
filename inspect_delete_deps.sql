
SELECT 
    conname AS constraint_name,
    conrelid::regclass AS table_with_fk,
    confrelid::regclass AS referenced_table
FROM 
    pg_constraint
WHERE 
    confrelid = 'public.sales'::regclass;

SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'refund_package_consumption';
