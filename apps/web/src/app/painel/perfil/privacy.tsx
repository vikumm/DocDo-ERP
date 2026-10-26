"use client";
import { useActionState, useState } from "react";
import { requestDeletion } from "@/lib/actions/privacy";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(requestDeletion, null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-danger">
        Excluir minha conta
      </button>
    );
  return (
    <form action={action} className="space-y-3 rounded-xl border border-red-500/30 p-4">
      <p className="text-sm text-ink-200">
        Sua conta será desativada agora e seus dados, incluindo os exames em que você é o paciente, serão eliminados em até 15 dias. Essa ação não pode ser desfeita.
      </p>
      <label className="label" htmlFor="del-password">Confirme com sua senha</label>
      <input id="del-password" name="password" type="password" required autoComplete="current-password" className="input" />
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton className="btn-danger" pendingText="Enviando…">Confirmar exclusão</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
      </div>
    </form>
  );
}
