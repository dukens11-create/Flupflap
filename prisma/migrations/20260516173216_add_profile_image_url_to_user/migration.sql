-- AlterTable: add optional profile image URL to User
-- This column was added to prisma/schema.prisma in PR #245 but the
-- corresponding migration was not committed, causing production errors:
--   PrismaClientKnownRequestError: The column User.profileImageUrl does not exist
-- Running `prisma migrate deploy` after merging this file fixes the mismatch.
ALTER TABLE "User" ADD COLUMN "profileImageUrl" TEXT;
