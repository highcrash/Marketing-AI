-- CreateTable
CREATE TABLE "PieceCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "pieceIndex" INTEGER NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PieceCompletion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CampaignDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PieceCompletion_completedAt_idx" ON "PieceCompletion"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PieceCompletion_draftId_pieceIndex_key" ON "PieceCompletion"("draftId", "pieceIndex");
