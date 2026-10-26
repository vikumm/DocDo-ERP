import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MeDTO, Role } from "@docdo/contracts";
import { api, ApiError, SESSION_COOKIE } from "./api";

export const homeFor = (role: Role) => (role === "ADMIN" ? "/admin" : "/painel");

/** Usuário atual, validado na API (sessão no banco, conta ativa, e-mail confirmado). */
export const getMe = cache(async (): Promise<MeDTO | null> => {
  if (!(await cookies()).get(SESSION_COOKIE)) return null;
  try {
    return await api<MeDTO>("/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});

/** Exige sessão (e perfil). Admin sem 2FA vai para a configuração antes de ver qualquer dado. */
export async function requireMe(roles?: Role[]) {
  const me = await getMe();
  if (!me) redirect("/entrar");
  if (roles && !roles.includes(me.user.role)) redirect(homeFor(me.user.role));
  if (me.user.role === "ADMIN" && !me.adminReady && roles?.includes("ADMIN")) redirect("/seguranca/2fa");
  return me;
}
