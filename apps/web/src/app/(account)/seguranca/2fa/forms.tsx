"use client";
import Link from "next/link";
import { useActionState } from "react";
import { confirmTotpSetup, regenerateRecoveryCodes, resetTotp, type TotpState } from "@/lib/actions/security";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

function CodeInput() {
  return <input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} placeholder="000000" className="input text-center font-mono text-lg tracking-[0.3em]" />;
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="card mt-6 p-5">
      <p className="font-semibold text-ink-50">Guarde estes códigos de recuperação</p>
      <p className="mt-1 text-sm text-ink-300">Cada um vale uma vez, se você perder o celular. Eles não serão mostrados de novo.</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm text-ink-50">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-center select-all">{c}</li>
        ))}
      </ul>
    </div>
  );
}

export function SetupForm() {
  const [state, action] = useActionState<TotpState, FormData>(confirmTotpSetup, null);
  if (state?.recoveryCodes)
    return (
      <>
        <RecoveryCodes codes={state.recoveryCodes} />
        <Link href="/admin" className="btn-primary mt-6 w-full py-3">Já guardei, ir para o admin</Link>
      </>
    );
  return (
    <form action={action} className="mt-6 space-y-4">
      <CodeInput />
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3" pendingText="Verificando…">Ativar 2FA</SubmitButton>
    </form>
  );
}

export function EnabledPanel() {
  const [regen, regenAction] = useActionState<TotpState, FormData>(regenerateRecoveryCodes, null);
  const [reset, resetAction] = useActionState<TotpState, FormData>(resetTotp, null);
  return (
    <div className="mt-8 space-y-6">
      <form action={regenAction} className="space-y-3">
        <p className="text-sm font-semibold text-ink-50">Gerar novos códigos de recuperação</p>
        <CodeInput />
        <FormMessage state={regen?.recoveryCodes ? null : regen} />
        <SubmitButton className="btn-ghost w-full">Gerar novos códigos</SubmitButton>
      </form>
      {regen?.recoveryCodes && <RecoveryCodes codes={regen.recoveryCodes} />}
      <form action={resetAction} className="space-y-3 border-t border-white/[0.06] pt-6">
        <p className="text-sm font-semibold text-ink-50">Trocar de celular</p>
        <p className="text-xs text-ink-400">Confirme com o código atual; em seguida você escaneia um QR code novo.</p>
        <CodeInput />
        <FormMessage state={reset} />
        <SubmitButton className="btn-ghost w-full">Trocar aparelho</SubmitButton>
      </form>
    </div>
  );
}
