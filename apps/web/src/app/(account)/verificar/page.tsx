import type { Metadata } from "next";
import Link from "next/link";
import type { TokenInfo } from "@docdo/contracts";
import { api } from "@/lib/api";
import { confirmEmail } from "@/lib/actions/auth";
import { ActionForm } from "@/components/ui/action-form";

export const metadata: Metadata = { title: "Confirmar e-mail", referrer: "no-referrer" };

async function peek(kind: "verify" | "password", token: string) {
  if (!token || token.length > 100) return null;
  return api<TokenInfo>(`/auth/tokens/${kind}/${encodeURIComponent(token)}`).catch(() => null);
}


export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const row = await peek("verify", token);
  if (!row)
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight text-ink-50">Link inválido ou expirado</h1>
        <p className="mt-2 text-sm text-ink-300">Entre com seu e-mail e senha: se a conta ainda não estiver confirmada, enviamos um link novo.</p>
        <Link href="/entrar" className="btn-primary mt-8">Ir para o login</Link>
      </>
    );
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-ink-50">Confirme seu e-mail</h1>
      <p className="mt-2 text-sm text-ink-300">Falta um clique para ativar a conta de {row.email}.</p>
      <ActionForm action={confirmEmail} submit="Confirmar e entrar" pending="Confirmando…">
        <input type="hidden" name="token" value={token} />
      </ActionForm>
    </>
  );
}
