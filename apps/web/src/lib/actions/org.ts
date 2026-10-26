"use server";
import { revalidatePath } from "next/cache";
import { apiAction, formBody } from "@/lib/api";
import type { ActionState } from "./types";

export async function inviteSecretary(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction("/org/secretaries", { body: formBody(form) });
  revalidatePath("/painel/equipe");
  return r;
}

export async function removeMember(userId: string) {
  const r = await apiAction(`/org/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
  revalidatePath("/painel/equipe");
  return r;
}

export async function renameOrg(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction("/org", { method: "PATCH", body: { name: form.get("name") } });
  revalidatePath("/painel", "layout");
  return r;
}
