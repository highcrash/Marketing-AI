-- CreateTable
CREATE TABLE "FacebookConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastValidatedAt" DATETIME,
    "lastValidationError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FacebookConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FacebookPostEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "draftId" TEXT,
    "pieceIndex" INTEGER,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerPostId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FacebookPostEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FacebookPostEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FacebookConnection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FacebookConnection_businessId_active_idx" ON "FacebookConnection"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FacebookConnection_businessId_pageId_key" ON "FacebookConnection"("businessId", "pageId");

-- CreateIndex
CREATE INDEX "FacebookPostEvent_businessId_createdAt_idx" ON "FacebookPostEvent"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "FacebookPostEvent_connectionId_createdAt_idx" ON "FacebookPostEvent"("connectionId", "createdAt");
