"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiAction, ORG_COOKIE, SESSION_COOKIE } from "@/lib/api";
import { getMe, homeFor } from "@/lib/auth";
import type { ActionState } from "./types";

/** Aceite da política para contas antigas (anteriores ao registro de consentimento). */
export async function acceptConsent(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction("/me/consent", { body: { consent: form.get("consent") } });
  if (r.error) return r;
  const me = await getMe();
  redirect(me ? homeFor(me.user.role) : "/entrar");
}

/** Pedido de exclusão (LGPD): a API desativa a conta e encerra as sessões. */
export async function requestDeletion(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction("/me/deletion", { body: { password: form.get("password") } });
  if (r.error) return r;
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  c.delete(ORG_COOKIE);
  redirect("/?conta-excluida=1");
}
