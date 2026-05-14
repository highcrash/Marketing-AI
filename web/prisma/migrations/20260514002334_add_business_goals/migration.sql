-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "goalTags" TEXT NOT NULL DEFAULT '[]',
    "goalNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Business" ("apiKey", "baseUrl", "createdAt", "id", "name", "updatedAt") SELECT "apiKey", "baseUrl", "createdAt", "id", "name", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_baseUrl_key" ON "Business"("baseUrl");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
