"use client";
import type { Role } from "@docdo/contracts";
import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import clsx from "clsx";
import { grantCaseAccess, revokeCaseAccess } from "@/lib/actions/admin";
import type { ActionState } from "@/lib/actions/types";
import { Avatar, FormMessage } from "@/components/ui/misc";
import { UserCombobox } from "./user-combobox";

type Person = { id: string; name: string; email: string; role?: Role };

const ROLE_TAG = { DOCTOR: "Médico", PATIENT: "Paciente", ADMIN: "Admin" } as const;

export function AccessManager({ caseId, patient, doctor, shared }: { caseId: string; patient: Person | null; doctor: Person | null; shared: Person[] }) {
  const [filter, setFilter] = useState<"ALL" | "DOCTOR" | "PATIENT">("ALL");
  const [msg, setMsg] = useState<ActionState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const run = (id: string, fn: () => Promise<ActionState>) => {
    setBusy(id);
    start(async () => {
      setMsg(await fn());
      setBusy(null);
    });
  };

  const exclude = [patient?.id, doctor?.id, ...shared.map((s) => s.id)].filter(Boolean) as string[];
  const responsible = [
    { label: "Paciente responsável", p: patient },
    { label: "Médico responsável", p: doctor },
  ];

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {responsible.map(({ label, p }) => (
          <li key={label} className="flex items-center gap-3">
            {p ? <Avatar name={p.name} /> : <span className="size-9 shrink-0 rounded-full border border-dashed border-white/15" />}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">{label}</p>
              <p className="truncate text-sm text-ink-50">{p ? `${p.name} (${p.email})` : "Não vinculado — defina em Dados do caso"}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-white/[0.06] pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink-50">Acesso liberado ({shared.length})</p>
          <div className="flex gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
            {([
              ["ALL", "Todos"],
              ["DOCTOR", "Médicos"],
              ["PATIENT", "Pacientes"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={clsx("rounded-md px-2 py-1 text-[11px] font-semibold", filter === k ? "bg-ink-950 text-ink-50 shadow-sm" : "text-ink-300 hover:text-ink-50")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <UserCombobox
          role={filter === "ALL" ? undefined : filter}
          exclude={exclude}
          placeholder={filter === "DOCTOR" ? "Buscar médico por nome, e-mail ou CRM…" : filter === "PATIENT" ? "Buscar paciente por nome, e-mail ou CPF…" : "Buscar médico ou paciente por nome ou e-mail…"}
          onPick={(u) => run(u.id, () => grantCaseAccess(caseId, u.id))}
        />

        <div className="mt-3">
          <FormMessage state={msg} />
        </div>

        {shared.length > 0 ? (
          <ul className="mt-3 divide-y divide-white/[0.04] rounded-xl border border-white/[0.06]">
            {shared.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={s.name} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-50">{s.name}</p>
                  <p className="truncate text-xs text-ink-400">{s.email}</p>
                </div>
                <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", s.role === "DOCTOR" ? "text-brand-300 ring-brand-500/30" : "text-sky-300 ring-sky-400/30")}>
                  {s.role ? ROLE_TAG[s.role as keyof typeof ROLE_TAG] : ""}
                </span>
                <button
                  type="button"
                  onClick={() => run(s.id, () => revokeCaseAccess(caseId, s.id))}
                  disabled={busy === s.id}
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-red-500/10 hover:text-red-300"
                  aria-label={`Remover acesso de ${s.name}`}
                  title="Remover acesso"
                >
                  {busy === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-ink-400">Ninguém além dos responsáveis. Busque acima para liberar acesso — sem limite de pessoas.</p>
        )}
      </div>
    </div>
  );
}
