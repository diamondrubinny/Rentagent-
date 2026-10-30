-- CreateEnum
CREATE TYPE "ConversationSource" AS ENUM ('WEB', 'API');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "api_key_id" UUID,
ADD COLUMN     "source" "ConversationSource" NOT NULL DEFAULT 'WEB';

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "key_id" VARCHAR(32) NOT NULL,
    "secret_hash" CHAR(64) NOT NULL,
    "scopes" TEXT[],
    "agent_ids" UUID[],
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_id_key" ON "api_keys"("key_id");

-- CreateIndex
CREATE INDEX "api_keys_user_id_created_at_idx" ON "api_keys"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

