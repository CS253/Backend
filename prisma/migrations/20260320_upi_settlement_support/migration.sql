CREATE TYPE "SettlementMethod" AS ENUM ('UPI', 'MANUAL');
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

ALTER TABLE "User"
ADD COLUMN "phone" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Settlement"
ADD COLUMN "method" "SettlementMethod" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "transactionId" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "upiUrl" TEXT,
ADD COLUMN "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmedBy" TEXT;

ALTER TABLE "GroupMember"
ADD CONSTRAINT "GroupMember_userId_groupId_key" UNIQUE ("userId", "groupId");

ALTER TABLE "Settlement"
ADD CONSTRAINT "Settlement_fromUserId_fkey"
FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Settlement"
ADD CONSTRAINT "Settlement_toUserId_fkey"
FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Settlement"
ADD CONSTRAINT "Settlement_confirmedBy_fkey"
FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ExpenseSplit_expenseId_userId_idx" ON "ExpenseSplit"("expenseId", "userId");
CREATE INDEX "Settlement_groupId_status_idx" ON "Settlement"("groupId", "status");
CREATE INDEX "Settlement_fromUserId_toUserId_groupId_idx" ON "Settlement"("fromUserId", "toUserId", "groupId");
