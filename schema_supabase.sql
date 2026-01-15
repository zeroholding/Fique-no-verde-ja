CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema exported from Supabase

CREATE TABLE IF NOT EXISTS "client_origins" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "client_packages" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "client_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "sale_id" UUID,
  "initial_quantity" INTEGER NOT NULL,
  "consumed_quantity" INTEGER DEFAULT 0 NOT NULL,
  "available_quantity" INTEGER NOT NULL,
  "unit_price" NUMERIC NOT NULL,
  "total_paid" NUMERIC NOT NULL,
  "expires_at" DATE,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "clients" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(255),
  "birth_date" DATE,
  "email" VARCHAR(255),
  "cpf_cnpj" VARCHAR(255),
  "origin_id" UUID,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "created_by_user_id" UUID,
  "account_link" TEXT,
  "client_type" VARCHAR(255) DEFAULT 'common' NOT NULL,
  "responsible_name" VARCHAR(255),
  "reference_contact" VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS "commission_policies" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "type" VARCHAR(255) NOT NULL,
  "value" NUMERIC NOT NULL,
  "scope" VARCHAR(255) NOT NULL,
  "product_id" UUID,
  "user_id" UUID,
  "applies_to" VARCHAR(255) DEFAULT 'all' NOT NULL,
  "consider_business_days" BOOLEAN DEFAULT false,
  "valid_from" DATE DEFAULT CURRENT_DATE NOT NULL,
  "valid_until" DATE,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "created_by_user_id" UUID,
  "sale_type" VARCHAR(255) DEFAULT 'all' NOT NULL
);

CREATE TABLE IF NOT EXISTS "commissions" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "sale_id" UUID NOT NULL,
  "sale_item_id" UUID,
  "user_id" UUID NOT NULL,
  "base_amount" NUMERIC NOT NULL,
  "commission_type" VARCHAR(255) NOT NULL,
  "commission_rate" NUMERIC NOT NULL,
  "commission_amount" NUMERIC NOT NULL,
  "status" VARCHAR(255) DEFAULT 'a_pagar' NOT NULL,
  "reference_date" TIMESTAMPTZ NOT NULL,
  "payment_date" TIMESTAMPTZ,
  "considers_business_days" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "holidays" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "date" DATE NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "is_national" BOOLEAN DEFAULT true,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "mercado_livre_credentials" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "user_id" UUID NOT NULL,
  "ml_user_id" BIGINT,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT,
  "token_type" TEXT,
  "scope" TEXT,
  "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "nickname" TEXT
);

CREATE TABLE IF NOT EXISTS "package_consumptions" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "package_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" NUMERIC NOT NULL,
  "total_value" NUMERIC NOT NULL,
  "consumed_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "price_ranges" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "product_id" UUID NOT NULL,
  "min_quantity" INTEGER NOT NULL,
  "max_quantity" INTEGER,
  "unit_price" NUMERIC NOT NULL,
  "valid_from" DATE DEFAULT CURRENT_DATE NOT NULL,
  "valid_until" DATE,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "products" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "sku" VARCHAR(255),
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sale_items" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "sale_id" UUID NOT NULL,
  "product_id" UUID,
  "product_name" VARCHAR(255) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" NUMERIC NOT NULL,
  "discount_type" VARCHAR(255),
  "discount_value" NUMERIC DEFAULT 0,
  "subtotal" NUMERIC NOT NULL,
  "discount_amount" NUMERIC DEFAULT 0 NOT NULL,
  "total" NUMERIC NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "sale_type" VARCHAR(255) DEFAULT '01' NOT NULL
);

CREATE TABLE IF NOT EXISTS "sale_refunds" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "sale_id" UUID NOT NULL,
  "amount" NUMERIC NOT NULL,
  "reason" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "sales" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "client_id" UUID NOT NULL,
  "attendant_id" UUID NOT NULL,
  "sale_date" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "observations" TEXT,
  "status" VARCHAR(255) DEFAULT 'aberta' NOT NULL,
  "payment_method" VARCHAR(255) DEFAULT 'dinheiro' NOT NULL,
  "general_discount_type" VARCHAR(255),
  "general_discount_value" NUMERIC DEFAULT 0,
  "subtotal" NUMERIC DEFAULT 0 NOT NULL,
  "total_discount" NUMERIC DEFAULT 0 NOT NULL,
  "total" NUMERIC DEFAULT 0 NOT NULL,
  "confirmed_at" TIMESTAMP,
  "cancelled_at" TIMESTAMP,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "commission_amount" NUMERIC DEFAULT 0,
  "commission_policy_id" UUID,
  "discount_amount" NUMERIC DEFAULT 0,
  "refund_total" NUMERIC DEFAULT 0 NOT NULL,
  "sale_number" BIGINT DEFAULT nextval('sales_sale_number_seq' NOT NULL
);

CREATE TABLE IF NOT EXISTS "service_price_ranges" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "service_id" UUID NOT NULL,
  "sale_type" VARCHAR(255) DEFAULT '01' NOT NULL,
  "min_quantity" INTEGER DEFAULT 1 NOT NULL,
  "max_quantity" INTEGER,
  "unit_price" NUMERIC NOT NULL,
  "effective_from" DATE DEFAULT CURRENT_DATE NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "services" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "base_price" NUMERIC DEFAULT 0 NOT NULL,
  "sla" VARCHAR(255) NOT NULL,
  "highlights" JSONB DEFAULT '[]' NOT NULL,
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "user_id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "ip_address" VARCHAR(255),
  "user_agent" TEXT
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
  "first_name" VARCHAR(255) NOT NULL,
  "last_name" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(255),
  "password_hash" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "last_login" TIMESTAMPTZ,
  "is_active" BOOLEAN DEFAULT true,
  "is_admin" BOOLEAN DEFAULT false,
  "created_by_admin" BOOLEAN DEFAULT false,
  "admin_generated_password" TEXT
);

