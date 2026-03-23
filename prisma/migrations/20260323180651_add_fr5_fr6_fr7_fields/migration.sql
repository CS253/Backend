-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "inviteLinkStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "preAddedParticipants" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';
