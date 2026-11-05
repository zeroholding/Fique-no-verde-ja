-- =====================================================
-- Migracao 030: imagens dos anuncios do FNVJ Ads (/ads)
--
-- A Meta nao devolve a imagem junto do insights: ela vem de
-- uma segunda chamada, por anuncio. As fotos ficam aqui e o
-- painel cruza com `ads_daily` pelo `ad_id`.
--
--   ads_creatives -> uma linha por anuncio (ad_id unico)
--
-- A imagem e dado de apoio: se a Meta nao devolver, a
-- sincronizacao continua e a tabela fica sem a foto.
--
-- Mesmo SQL de lib/ads/schema.ts: a API tambem cria a tabela
-- na primeira chamada. Idempotente.
-- Documentacao: app/ads/README.md
-- =====================================================

CREATE TABLE IF NOT EXISTS ads_creatives (
  ad_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  object_type TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  image_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
