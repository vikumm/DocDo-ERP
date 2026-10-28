-- Sessões de segmentação (mapeamento usuário/clínica ↔ sessão do serviço interno) e artefatos salvos em casos.

-- CreateEnum
CREATE TYPE "SegArtifactKind" AS ENUM ('volume', 'labelmap');

-- CreateTable
CREATE TABLE "SegSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegArtifact" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "SegArtifactKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SegSession_userId_idx" ON "SegSession"("userId");
CREATE INDEX "SegSession_organizationId_idx" ON "SegSession"("organizationId");
CREATE INDEX "SegArtifact_caseId_idx" ON "SegArtifact"("caseId");

-- AddForeignKey
ALTER TABLE "SegSession" ADD CONSTRAINT "SegSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SegSession" ADD CONSTRAINT "SegSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SegSession" ADD CONSTRAINT "SegSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SegArtifact" ADD CONSTRAINT "SegArtifact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── RLS (mesma convenção das demais tabelas) ─────────
-- SegSession: dono, clínica do usuário ou, se vinculada a um caso visível, quem vê o caso.
ALTER TABLE "SegSession" ENABLE ROW LEVEL SECURITY;

CREATE POLICY segsession_select ON "SegSession" FOR SELECT TO docdo_app USING (
  app_bypass()
  OR "userId" = app_user_id()
  OR "organizationId" = ANY (app_org_ids())
  OR ("caseId" IS NOT NULL AND app_case_visible("caseId", false))
);
CREATE POLICY segsession_insert ON "SegSession" FOR INSERT TO docdo_app WITH CHECK (
  app_bypass() OR "userId" = app_user_id()
);
CREATE POLICY segsession_update ON "SegSession" FOR UPDATE TO docdo_app
USING (app_bypass() OR "userId" = app_user_id())
WITH CHECK (app_bypass() OR "userId" = app_user_id());
CREATE POLICY segsession_delete ON "SegSession" FOR DELETE TO docdo_app USING (app_bypass());

-- SegArtifact: tabela filha de Case — herda a visibilidade do caso.
ALTER TABLE "SegArtifact" ENABLE ROW LEVEL SECURITY;

CREATE POLICY segartifact_select ON "SegArtifact" FOR SELECT TO docdo_app USING (app_case_visible("caseId", false));
CREATE POLICY segartifact_insert ON "SegArtifact" FOR INSERT TO docdo_app WITH CHECK (app_case_visible("caseId", false));
CREATE POLICY segartifact_update ON "SegArtifact" FOR UPDATE TO docdo_app
USING (app_case_visible("caseId", false)) WITH CHECK (app_case_visible("caseId", false));
CREATE POLICY segartifact_delete ON "SegArtifact" FOR DELETE TO docdo_app USING (app_case_visible("caseId", false));
