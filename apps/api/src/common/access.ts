import type { Case, Prisma } from "@prisma/client";
import type { AuthInfo } from "./auth";
import { db } from "./db";

/**
 * Regras de acesso a casos na aplicação. O RLS do banco é a segunda camada: mesmo que um filtro
 * aqui falhe, o Postgres não devolve casos de outras clínicas.
 */
export function caseAccessWhere(a: AuthInfo): Prisma.CaseWhereInput {
  if (a.adminReady) return {};
  const id = a.user.id;
  const orgIds = a.memberships.map((m) => m.organizationId);
  return {
    OR: [
      { patientId: id },
      { doctorId: id },
      { createdById: id },
      { shares: { some: { userId: id } } },
      ...(orgIds.length ? [{ organizationId: { in: orgIds } }] : []),
    ],
  };
}

export const findCase = (a: AuthInfo, caseId: string) => db.case.findFirst({ where: { AND: [{ id: caseId }, caseAccessWhere(a)] } });

const orgRole = (a: AuthInfo, orgId: string | null) => (orgId ? a.memberships.find((m) => m.organizationId === orgId)?.role : undefined);

/** Acesso clínico: 3D, descrição, download do DICOM. A secretária não tem. */
export async function hasClinicalAccess(a: AuthInfo, c: Pick<Case, "id" | "patientId" | "doctorId" | "createdById" | "organizationId">) {
  if (a.adminReady) return true;
  // a secretária nunca tem acesso clínico, nem nos casos que ela mesma abriu em nome do médico
  if (a.user.role === "SECRETARY") return false;
  const id = a.user.id;
  if ([c.patientId, c.doctorId, c.createdById].includes(id)) return true;
  const role = orgRole(a, c.organizationId);
  if (role === "OWNER" || role === "DOCTOR") return true;
  return !!(await db.caseShare.findUnique({ where: { caseId_userId: { caseId: c.id, userId: id } } }));
}

/** Pode operar o caso (enviar DICOM, ver status): acesso clínico ou secretária da clínica. */
export async function canOperate(a: AuthInfo, c: Pick<Case, "id" | "patientId" | "doctorId" | "createdById" | "organizationId">) {
  return orgRole(a, c.organizationId) === "SECRETARY" || hasClinicalAccess(a, c);
}

export const isSecretaryOf = (a: AuthInfo, orgId: string | null) => orgRole(a, orgId) === "SECRETARY";
