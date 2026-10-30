-- CreateEnum
CREATE TYPE "ApiKeyKind" AS ENUM ('SECRET', 'PUBLISHABLE');

-- AlterEnum
ALTER TYPE "ConversationSource" ADD VALUE 'WIDGET';

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "daily_run_limit" INTEGER,
ADD COLUMN     "kind" "ApiKeyKind" NOT NULL DEFAULT 'SECRET',
ADD COLUMN     "origins" TEXT[];

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "visitor_id" VARCHAR(64);

-- CreateIndex
CREATE INDEX "conversations_api_key_id_visitor_id_idx" ON "conversations"("api_key_id", "visitor_id");

