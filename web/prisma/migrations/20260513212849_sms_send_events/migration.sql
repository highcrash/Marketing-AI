-- CreateTable
CREATE TABLE "SmsSendEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "pieceIndex" INTEGER NOT NULL,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "campaignTag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerRequestId" TEXT,
    "providerStatus" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmsSendEvent_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SmsSendEvent_draftId_createdAt_idx" ON "SmsSendEvent"("draftId", "createdAt");
