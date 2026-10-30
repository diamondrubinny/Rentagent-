-- AlterEnum
ALTER TYPE "ConversationSource" ADD VALUE 'SCHEDULE';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "schedule_id" UUID;

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "agent_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "input" JSONB NOT NULL,
    "locale" VARCHAR(35) NOT NULL,
    "cron" VARCHAR(100),
    "time_zone" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "next_run_at" TIMESTAMPTZ(3),
    "last_run_at" TIMESTAMPTZ(3),
    "last_status" VARCHAR(20),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "notify_email" BOOLEAN NOT NULL DEFAULT true,
    "trigger_id" VARCHAR(32),
    "trigger_secret_encrypted" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedules_trigger_id_key" ON "schedules"("trigger_id");

-- CreateIndex
CREATE INDEX "schedules_enabled_next_run_at_idx" ON "schedules"("enabled", "next_run_at");

-- CreateIndex
CREATE INDEX "schedules_user_id_created_at_idx" ON "schedules"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

