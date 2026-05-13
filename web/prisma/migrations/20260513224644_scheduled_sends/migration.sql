-- CreateTable
CREATE TABLE "ScheduledSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "pieceIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "lastError" TEXT,
    "completedAt" DATETIME,
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledSend_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScheduledSend_status_scheduledAt_idx" ON "ScheduledSend"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledSend_draftId_pieceIndex_idx" ON "ScheduledSend"("draftId", "pieceIndex");
