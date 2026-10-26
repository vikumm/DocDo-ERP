"use server";
import { revalidatePath } from "next/cache";
import { apiAction, formBody } from "@/lib/api";
import type { ActionState } from "./types";

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction("/me/profile", { method: "PATCH", body: formBody(form) });
  revalidatePath("/painel/perfil");
  return r;
}

export async function changePassword(_: ActionState, form: FormData): Promise<ActionState> {
  return apiAction("/me/password", { body: formBody(form) });
}

/** Encerra as sessões dos outros aparelhos e mantém a atual. */
export async function signOutOtherDevices() {
  await apiAction("/me/sessions/revoke-others", { body: {} });
  revalidatePath("/painel/perfil");
}
