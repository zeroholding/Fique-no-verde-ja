-- Migration: store admin generated password for auditing
-- Created: 2025-01-06

ALTER TABLE users
ADD COLUMN IF NOT EXISTS admin_generated_password TEXT;

COMMENT ON COLUMN users.admin_generated_password IS 'Senha de provisionamento criada via painel admin (exibir ao gestor)';
