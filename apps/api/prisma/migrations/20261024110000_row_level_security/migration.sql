-- Row-Level Security: o isolamento entre clínicas é garantido pelo Postgres, não só pela API.
-- A API conecta com o papel docdo_app (sem superusuário, sem BYPASSRLS). Cada transação define:
--   app.user_id        id do usuário autenticado (vazio = anônimo)
--   app.org_ids        clínicas do usuário, separadas por vírgula
--   app.owner_org_ids  clínicas em que ele é o médico titular
--   app.bypass         'on' só para o admin com 2FA e tarefas internas (login, tokens)
-- Sem contexto, o banco só devolve casos públicos (e seus modelos 3D).

-- ───────── papel da aplicação (a senha e o LOGIN são definidos por scripts/db-app-role.sh) ─────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'docdo_app') THEN
    CREATE ROLE docdo_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO docdo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO docdo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO docdo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO docdo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO docdo_app;
REVOKE ALL ON "_prisma_migrations" FROM docdo_app;

-- ───────── contexto ─────────
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_org_ids() RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('app.org_ids', true), ''), ','), ARRAY[]::text[])
$$;

CREATE OR REPLACE FUNCTION app_owner_org_ids() RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('app.owner_org_ids', true), ''), ','), ARRAY[]::text[])
$$;

CREATE OR REPLACE FUNCTION app_bypass() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass', true), '') = 'on'
$$;

-- As duas funções abaixo leem tabelas protegidas como dono (SECURITY DEFINER) para que as
-- políticas de Case e das tabelas filhas não dependam umas das outras (evita recursão).
CREATE OR REPLACE FUNCTION app_case_shared(cid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "CaseShare" s WHERE s."caseId" = cid AND s."userId" = app_user_id())
$$;

-- include_public: casos públicos contam (só para ler modelos 3D da galeria)
CREATE OR REPLACE FUNCTION app_case_visible(cid text, include_public boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Case" c
    WHERE c."id" = cid AND (
      app_bypass()
      OR (include_public AND c."isPublic")
      OR c."organizationId" = ANY (app_org_ids())
      OR c."patientId" = app_user_id()
      OR c."doctorId" = app_user_id()
      OR c."createdById" = app_user_id()
      OR app_case_shared(c."id")
    )
  )
$$;

REVOKE ALL ON FUNCTION app_case_shared(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_case_visible(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_case_shared(text), app_case_visible(text, boolean) TO docdo_app;

-- ───────── Case ─────────
ALTER TABLE "Case" ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_select ON "Case" FOR SELECT TO docdo_app USING (
  app_bypass() OR "isPublic"
  OR "organizationId" = ANY (app_org_ids())
  OR "patientId" = app_user_id() OR "doctorId" = app_user_id() OR "createdById" = app_user_id()
  OR app_case_shared("id")
);

CREATE POLICY case_insert ON "Case" FOR INSERT TO docdo_app WITH CHECK (
  app_bypass() OR "createdById" = app_user_id() OR "organizationId" = ANY (app_org_ids())
);

CREATE POLICY case_update ON "Case" FOR UPDATE TO docdo_app
USING (
  app_bypass()
  OR "organizationId" = ANY (app_org_ids())
  OR "patientId" = app_user_id() OR "doctorId" = app_user_id() OR "createdById" = app_user_id()
  OR app_case_shared("id")
)
WITH CHECK (
  app_bypass()
  OR "organizationId" = ANY (app_org_ids())
  OR "patientId" = app_user_id() OR "doctorId" = app_user_id() OR "createdById" = app_user_id()
  OR app_case_shared("id")
);

CREATE POLICY case_delete ON "Case" FOR DELETE TO docdo_app USING (app_bypass());

-- ───────── tabelas filhas: herdam a visibilidade do caso ─────────
-- Model3D é a única legível em casos públicos (galeria). As demais nunca aparecem para anônimos.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['DicomFile', 'Model3D', 'Order', 'CaseEvent', 'CaseShare', 'AccessLog'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %s ON %I FOR SELECT TO docdo_app USING (app_case_visible("caseId", %s))',
      lower(t) || '_select', t, CASE WHEN t = 'Model3D' THEN 'true' ELSE 'false' END
    );
    EXECUTE format('CREATE POLICY %s ON %I FOR INSERT TO docdo_app WITH CHECK (app_case_visible("caseId", false))', lower(t) || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %s ON %I FOR UPDATE TO docdo_app USING (app_case_visible("caseId", false)) WITH CHECK (app_case_visible("caseId", false))',
      lower(t) || '_update', t
    );
    EXECUTE format('CREATE POLICY %s ON %I FOR DELETE TO docdo_app USING (app_case_visible("caseId", false))', lower(t) || '_delete', t);
  END LOOP;
END $$;

-- ───────── Organization e Membership ─────────
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;

-- quem participa de um caso da clínica vê o nome dela (ex.: o paciente vê "Consultório de …")
CREATE POLICY organization_select ON "Organization" FOR SELECT TO docdo_app USING (
  app_bypass() OR "id" = ANY (app_org_ids())
  OR EXISTS (SELECT 1 FROM "Case" c WHERE c."organizationId" = "Organization"."id")
);
CREATE POLICY organization_insert ON "Organization" FOR INSERT TO docdo_app WITH CHECK (app_bypass());
CREATE POLICY organization_update ON "Organization" FOR UPDATE TO docdo_app
  USING (app_bypass() OR "id" = ANY (app_owner_org_ids()))
  WITH CHECK (app_bypass() OR "id" = ANY (app_owner_org_ids()));
CREATE POLICY organization_delete ON "Organization" FOR DELETE TO docdo_app USING (app_bypass());

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_select ON "Membership" FOR SELECT TO docdo_app USING (
  app_bypass() OR "userId" = app_user_id() OR "organizationId" = ANY (app_org_ids())
);
-- só o titular gerencia a equipe da própria clínica
CREATE POLICY membership_insert ON "Membership" FOR INSERT TO docdo_app WITH CHECK (app_bypass() OR "organizationId" = ANY (app_owner_org_ids()));
CREATE POLICY membership_update ON "Membership" FOR UPDATE TO docdo_app
  USING (app_bypass() OR "organizationId" = ANY (app_owner_org_ids()))
  WITH CHECK (app_bypass() OR "organizationId" = ANY (app_owner_org_ids()));
CREATE POLICY membership_delete ON "Membership" FOR DELETE TO docdo_app USING (app_bypass() OR "organizationId" = ANY (app_owner_org_ids()));
