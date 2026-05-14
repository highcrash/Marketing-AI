-- CreateTable
CREATE TABLE "CampaignCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "pieceIndex" INTEGER NOT NULL,
    "label" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignCode_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "CampaignCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCode_code_key" ON "CampaignCode"("code");

-- CreateIndex
CREATE INDEX "CampaignCode_draftId_pieceIndex_idx" ON "CampaignCode"("draftId", "pieceIndex");

-- CreateIndex
CREATE INDEX "CampaignRedemption_codeId_redeemedAt_idx" ON "CampaignRedemption"("codeId", "redeemedAt");
