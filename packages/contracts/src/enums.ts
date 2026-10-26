// Espelham os enums do schema Prisma da API. O front não depende do Prisma.
export const ROLES = ["ADMIN", "DOCTOR", "PATIENT", "SECRETARY"] as const;
export type Role = (typeof ROLES)[number];

export const ORG_ROLES = ["OWNER", "DOCTOR", "SECRETARY"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const EXAM_TYPES = ["CT", "MRI", "US", "OTHER"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const CASE_STATUSES = ["CREATED", "UPLOADED", "PAID", "PROCESSING", "READY", "CANCELLED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PLAN_KEYS = ["UNILATERAL", "BILATERAL"] as const;
export type Plan = (typeof PLAN_KEYS)[number];

export const ORDER_STATUSES = ["PENDING", "PAID", "CANCELLED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ACCESS_ACTIONS = ["VIEW_CASE", "VIEW_3D", "DOWNLOAD_DICOM"] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];
