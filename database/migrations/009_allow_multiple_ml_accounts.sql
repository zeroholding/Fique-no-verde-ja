-- Migration to allow multiple Mercado Livre accounts per user
-- We need to remove the unique constraint on user_id and add a composite unique constraint on (user_id, ml_user_id)

DO $$
BEGIN
    -- Drop the existing constraint if it exists (handling the default name)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mercado_livre_credentials_user_id_key') THEN
        ALTER TABLE mercado_livre_credentials DROP CONSTRAINT mercado_livre_credentials_user_id_key;
    END IF;

    -- Also check for the unique index if it was created differently (though UNIQUE constraint implies an index)
    -- We'll just add the new constraint which is the most important part.
    
    -- Add the new composite unique constraint
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mercado_livre_credentials_user_ml_user_unique') THEN
        ALTER TABLE mercado_livre_credentials ADD CONSTRAINT mercado_livre_credentials_user_ml_user_unique UNIQUE (user_id, ml_user_id);
    END IF;
END $$;
