import type { AccessAction, CaseStatus, ExamType, OrderStatus, OrgRole, Plan, Role } from "./enums.js";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  DOCTOR: "Médico",
  PATIENT: "Paciente",
  SECRETARY: "Secretária",
};

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: "Médico titular",
  DOCTOR: "Médico",
  SECRETARY: "Secretária",
};

export const ACCESS_LABEL: Record<AccessAction, string> = {
  VIEW_CASE: "abriu o caso",
  VIEW_3D: "abriu o visualizador 3D",
  DOWNLOAD_DICOM: "baixou um arquivo DICOM",
};

export const EXAM_LABEL: Record<ExamType, string> = {
  CT: "Tomografia",
  MRI: "Ressonância",
  US: "Ultrassom",
  OTHER: "Outro",
};

export const STATUS_LABEL: Record<CaseStatus, string> = {
  CREATED: "Aguardando DICOM",
  UPLOADED: "Aguardando pagamento",
  PAID: "Pago · na fila",
  PROCESSING: "Em reconstrução",
  READY: "3D pronto",
  CANCELLED: "Cancelado",
};

export const STATUS_TONE: Record<CaseStatus, "neutral" | "warn" | "info" | "accent" | "ok" | "danger"> = {
  CREATED: "neutral",
  UPLOADED: "warn",
  PAID: "info",
  PROCESSING: "accent",
  READY: "ok",
  CANCELLED: "danger",
};

export const STATUS_FLOW: CaseStatus[] = ["CREATED", "UPLOADED", "PAID", "PROCESSING", "READY"];

export const ORDER_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  CANCELLED: "Cancelado",
  REFUNDED: "Estornado",
};

export const ORDER_TONE: Record<OrderStatus, "warn" | "ok" | "danger" | "neutral"> = {
  PENDING: "warn",
  PAID: "ok",
  CANCELLED: "danger",
  REFUNDED: "neutral",
};

/** Planos por rim reconstruído. */
export const PLANS: Record<Plan, { name: string; short: string; price: number; description: string; features: string[] }> = {
  UNILATERAL: {
    name: "Rim unilateral",
    short: "Unilateral",
    price: 1000,
    description: "Reconstrução 3D de um rim (direito ou esquerdo)",
    features: ["Rim, lesões e via excretora segmentados", "Artérias e veias renais", "Visualizador web e mobile", "Acesso para médico e paciente", "Medição e volumetria"],
  },
  BILATERAL: {
    name: "Bilateral (os dois rins)",
    short: "Bilateral",
    price: 1500,
    description: "Reconstrução 3D dos dois rins no mesmo caso",
    features: ["Tudo do unilateral, nos dois rins", "Relação entre os lados e os grandes vasos", "Visualizador web e mobile", "Acesso para médico e paciente", "Medição e volumetria"],
  },
};

export const MODEL_FORMATS = ["stl", "obj", "ply", "glb"] as const;

/** Paleta anatômica padrão por nome de estrutura. */
export function defaultColorFor(name: string) {
  const n = name.toLowerCase();
  if (/art[eé]r|aort/.test(n)) return "#e5484d";
  if (/vei|cava|portal/.test(n)) return "#3e63dd";
  if (/tum|les[aã]o|n[oó]dul|mass/.test(n)) return "#f5d90a";
  if (/ure|bexig|blad/.test(n)) return "#f2a65a";
  if (/rim|kidn|ren/.test(n)) return "#c2706a";
  if (/f[ií]gad|liver|hep/.test(n)) return "#8e4a3a";
  if (/oss|bone|vert|cost/.test(n)) return "#efe6d2";
  if (/pulm|lung/.test(n)) return "#f1b8c4";
  return "#b8c4cc";
}

/** Versão da Política de Privacidade aceita no cadastro (registrada em User.consentVersion). */
export const CONSENT_VERSION = "2026-10";
