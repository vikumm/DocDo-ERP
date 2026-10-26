"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, apiAction, ApiError, formBody } from "@/lib/api";
import type { ActionState } from "./types";

/** Paciente cria para si; médico e secretária criam para um paciente (a API aplica as regras). */
export async function createCase(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    ({ id } = await api<{ id: string }>("/cases", { body: formBody(form) }));
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return { error: e.message };
    throw e;
  }
  redirect(`/painel/casos/${id}?novo=1`);
}

export async function shareCase(caseId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction(`/cases/${encodeURIComponent(caseId)}/shares`, { body: { email: form.get("email") } });
  revalidatePath(`/painel/casos/${caseId}`);
  return r;
}

export async function unshareCase(caseId: string, userId: string) {
  await apiAction(`/cases/${encodeURIComponent(caseId)}/shares/${encodeURIComponent(userId)}`, { method: "DELETE" });
  revalidatePath(`/painel/casos/${caseId}`);
}

/** Checkout: cria o pedido pendente. A confirmação é feita pelo gateway (webhook) ou pelo admin. */
export async function checkout(caseId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction(`/cases/${encodeURIComponent(caseId)}/checkout`, { body: { plan: form.get("plan"), method: form.get("method") } });
  revalidatePath(`/painel/casos/${caseId}`);
  return r;
}

export async function deleteDicom(caseId: string, fileId: string) {
  await apiAction(`/cases/${encodeURIComponent(caseId)}/dicom/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  revalidatePath(`/painel/casos/${caseId}`);
  revalidatePath(`/admin/casos/${caseId}`);
}
