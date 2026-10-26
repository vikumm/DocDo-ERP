import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CHALLENGE_COOKIE } from "@/lib/api";
import { loginSecondFactor } from "@/lib/actions/auth";
import { ActionForm } from "@/components/ui/action-form";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function SecondFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // o desafio é validado pela API ao enviar o código; aqui basta ele existir
  if (!(await cookies()).get(CHALLENGE_COOKIE)) redirect("/entrar");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-ink-50">Verificação em duas etapas</h1>
      <p className="mt-2 text-sm text-ink-300">Digite o código de 6 dígitos do seu aplicativo autenticador, ou um código de recuperação.</p>
      <ActionForm action={loginSecondFactor} submit="Entrar" pending="Verificando…">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label className="label" htmlFor="code">Código</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={14} className="input text-center font-mono text-lg tracking-[0.3em]" placeholder="000000" />
        </div>
      </ActionForm>
      <p className="mt-8 text-center text-sm text-ink-300">
        <Link href="/entrar" className="font-semibold text-brand-400 hover:text-brand-300">Voltar ao login</Link>
      </p>
    </>
  );
}
