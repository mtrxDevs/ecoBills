-- Map application users to Managed Neon Auth subjects. Existing custom auth
-- columns/tables are intentionally retained for non-destructive migration.
ALTER TABLE "User" ADD COLUMN "neonAuthId" TEXT;

CREATE UNIQUE INDEX "User_neonAuthId_key" ON "User"("neonAuthId");
