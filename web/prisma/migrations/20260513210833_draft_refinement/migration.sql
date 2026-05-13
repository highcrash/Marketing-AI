-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CampaignDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "recIndex" INTEGER NOT NULL,
    "recTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL,
    "cacheWriteTokens" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "feedback" TEXT,
    "parentDraftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignDraft_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignDraft_parentDraftId_fkey" FOREIGN KEY ("parentDraftId") REFERENCES "CampaignDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CampaignDraft" ("analysisId", "cacheReadTokens", "cacheWriteTokens", "createdAt", "id", "inputTokens", "model", "outputTokens", "payload", "recIndex", "recTitle", "status", "updatedAt") SELECT "analysisId", "cacheReadTokens", "cacheWriteTokens", "createdAt", "id", "inputTokens", "model", "outputTokens", "payload", "recIndex", "recTitle", "status", "updatedAt" FROM "CampaignDraft";
DROP TABLE "CampaignDraft";
ALTER TABLE "new_CampaignDraft" RENAME TO "CampaignDraft";
CREATE INDEX "CampaignDraft_analysisId_recIndex_idx" ON "CampaignDraft"("analysisId", "recIndex");
CREATE INDEX "CampaignDraft_parentDraftId_idx" ON "CampaignDraft"("parentDraftId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
