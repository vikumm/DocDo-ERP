"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      {notice && !state && <p className="rounded-xl bg-brand-500/10 px-3.5 py-2.5 text-sm text-brand-300">{notice}</p>}
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="voce@exemplo.com" />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="password">Senha</label>
          <Link href="/recuperar" className="text-xs font-semibold text-brand-400 hover:text-brand-300">Esqueci minha senha</Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3" pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
