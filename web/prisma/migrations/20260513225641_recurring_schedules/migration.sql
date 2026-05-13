-- CreateTable
CREATE TABLE "RecurringSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "pieceIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextFireAt" DATETIME NOT NULL,
    "lastFireAt" DATETIME,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringSchedule_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecurringSchedule_active_nextFireAt_idx" ON "RecurringSchedule"("active", "nextFireAt");

-- CreateIndex
CREATE INDEX "RecurringSchedule_draftId_pieceIndex_idx" ON "RecurringSchedule"("draftId", "pieceIndex");
