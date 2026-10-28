-- AlterTable
ALTER TABLE "translations" ADD COLUMN     "updated_by" VARCHAR(64);

-- CreateIndex
CREATE INDEX "translations_locale_status_idx" ON "translations"("locale", "status");
