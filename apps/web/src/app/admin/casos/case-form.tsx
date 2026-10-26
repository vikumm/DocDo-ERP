"use client";
import { useActionState } from "react";
import type { AdminCaseDTO } from "@docdo/contracts";
import { adminCreateCase, adminUpdateCase } from "@/lib/actions/admin";
import { EXAM_LABEL, PLANS, STATUS_LABEL } from "@/lib/constants";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";
import { UserPickerField } from "@/components/admin/user-picker-field";

type Person = { id: string; name: string; email: string };

export function AdminCaseForm({ c, patient, doctor }: { c?: AdminCaseDTO; patient?: Person | null; doctor?: Person | null }) {
  const [state, action] = useActionState(c ? adminUpdateCase.bind(null, c.id) : adminCreateCase, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="title">Título interno</label>
        <input id="title" name="title" defaultValue={c?.title} required className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="examType">Exame</label>
          <select id="examType" name="examType" defaultValue={c?.examType ?? "CT"} className="input">
            {Object.entries(EXAM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bodyRegion">Região</label>
          <input id="bodyRegion" name="bodyRegion" defaultValue={c?.bodyRegion ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="plan">Plano</label>
          <select id="plan" name="plan" defaultValue={c?.plan ?? "UNILATERAL"} className="input">
            {Object.entries(PLANS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={c?.status ?? "CREATED"} className="input sm:max-w-xs">
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <UserPickerField name="patientId" label="Paciente responsável" role="PATIENT" initial={patient ?? null} />
        <UserPickerField name="doctorId" label="Médico responsável" role="DOCTOR" initial={doctor ?? null} />
      </div>
      <div>
        <label className="label" htmlFor="description">Descrição / solicitação</label>
        <textarea id="description" name="description" rows={3} defaultValue={c?.description ?? ""} className="input resize-none" />
      </div>
      {c && (
        <div>
          <label className="label" htmlFor="adminNotes">Notas internas (só admin)</label>
          <textarea id="adminNotes" name="adminNotes" rows={2} defaultValue={c.adminNotes ?? ""} className="input resize-none" />
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">{c ? "Salvar alterações" : "Criar caso"}</SubmitButton>
    </form>
  );
}
