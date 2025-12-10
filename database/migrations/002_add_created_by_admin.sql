-- Migration: Track admin-created accounts
-- Created: 2025-01-06

ALTER TABLE users
ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.created_by_admin IS 'Indica se a conta foi criada a partir do painel administrativo';
