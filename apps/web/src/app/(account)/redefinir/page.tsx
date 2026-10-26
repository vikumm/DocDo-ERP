import type { Metadata } from "next";
import Link from "next/link";
import type { TokenInfo } from "@docdo/contracts";
import { api } from "@/lib/api";
import { resetPassword } from "@/lib/actions/auth";
import { ActionForm } from "@/components/ui/action-form";
import { ConsentField } from "@/components/ui/consent-field";

export const metadata: Metadata = { title: "Definir senha", referrer: "no-referrer" };

async function peek(kind: "verify" | "password", token: string) {
  if (!token || token.length > 100) return null;
  return api<TokenInfo>(`/auth/tokens/${kind}/${encodeURIComponent(token)}`).catch(() => null);
}


export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const row = await peek("password", token);
  if (!row)
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight text-ink-50">Link inválido ou expirado</h1>
        <p className="mt-2 text-sm text-ink-300">Os links de senha valem por tempo limitado e só podem ser usados uma vez.</p>
        <Link href="/recuperar" className="btn-primary mt-8">Pedir um novo link</Link>
      </>
    );
  const invite = row.purpose === "INVITE";
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-ink-50">{invite ? "Crie sua senha" : "Defina uma nova senha"}</h1>
      <p className="mt-2 text-sm text-ink-300">{invite
          ? `Olá, ${row.name}. ${row.organizationName ? `Você foi convidada para a equipe de ${row.organizationName}. ` : ""}Defina uma senha para acessar o DocDo.`
          : `Conta: ${row.email}`}</p>
      <ActionForm action={resetPassword} submit="Salvar senha" pending="Salvando…">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">Nova senha</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password2">Repita a senha</label>
          <input id="password2" name="password2" type="password" minLength={8} required autoComplete="new-password" className="input" />
        </div>
        {row.needsConsent && <ConsentField />}
      </ActionForm>
    </>
  );
}
