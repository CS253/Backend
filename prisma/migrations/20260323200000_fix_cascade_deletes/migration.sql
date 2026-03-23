-- Drop existing foreign key constraints that don't have cascade delete
ALTER TABLE "GroupMember" DROP CONSTRAINT "GroupMember_groupId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_groupId_fkey";
ALTER TABLE "ExpenseSplit" DROP CONSTRAINT "ExpenseSplit_expenseId_fkey";
ALTER TABLE "Settlement" DROP CONSTRAINT "Settlement_groupId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_groupId_fkey";
ALTER TABLE "Media" DROP CONSTRAINT "Media_groupId_fkey";

-- Re-create foreign key constraints WITH cascade delete
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseSplit" ADD CONSTRAINT "ExpenseSplit_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Media" ADD CONSTRAINT "Media_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the status and deletedAt columns that we don't need for hard delete
ALTER TABLE "Group" DROP COLUMN "status";
ALTER TABLE "Group" DROP COLUMN "deletedAt";
