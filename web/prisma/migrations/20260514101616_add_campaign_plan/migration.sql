-- CreateTable
CREATE TABLE "CampaignPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "totalBudgetMinor" INTEGER NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "disabledCategories" TEXT NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL,
    "cacheWriteTokens" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignPlan_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CampaignPlan_analysisId_createdAt_idx" ON "CampaignPlan"("analysisId", "createdAt");
