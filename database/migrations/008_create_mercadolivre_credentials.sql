-- Tabela para armazenar credenciais do Mercado Livre
CREATE TABLE IF NOT EXISTS mercado_livre_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    ml_user_id BIGINT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT,
    scope TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Índice para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_ml_credentials_user_id ON mercado_livre_credentials(user_id);
