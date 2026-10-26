import type { Model3D, User } from "@prisma/client";
import type { UserDTO, ViewerModelDTO } from "@docdo/contracts";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Nunca expõe hash de senha, segredo do 2FA nem os hashes dos códigos de recuperação. */
export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    cpf: u.cpf,
    crm: u.crm,
    specialty: u.specialty,
    institution: u.institution,
    active: u.active,
    emailVerifiedAt: iso(u.emailVerifiedAt),
    approvedAt: iso(u.approvedAt),
    consentAt: iso(u.consentAt),
    consentVersion: u.consentVersion,
    deletionRequestedAt: iso(u.deletionRequestedAt),
    totpEnabledAt: iso(u.totpEnabledAt),
    recoveryCodesLeft: u.recoveryCodes.length,
    createdAt: u.createdAt.toISOString(),
  };
}

/** URL relativa ao front: o navegador busca o modelo pelo BFF, nunca direto na API. */
export const toViewerModels = (models: Model3D[]): ViewerModelDTO[] =>
  models.map((m) => ({ id: m.id, name: m.name, url: `/api/files/model/${m.id}`, format: m.format, color: m.color, opacity: m.opacity, volumeMl: m.volumeMl }));

// ───── casos ─────
import type { AccessLog, Case, CaseEvent, DicomFile, Order, Organization, Prisma } from "@prisma/client";
import type { AccessLogDTO, CaseListItemDTO, DicomFileDTO, EventDTO, OrderDTO } from "@docdo/contracts";

export const caseListInclude = {
  patient: { select: { name: true } },
  doctor: { select: { name: true } },
  organization: { select: { name: true } },
} satisfies Prisma.CaseInclude;

export function toCaseListItem(c: Case & { patient: { name: string } | null; doctor: { name: string } | null; organization: Pick<Organization, "name"> | null }): CaseListItemDTO {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    examType: c.examType,
    bodyRegion: c.bodyRegion,
    status: c.status,
    plan: c.plan,
    isPublic: c.isPublic,
    createdAt: c.createdAt.toISOString(),
    patient: c.patient,
    doctor: c.doctor,
    organization: c.organization ? { name: c.organization.name } : null,
  };
}

export const toDicomDTO = (f: DicomFile): DicomFileDTO => ({ id: f.id, originalName: f.originalName, size: Number(f.size), createdAt: f.createdAt.toISOString() });

export const toOrderDTO = (
  o: Order & { user?: { name: string; role: User["role"] } | null; case?: { id: string; title: string; code: number } | null },
): OrderDTO => ({
  id: o.id,
  plan: o.plan,
  amount: Number(o.amount),
  status: o.status,
  method: o.method,
  createdAt: o.createdAt.toISOString(),
  paidAt: iso(o.paidAt),
  ...(o.user ? { user: o.user } : {}),
  ...(o.case ? { case: o.case } : {}),
});

export const toEventDTO = (e: CaseEvent & { user: { name: string } | null }): EventDTO => ({ id: e.id, message: e.message, createdAt: e.createdAt.toISOString(), user: e.user });

export const toAccessDTO = (l: AccessLog & { user: { name: string; role: User["role"] } | null }): AccessLogDTO => ({
  id: l.id,
  action: l.action,
  detail: l.detail,
  ip: l.ip,
  createdAt: l.createdAt.toISOString(),
  user: l.user,
});

export const countsByStatus = (rows: { status: Case["status"]; _count: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count]));
