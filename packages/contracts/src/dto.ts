// Formato das respostas da API /v1. Datas chegam como string ISO; tamanhos de arquivo como number.
import type { AccessAction, CaseStatus, ExamType, OrderStatus, OrgRole, Plan, Role } from "./enums.js";

export type ISODate = string;

/** Resposta de erro padrão da API. */
export type ApiErrorBody = { error: string };
/** Resultado de ações de formulário. */
export type ActionResult = { ok?: string; error?: string };

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  cpf: string | null;
  crm: string | null;
  specialty: string | null;
  institution: string | null;
  active: boolean;
  emailVerifiedAt: ISODate | null;
  approvedAt: ISODate | null;
  consentAt: ISODate | null;
  consentVersion: string | null;
  deletionRequestedAt: ISODate | null;
  totpEnabledAt: ISODate | null;
  recoveryCodesLeft: number;
  createdAt: ISODate;
};

export type MembershipDTO = { organizationId: string; organizationName: string; role: OrgRole };

export type MeDTO = {
  user: UserDTO;
  memberships: MembershipDTO[];
  /** Clínica em uso nesta sessão (a escolhida pelo front, conferida contra os vínculos). */
  currentOrg: MembershipDTO | null;
  /** Admin com 2FA ativo. */
  adminReady: boolean;
  /** Médico ainda não aprovado pelo admin. */
  pendingDoctor: boolean;
};

export type PersonRef = { id: string; name: string; email?: string; role?: Role };

// ───────── autenticação ─────────

export type LoginResult = { status: "ok"; token: string; role: Role } | { status: "2fa"; challenge: string };
export type SessionResult = { token: string; role: Role };
export type TokenInfo = { purpose: "VERIFY" | "RESET" | "INVITE"; name: string; email: string; role: Role; needsConsent: boolean; organizationName?: string | null };

export type SessionDTO = { id: string; current: boolean; createdAt: ISODate; ip: string | null; userAgent: string | null };

export type TotpStatusDTO =
  | { enabled: true; enabledAt: ISODate; recoveryCodesLeft: number }
  | { enabled: false; pending: false }
  | { enabled: false; pending: true; secret: string; qrDataUrl: string };
export type TotpResult = ActionResult & { recoveryCodes?: string[] };

// ───────── casos ─────────

export type ViewerModelDTO = { id: string; name: string; url: string; format: string; color: string; opacity: number; volumeMl: number | null };

export type CaseListItemDTO = {
  id: string;
  code: number;
  title: string;
  examType: ExamType;
  bodyRegion: string | null;
  status: CaseStatus;
  plan: Plan;
  isPublic: boolean;
  createdAt: ISODate;
  patient: { name: string } | null;
  doctor: { name: string } | null;
  organization: { name: string } | null;
};

export type CaseListDTO = { cases: CaseListItemDTO[]; counts: Partial<Record<CaseStatus, number>> };

export type DicomFileDTO = { id: string; originalName: string; size: number; createdAt: ISODate };
export type OrderDTO = {
  id: string;
  plan: Plan;
  amount: number;
  status: OrderStatus;
  method: string | null;
  createdAt: ISODate;
  paidAt: ISODate | null;
  user?: { name: string; role: Role };
  case?: { id: string; title: string; code: number };
};
export type EventDTO = { id: string; message: string; createdAt: ISODate; user: { name: string } | null };
export type AccessLogDTO = { id: string; action: AccessAction; detail: string | null; ip: string | null; createdAt: ISODate; user: { name: string; role: Role } | null };
export type ShareDTO = { userId: string; name: string; email: string; role: Role };

export type CaseDetailDTO = {
  id: string;
  code: number;
  title: string;
  /** null quando o perfil não pode ver conteúdo clínico (secretária). */
  description: string | null;
  examType: ExamType;
  bodyRegion: string | null;
  status: CaseStatus;
  plan: Plan;
  createdAt: ISODate;
  organization: { id: string; name: string } | null;
  patient: { name: string; email: string } | null;
  doctor: { name: string; email: string; crm: string | null; specialty: string | null } | null;
  createdById: string | null;
  /** Perfil sem acesso clínico: sem 3D, sem descrição, sem download de DICOM. */
  restricted: boolean;
  canUpload: boolean;
  canShare: boolean;
  dicomFiles: DicomFileDTO[];
  models: ViewerModelDTO[];
  orders: OrderDTO[];
  shares: ShareDTO[];
  events: EventDTO[];
  accessLogs: AccessLogDTO[];
};

export type GalleryCaseDTO = {
  id: string;
  title: string;
  description: string | null;
  examType: ExamType;
  bodyRegion: string | null;
  views: number;
  models: { name: string; color: string }[];
};

export type FeaturedDTO = { id: string; title: string; models: ViewerModelDTO[] } | null;

export type ViewerDTO = { id: string; title: string; subtitle: string; models: ViewerModelDTO[]; back: string };

// ───────── clínica ─────────

export type TeamMemberDTO = { userId: string; name: string; email: string; role: OrgRole; pending: boolean; createdAt: ISODate };
export type OrgPatientDTO = { id: string; name: string; email: string; cases: number; lastCaseAt: ISODate };

// ───────── admin ─────────

export type AdminDashboardDTO = {
  doctors: number;
  patients: number;
  secretaries: number;
  organizations: number;
  byStatus: Partial<Record<CaseStatus, number>>;
  paidTotal: number;
  paidCount: number;
  revenue: { label: string; value: number; count: number }[];
  queue: (CaseListItemDTO & { doctor: { name: string } | null })[];
  pendingOrders: OrderDTO[];
  messages: { id: string; name: string; email: string | null; phone: string | null; message: string; createdAt: ISODate }[];
  pendingDoctors: { id: string; name: string; crm: string | null; createdAt: ISODate }[];
  deletionRequests: { id: string; name: string; deletionRequestedAt: ISODate }[];
};

export type AdminUserRowDTO = UserDTO & { cases: number; paid: number };

export type AdminCaseDTO = {
  id: string;
  code: number;
  title: string;
  description: string | null;
  examType: ExamType;
  bodyRegion: string | null;
  status: CaseStatus;
  plan: Plan;
  isPublic: boolean;
  publicTitle: string | null;
  publicDescription: string | null;
  views: number;
  adminNotes: string | null;
  createdAt: ISODate;
  organization: { id: string; name: string } | null;
  patient: (PersonRef & { email: string }) | null;
  doctor: (PersonRef & { email: string }) | null;
  dicomFiles: DicomFileDTO[];
  models: (ViewerModelDTO & { sortOrder: number; size: number })[];
  orders: OrderDTO[];
  events: EventDTO[];
  accessLogs: AccessLogDTO[];
  shares: ShareDTO[];
};

export type OrganizationRowDTO = { id: string; name: string; createdAt: ISODate; members: TeamMemberDTO[]; cases: number };

export type UserSearchDTO = { id: string; name: string; email: string; role: "DOCTOR" | "PATIENT"; crm: string | null; specialty: string | null };
