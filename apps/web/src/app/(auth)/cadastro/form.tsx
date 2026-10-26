"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck, Stethoscope, UserRound } from "lucide-react";
import clsx from "clsx";
import { register } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

export function RegisterForm({ initialRole }: { initialRole: "PATIENT" | "DOCTOR" }) {
  const [state, action] = useActionState(register, null);
  const [role, setRole] = useState(initialRole);
  if (state?.ok)
    return (
      <div className="card mt-8 p-6 text-center">
        <MailCheck className="mx-auto size-8 text-brand-400" />
        <p className="mt-3 font-semibold text-ink-50">Confira seu e-mail</p>
        <p className="mt-1 text-sm text-ink-300">{state.ok}</p>
        <p className="mt-4 text-xs text-ink-400">Não chegou? Veja a caixa de spam ou tente entrar com seu e-mail e senha para receber outro link.</p>
      </div>
    );
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="role" value={role} />
      <div className="grid grid-cols-2 gap-2">
        {([
          ["PATIENT", "Sou paciente", UserRound],
          ["DOCTOR", "Sou médico", Stethoscope],
        ] as const).map(([r, label, Icon]) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={clsx("flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition", role === r ? "border-brand-500/60 bg-brand-500/10 text-brand-300" : "border-white/10 text-ink-200 hover:border-white/20")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="name">Nome completo</label>
        <input id="name" name="name" required className="input" autoComplete="name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Telefone</label>
          <input id="phone" name="phone" className="input" autoComplete="tel" placeholder="(00) 00000-0000" />
        </div>
      </div>
      {role === "DOCTOR" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="crm">CRM</label>
            <input id="crm" name="crm" required className="input" placeholder="CRM-UF 000000" />
          </div>
          <div>
            <label className="label" htmlFor="specialty">Especialidade</label>
            <input id="specialty" name="specialty" className="input" placeholder="Ex.: Urologia" />
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" minLength={8} required className="input" autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="password2">Repita a senha</label>
          <input id="password2" name="password2" type="password" minLength={8} required className="input" autoComplete="new-password" />
        </div>
      </div>
      <label className="flex items-start gap-3 text-sm text-ink-200">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-brand-500" />
        <span>
          Li e aceito a{" "}
          <Link href="/privacidade" target="_blank" className="font-semibold text-brand-400 underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>{" "}
          e autorizo o tratamento dos meus dados, inclusive dados de saúde dos exames, para a reconstrução 3D.
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3" pendingText="Criando conta…">Criar conta</SubmitButton>
    </form>
  );
}
