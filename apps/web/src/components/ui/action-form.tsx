"use client";
import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/types";
import { SubmitButton } from "./submit";
import { FormMessage } from "./misc";

/** Formulário simples ligado a uma server action: campos como children, mensagem e botão no fim. */
export function ActionForm({
  action,
  children,
  submit,
  pending,
  hideOnOk = false,
  className = "mt-8 space-y-4",
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  submit: string;
  pending?: string;
  hideOnOk?: boolean;
  className?: string;
}) {
  const [state, run] = useActionState(action, null);
  if (hideOnOk && state?.ok) return <div className={className}><FormMessage state={state} /></div>;
  return (
    <form action={run} className={className}>
      {children}
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3" pendingText={pending}>{submit}</SubmitButton>
    </form>
  );
}
