-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'DOCTOR', 'SECRETARY');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SECRETARY';

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "organizationId" TEXT;

-- Sessões no formato antigo (cookie JWT) deixam de valer: todos entram de novo.
DELETE FROM "Session";
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "tokenHash" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Case_organizationId_idx" ON "Case"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───────── dados existentes ─────────
-- Cada médico vira titular de um consultório; os casos em que ele é o médico passam a pertencer a esse consultório.
INSERT INTO "Organization" ("id", "name", "createdAt", "updatedAt")
SELECT 'org_' || u."id", 'Consultório de ' || u."name", NOW(), NOW() FROM "User" u WHERE u."role" = 'DOCTOR';

INSERT INTO "Membership" ("id", "organizationId", "userId", "role", "createdAt")
SELECT 'mem_' || u."id", 'org_' || u."id", u."id", 'OWNER', NOW() FROM "User" u WHERE u."role" = 'DOCTOR';

UPDATE "Case" c SET "organizationId" = 'org_' || c."doctorId"
WHERE c."doctorId" IS NOT NULL AND EXISTS (SELECT 1 FROM "Organization" o WHERE o."id" = 'org_' || c."doctorId");
