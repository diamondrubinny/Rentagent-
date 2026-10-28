-- DropIndex
DROP INDEX "agents_status_idx";

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "embedding" vector,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "search_text" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "conversation_id" UUID,
ADD COLUMN     "feedback" VARCHAR(1000),
ADD COLUMN     "rating" SMALLINT,
ADD COLUMN     "user_message" TEXT;

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "agent_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "conversations_updated_at_idx" ON "conversations"("updated_at");

-- CreateIndex
CREATE INDEX "agents_status_featured_idx" ON "agents"("status", "featured");

-- CreateIndex
CREATE INDEX "runs_conversation_id_created_at_idx" ON "runs"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
