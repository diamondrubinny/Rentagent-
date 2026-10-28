-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'MISTRAL', 'XAI', 'DEEPSEEK', 'GROQ', 'TOGETHER', 'FIREWORKS', 'PERPLEXITY', 'COHERE', 'OPENROUTER', 'AZURE_OPENAI', 'AMAZON_BEDROCK', 'OPENAI_COMPATIBLE');

-- CreateEnum
CREATE TYPE "ModelKind" AS ENUM ('CHAT', 'EMBEDDING');

-- CreateEnum
CREATE TYPE "RoutingStrategy" AS ENUM ('FIXED', 'CHEAPEST', 'FASTEST');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" UUID NOT NULL,
    "type" "ProviderType" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "base_url" VARCHAR(500),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_keys" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "last4" VARCHAR(8) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthly_limit_micros" BIGINT,
    "last_used_at" TIMESTAMPTZ(3),
    "last_error_at" TIMESTAMPTZ(3),
    "last_error_kind" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "model_id" VARCHAR(200) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "kind" "ModelKind" NOT NULL DEFAULT 'CHAT',
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "context_window" INTEGER,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cost_in_per_1m" DECIMAL(14,6),
    "cost_out_per_1m" DECIMAL(14,6),
    "price_in_per_1m" DECIMAL(14,6),
    "price_out_per_1m" DECIMAL(14,6),
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_routing_policies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "strategy" "RoutingStrategy" NOT NULL DEFAULT 'FIXED',
    "model_ids" UUID[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_routing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_records" (
    "id" BIGSERIAL NOT NULL,
    "provider_id" UUID,
    "model_id" UUID,
    "key_id" UUID,
    "user_id" VARCHAR(64),
    "purpose" VARCHAR(40) NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "UsageStatus" NOT NULL,
    "error_kind" VARCHAR(40),
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "price_micros" BIGINT NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_provider_keys_provider_id_idx" ON "ai_provider_keys"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_provider_id_model_id_key" ON "ai_models"("provider_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_routing_policies_name_key" ON "ai_routing_policies"("name");

-- CreateIndex
CREATE INDEX "ai_usage_records_created_at_idx" ON "ai_usage_records"("created_at");

-- CreateIndex
CREATE INDEX "ai_usage_records_key_id_created_at_idx" ON "ai_usage_records"("key_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_records_model_id_created_at_idx" ON "ai_usage_records"("model_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_records_request_id_idx" ON "ai_usage_records"("request_id");

-- AddForeignKey
ALTER TABLE "ai_provider_keys" ADD CONSTRAINT "ai_provider_keys_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "ai_provider_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
