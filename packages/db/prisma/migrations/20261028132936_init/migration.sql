-- CreateEnum
CREATE TYPE "TextDirection" AS ENUM ('LTR', 'RTL');

-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('AUTO', 'REVIEWED');

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" VARCHAR(64),

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "locales" (
    "code" VARCHAR(35) NOT NULL,
    "native_name" VARCHAR(80) NOT NULL,
    "direction" "TextDirection" NOT NULL DEFAULT 'LTR',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locales_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "translations" (
    "locale" VARCHAR(35) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "value" TEXT NOT NULL,
    "status" "TranslationStatus" NOT NULL DEFAULT 'REVIEWED',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("locale","key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" VARCHAR(64),
    "action" VARCHAR(80) NOT NULL,
    "target" VARCHAR(200),
    "ip_hash" VARCHAR(64),
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" BIGSERIAL NOT NULL,
    "anon_id" VARCHAR(64) NOT NULL,
    "policy_version" VARCHAR(32) NOT NULL,
    "categories" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "consent_records_anon_id_idx" ON "consent_records"("anon_id");

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "locales"("code") ON DELETE CASCADE ON UPDATE CASCADE;
