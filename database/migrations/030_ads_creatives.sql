-- =====================================================
-- Migracao 030: criativos dos anuncios do FNVJ Ads (/ads)
--
-- A Meta nao devolve a peca visual junto do insights: ela vem
-- de uma segunda chamada, por anuncio. O painel cruza o
-- criativo com `ads_daily` pelo `ad_id`.
--
--   ads_creatives -> uma linha por anuncio (ad_id unico)
--
-- Guarda imagem, video, miniatura do video, texto e o status
-- do anuncio (Ativo, Pausado, Em analise...).
--
-- A peca visual e dado de apoio: se a Meta nao devolver, a
-- sincronizacao continua e o anuncio aparece sem imagem.
--
-- Mesmo SQL de lib/ads/schema.ts: a API tambem cria a tabela
-- na primeira chamada. Idempotente.
-- Documentacao: app/ads/README.md
-- =====================================================

CREATE TABLE IF NOT EXISTS ads_creatives (
  ad_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  object_type TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  image_url TEXT,
  video_id TEXT,
  video_thumbnail_url TEXT,
  video_url TEXT,
  effective_status TEXT NOT NULL DEFAULT '',
  permalink_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bancos que rodaram a versao anterior da migracao (so imagem) recebem
-- as colunas novas aqui, sem perder o que ja estava gravado.
ALTER TABLE ads_creatives ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '';
ALTER TABLE ads_creatives ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '';
ALTER TABLE ads_creatives ADD COLUMN IF NOT EXISTS video_id TEXT;
ALTER TABLE ads_creatives ADD COLUMN IF NOT EXISTS video_thumbnail_url TEXT;
ALTER TABLE ads_creatives ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE ads_creatives ADD COLUMN IF NOT EXISTS effective_status TEXT NOT NULL DEFAULT '';
ALTER TABLE ads_creatives ADD COLUMN IF NOT EXISTS permalink_url TEXT;

CREATE INDEX IF NOT EXISTS idx_ads_creatives_status
  ON ads_creatives (effective_status);
