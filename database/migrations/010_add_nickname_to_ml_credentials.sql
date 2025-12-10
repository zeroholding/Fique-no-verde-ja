-- Add nickname column to mercado_livre_credentials to store the ML username
ALTER TABLE mercado_livre_credentials ADD COLUMN IF NOT EXISTS nickname TEXT;
