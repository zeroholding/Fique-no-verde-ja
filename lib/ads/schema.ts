/**
 * Estrutura do banco do /ads.
 *
 * O mesmo SQL está em `database/migrations/027_create_ads_reports.sql`. As
 * migrations deste projeto são aplicadas à mão, então a API também garante as
 * tabelas na primeira chamada (`ensureAdsSchema` em `lib/ads/db.ts`). Tudo é
 * idempotente. Ao mudar uma coluna, mude os dois arquivos juntos.
 *
 * Regra de NULL nas métricas: NULL quer dizer "a coluna não veio no arquivo";
 * célula vazia numa coluna que veio é gravada como zero.
 *
 * `ads_coverage` guarda os dias que cada envio ainda cobre. Dia coberto sem
 * linha é dia sem veiculação (zero); dia fora da cobertura é dia sem relatório.
 */
export const ADS_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ads_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash CHAR(64) NOT NULL,
  file_format VARCHAR(10) NOT NULL,
  account_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  account_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  currency VARCHAR(10),
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_ignored INTEGER NOT NULL DEFAULT 0,
  rows_replaced INTEGER NOT NULL DEFAULT 0,
  metrics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ads_imports_created_at
  ON ads_imports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ads_imports_file_hash
  ON ads_imports (file_hash);

CREATE TABLE IF NOT EXISTS ads_daily (
  id BIGSERIAL PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES ads_imports(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign_name TEXT NOT NULL DEFAULT '',
  adset_id TEXT NOT NULL DEFAULT '',
  adset_name TEXT NOT NULL DEFAULT '',
  ad_id TEXT NOT NULL DEFAULT '',
  ad_name TEXT NOT NULL DEFAULT '',
  result_type TEXT NOT NULL DEFAULT '',
  spend NUMERIC(16,2),
  impressions BIGINT,
  reach BIGINT,
  link_clicks BIGINT,
  all_clicks BIGINT,
  results NUMERIC(16,2),
  landing_page_views BIGINT,
  conversations NUMERIC(16,2),
  leads NUMERIC(16,2),
  purchases NUMERIC(16,2),
  purchase_value NUMERIC(16,2)
);

CREATE INDEX IF NOT EXISTS idx_ads_daily_day
  ON ads_daily (day);

CREATE INDEX IF NOT EXISTS idx_ads_daily_import_id
  ON ads_daily (import_id);

CREATE TABLE IF NOT EXISTS ads_coverage (
  id BIGSERIAL PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES ads_imports(id) ON DELETE CASCADE,
  day_from DATE NOT NULL,
  day_to DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ads_coverage_import_id
  ON ads_coverage (import_id);
`;
