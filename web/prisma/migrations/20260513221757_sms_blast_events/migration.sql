-- CreateTable
CREATE TABLE "SmsBlastEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "pieceIndex" INTEGER NOT NULL,
    "segmentFilter" TEXT NOT NULL,
    "segmentLabel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "campaignTag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmsBlastEvent_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SmsBlastEvent_draftId_createdAt_idx" ON "SmsBlastEvent"("draftId", "createdAt");
