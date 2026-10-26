"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { LoginResult, Role, SessionResult } from "@docdo/contracts";
import { api, apiAction, ApiError, CHALLENGE_COOKIE, cookieOptions, formBody, ORG_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/api";
import { homeFor } from "@/lib/auth";
import type { ActionState } from "./types";

function safeNext(next: FormDataEntryValue | null, home: string) {
  const n = typeof next === "string" ? next : "";
  const ok = n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\");
  // só respeita o "next" se ele estiver na área do perfil do usuário
  return ok && n.startsWith(home) ? n : home;
}

async function startSession(token: string) {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE));
  c.delete(ORG_COOKIE);
  c.delete(CHALLENGE_COOKIE);
}

/** Erros de negócio (4xx) voltam ao formulário; o resto sobe. */
async function attempt<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return { error: e.message };
    throw e;
  }
}

export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await attempt(() => api<LoginResult>("/auth/login", { body: { email: form.get("email"), password: form.get("password") } }));
  if ("error" in r) return r;
  if (r.status === "2fa") {
    (await cookies()).set(CHALLENGE_COOKIE, r.challenge, cookieOptions(300));
    redirect(`/entrar/2fa?next=${encodeURIComponent(String(form.get("next") ?? ""))}`);
  }
  await startSession(r.token);
  redirect(safeNext(form.get("next"), homeFor(r.role)));
}

export async function loginSecondFactor(_: ActionState, form: FormData): Promise<ActionState> {
  const challenge = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!challenge) return { error: "A etapa expirou. Entre com e-mail e senha de novo." };
  const r = await attempt(() => api<SessionResult>("/auth/2fa", { body: { challenge, code: form.get("code") } }));
  if ("error" in r) return r;
  await startSession(r.token);
  redirect(safeNext(form.get("next"), homeFor(r.role as Role)));
}

export async function register(_: ActionState, form: FormData): Promise<ActionState> {
  return apiAction("/auth/register", { body: formBody(form) });
}

/** POST disparado pelo botão da página do link (um GET seria consumido por antivírus de e-mail). */
export async function confirmEmail(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await attempt(() => api<SessionResult>("/auth/verify", { body: { token: form.get("token") } }));
  if ("error" in r) return r;
  await startSession(r.token);
  redirect(homeFor(r.role));
}

export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  return apiAction("/auth/password/forgot", { body: { email: form.get("email") } });
}

export async function resetPassword(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await apiAction("/auth/password/reset", { body: formBody(form) });
  if (r.error) return r;
  redirect("/entrar?senha=1");
}

export async function logout() {
  await api("/auth/logout", { method: "POST", body: {} }).catch(() => null);
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  c.delete(ORG_COOKIE);
  redirect("/");
}

/** Troca a clínica em uso (médico ou secretária em mais de uma). A API confere o vínculo a cada chamada. */
export async function switchOrg(form: FormData) {
  const id = String(form.get("organizationId") ?? "").slice(0, 60);
  (await cookies()).set(ORG_COOKIE, id, cookieOptions(SESSION_MAX_AGE));
  redirect("/painel");
}
