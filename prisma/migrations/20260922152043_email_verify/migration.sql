-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('two_factor', 'email_verify');

-- AlterTable
ALTER TABLE "TwoFactorChallenge" ADD COLUMN     "purpose" "ChallengePurpose" NOT NULL DEFAULT 'two_factor';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;
