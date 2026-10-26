import "server-only";
import { cookies, headers } from "next/headers";
import type { ActionResult } from "@docdo/contracts";

/**
 * Cliente da API para o servidor do front (BFF). O navegador nunca fala com a API:
 * o token de sessão fica num cookie httpOnly e só é enviado daqui, junto com a chave interna.
 */
export const SESSION_COOKIE = "docdo_session";
export const CHALLENGE_COOKIE = "docdo_2fa";
export const ORG_COOKIE = "docdo_org";

const API_URL = (process.env.API_URL ?? "http://127.0.0.1:4005").replace(/\/$/, "");

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** IP do cliente: só repassado quando o front está atrás de um proxy reverso confiável. */
function clientIp(h: Headers) {
  if (process.env.TRUST_PROXY !== "1") return null;
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || null;
}

export async function apiHeaders(extra?: Record<string, string>) {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const out: Record<string, string> = { "x-bff-key": process.env.API_BFF_KEY ?? "", ...extra };
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) out.authorization = `Bearer ${token}`;
  const org = c.get(ORG_COOKIE)?.value;
  if (org) out["x-org-id"] = org;
  const ip = clientIp(h);
  if (ip) out["x-client-ip"] = ip;
  const ua = h.get("user-agent");
  if (ua) out["x-client-ua"] = ua.slice(0, 300);
  return out;
}

/** Chamada bruta (para repassar arquivos em streaming). */
export async function apiFetch(path: string, init: RequestInit & { duplex?: "half" } = {}) {
  return fetch(`${API_URL}/v1${path}`, {
    ...init,
    cache: "no-store",
    redirect: "manual",
    headers: await apiHeaders(init.headers as Record<string, string> | undefined),
  });
}

/** Chamada JSON. Erros viram ApiError com a mensagem da API. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await apiFetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body), headers: { "content-type": "application/json" } } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Erro inesperado");
  return data as T;
}

/** Para ações de formulário: erros de negócio viram { error } em vez de exceção. */
export async function apiAction(path: string, opts: { method?: string; body?: unknown } = {}): Promise<ActionResult> {
  try {
    return await api<ActionResult>(path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return { error: e.message };
    throw e;
  }
}

export const formBody = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
