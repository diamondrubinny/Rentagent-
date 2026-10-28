-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('GRANT', 'TOPUP', 'HOLD', 'CAPTURE', 'RELEASE', 'REFUND', 'ADJUST');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('STRIPE', 'PAYPAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "charged_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "hold_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "price_limit_micros" BIGINT,
ADD COLUMN     "settled_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "wallets" (
    "user_id" VARCHAR(64) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "balance_minor" BIGINT NOT NULL DEFAULT 0,
    "held_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "user_id" VARCHAR(64),
    "type" "LedgerType" NOT NULL,
    "available_delta" BIGINT NOT NULL,
    "held_delta" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "run_id" UUID,
    "payment_id" UUID,
    "note" VARCHAR(300),
    "actor_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(64),
    "gateway" "PaymentGateway" NOT NULL,
    "gateway_ref" VARCHAR(255) NOT NULL,
    "charge_ref" VARCHAR(255),
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "receipt_url" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entries_user_id_created_at_idx" ON "ledger_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_run_id_idx" ON "ledger_entries"("run_id");

-- CreateIndex
CREATE INDEX "payments_gateway_charge_ref_idx" ON "payments"("gateway", "charge_ref");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_gateway_ref_key" ON "payments"("gateway", "gateway_ref");

-- CreateIndex
CREATE INDEX "runs_settled_at_status_idx" ON "runs"("settled_at", "status");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reserved credits can never be negative (defence in depth for the settlement logic).
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_held_nonnegative" CHECK ("held_minor" >= 0);
