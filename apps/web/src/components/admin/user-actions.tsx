"use client";
import type { Role } from "@docdo/contracts";
import { useState, useTransition } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { adminSendPasswordReset, anonymizeUser, approveDoctor } from "@/lib/actions/admin";
import type { ActionState } from "@/lib/actions/types";
import { FormMessage } from "@/components/ui/misc";

export function UserActions({
  id,
  name,
  role,
  pendingApproval,
  deletionRequested,
  isSelf,
}: {
  id: string;
  name: string;
  role: Role;
  pendingApproval: boolean;
  deletionRequested: boolean;
  isSelf: boolean;
}) {
  const [msg, setMsg] = useState<ActionState>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<ActionState | void>) => start(async () => setMsg((await fn()) ?? null));

  return (
    <div className="space-y-4">
      {pendingApproval && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
          <p className="text-sm font-semibold text-amber-300">Cadastro de médico aguardando aprovação</p>
          <p className="mt-1 text-xs text-ink-300">Confira o CRM no portal do CFM antes de aprovar.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="https://portal.cfm.org.br/busca-medicos/" target="_blank" rel="noopener noreferrer" className="btn-ghost">
              Consultar CRM no CFM <ExternalLink className="size-3.5" />
            </a>
            <button onClick={() => run(() => approveDoctor(id))} disabled={busy} className="btn-primary">
              {busy && <Loader2 className="size-4 animate-spin" />} Aprovar médico
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(() => adminSendPasswordReset(id))} disabled={busy} className="btn-ghost">
          Enviar link para redefinir senha
        </button>
        {!isSelf && role !== "ADMIN" && (
          <button
            onClick={() =>
              confirm(`Eliminar os dados de ${name}? A conta será anonimizada e os casos em que é paciente serão apagados com os arquivos. Não há como desfazer.`) &&
              run(() => anonymizeUser(id))
            }
            disabled={busy}
            className="btn-danger"
          >
            {deletionRequested ? "Concluir pedido de exclusão (LGPD)" : "Eliminar dados (LGPD)"}
          </button>
        )}
      </div>
      <FormMessage state={msg} />
    </div>
  );
}
