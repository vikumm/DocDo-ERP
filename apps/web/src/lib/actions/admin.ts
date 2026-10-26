"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CaseStatus, OrderStatus } from "@docdo/contracts";
import { api, apiAction, ApiError, formBody } from "@/lib/api";
import type { ActionState } from "./types";

const enc = encodeURIComponent;

// ───────────── usuários ─────────────

const listFor = (role: unknown) => (role === "DOCTOR" ? "/admin/medicos" : role === "PATIENT" ? "/admin/pacientes" : "/admin");

export async function saveUser(userId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const body = formBody(form);
  if (userId) {
    const r = await apiAction(`/admin/users/${enc(userId)}`, { method: "PATCH", body });
    revalidatePath(listFor(body.role));
    revalidatePath(`/admin/usuarios/${userId}`);
    return r;
  }
  const r = await apiAction("/admin/users", { body });
  if (r.error) return r;
  redirect(listFor(body.role));
}

export async function adminSendPasswordReset(userId: string): Promise<ActionState> {
  return apiAction(`/admin/users/${enc(userId)}/reset-password`, { body: {} });
}

export async function approveDoctor(userId: string): Promise<ActionState> {
  const r = await apiAction(`/admin/users/${enc(userId)}/approve`, { body: {} });
  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/admin/medicos");
  revalidatePath("/admin");
  return r;
}

/** LGPD: eliminação dos dados do titular (feita pela API). */
export async function anonymizeUser(userId: string): Promise<ActionState> {
  let role: string | undefined;
  try {
    ({ role } = await api<{ role: string }>(`/admin/users/${enc(userId)}/anonymize`, { body: {} }));
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin");
  redirect(listFor(role));
}

export async function toggleUserActive(userId: string) {
  await apiAction(`/admin/users/${enc(userId)}/toggle`, { body: {} });
  revalidatePath("/admin/medicos");
  revalidatePath("/admin/pacientes");
}

// ───────────── casos ─────────────

export async function adminCreateCase(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    ({ id } = await api<{ id: string }>("/admin/cases", { body: formBody(form) }));
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return { error: e.message };
    throw e;
  }
  redirect(`/admin/casos/${id}`);
}

export async function adminUpdateCase(caseId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction(`/admin/cases/${enc(caseId)}`, { method: "PATCH", body: formBody(form) });
  revalidatePath(`/admin/casos/${caseId}`);
  return r;
}

export async function setCaseStatus(caseId: string, status: CaseStatus) {
  await apiAction(`/admin/cases/${enc(caseId)}/status`, { body: { status } });
  revalidatePath(`/admin/casos/${caseId}`);
  revalidatePath("/admin/casos");
}

export async function updateGallery(caseId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction(`/admin/cases/${enc(caseId)}/gallery`, { method: "PATCH", body: formBody(form) });
  revalidatePath(`/admin/casos/${caseId}`);
  revalidatePath("/galeria");
  return r;
}

export async function deleteCase(caseId: string) {
  await apiAction(`/admin/cases/${enc(caseId)}`, { method: "DELETE" });
  revalidatePath("/admin/casos");
  redirect("/admin/casos");
}

// ───────────── modelos 3D ─────────────

export async function updateModel(modelId: string, form: FormData) {
  await apiAction(`/admin/models/${enc(modelId)}`, { method: "PATCH", body: formBody(form) });
  revalidatePath("/admin/casos", "layout");
}

export async function deleteModel(modelId: string) {
  await apiAction(`/admin/models/${enc(modelId)}`, { method: "DELETE" });
  revalidatePath("/admin/casos", "layout");
}

// ───────────── compras ─────────────

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  await apiAction(`/admin/orders/${enc(orderId)}/status`, { body: { status } });
  revalidatePath("/admin/compras");
  revalidatePath("/admin/casos", "layout");
}

export async function markMessageRead(id: string) {
  await apiAction(`/admin/messages/${enc(id)}/read`, { body: {} });
  revalidatePath("/admin");
}

// ───────────── acesso ao caso ─────────────

export async function grantCaseAccess(caseId: string, userId: string): Promise<ActionState> {
  const r = await apiAction(`/admin/cases/${enc(caseId)}/access`, { body: { userId } });
  revalidatePath(`/admin/casos/${caseId}`);
  return r;
}

export async function revokeCaseAccess(caseId: string, userId: string): Promise<ActionState> {
  const r = await apiAction(`/admin/cases/${enc(caseId)}/access/${enc(userId)}`, { method: "DELETE" });
  revalidatePath(`/admin/casos/${caseId}`);
  return r;
}
