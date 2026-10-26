import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/auth";
import { ActionForm } from "@/components/ui/action-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecoverPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-ink-50">Recuperar senha</h1>
      <p className="mt-2 text-sm text-ink-300">Informe seu e-mail. Se houver uma conta, enviaremos um link para definir uma nova senha.</p>
      <ActionForm action={requestPasswordReset} submit="Enviar link" pending="Enviando…" hideOnOk>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
      </ActionForm>
      <p className="mt-8 text-center text-sm text-ink-300">
        <Link href="/entrar" className="font-semibold text-brand-400 hover:text-brand-300">Voltar ao login</Link>
      </p>
    </>
  );
}
