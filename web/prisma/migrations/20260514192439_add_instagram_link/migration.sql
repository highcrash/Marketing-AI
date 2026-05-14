-- AlterTable
ALTER TABLE "FacebookConnection" ADD COLUMN "instagramBusinessId" TEXT;
ALTER TABLE "FacebookConnection" ADD COLUMN "instagramUsername" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FacebookPostEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "draftId" TEXT,
    "pieceIndex" INTEGER,
    "message" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'facebook',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerPostId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FacebookPostEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FacebookPostEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FacebookConnection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FacebookPostEvent" ("businessId", "connectionId", "createdAt", "draftId", "error", "id", "message", "pieceIndex", "providerPostId", "status", "updatedAt") SELECT "businessId", "connectionId", "createdAt", "draftId", "error", "id", "message", "pieceIndex", "providerPostId", "status", "updatedAt" FROM "FacebookPostEvent";
DROP TABLE "FacebookPostEvent";
ALTER TABLE "new_FacebookPostEvent" RENAME TO "FacebookPostEvent";
CREATE INDEX "FacebookPostEvent_businessId_createdAt_idx" ON "FacebookPostEvent"("businessId", "createdAt");
CREATE INDEX "FacebookPostEvent_connectionId_createdAt_idx" ON "FacebookPostEvent"("connectionId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
