"use server";
import { revalidatePath } from "next/cache";
import type { TotpResult } from "@docdo/contracts";
import { api, ApiError } from "@/lib/api";

export type TotpState = TotpResult | null;

async function call(path: string, form?: FormData): Promise<TotpState> {
  try {
    return await api<TotpResult>(path, { body: form ? { code: form.get("code") } : {} });
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return { error: e.message };
    throw e;
  }
}

/** Gera um segredo novo (cifrado na API) enquanto o 2FA ainda não está ativo. */
export async function startTotpSetup() {
  await call("/me/2fa/start");
  revalidatePath("/seguranca/2fa");
}

export async function confirmTotpSetup(_: TotpState, form: FormData): Promise<TotpState> {
  return call("/me/2fa/confirm", form);
}

export async function regenerateRecoveryCodes(_: TotpState, form: FormData): Promise<TotpState> {
  return call("/me/2fa/recovery", form);
}

export async function resetTotp(_: TotpState, form: FormData): Promise<TotpState> {
  const r = await call("/me/2fa/reset", form);
  revalidatePath("/seguranca/2fa");
  return r;
}
