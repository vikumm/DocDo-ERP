"use client";
import { useActionState, useState } from "react";
import type { Role } from "@docdo/contracts";
import { saveUser } from "@/lib/actions/admin";
import { ROLE_LABEL } from "@/lib/constants";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

export type UserValues = { name: string; email: string; role: Role; phone: string; cpf: string; crm: string; specialty: string; institution: string; active: boolean };

export function UserForm({ id, values }: { id: string | null; values: UserValues }) {
  const [state, action] = useActionState(saveUser.bind(null, id), null);
  const [role, setRole] = useState<Role>(values.role);
  const f = (name: keyof UserValues, label: string, type = "text") => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={String(values[name] ?? "")} className="input" />
    </div>
  );
  return (
    <form action={action} className="card max-w-3xl space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="role">Perfil</label>
          <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="input">
            {Object.entries(ROLE_LABEL)
              .filter(([k]) => k !== "SECRETARY" || values.role === "SECRETARY")
              .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {f("name", "Nome")}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {f("email", "E-mail", "email")}
        {f("phone", "Telefone")}
        {f("cpf", "CPF")}
      </div>
      {role === "DOCTOR" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {f("crm", "CRM")}
          {f("specialty", "Especialidade")}
          {f("institution", "Instituição")}
        </div>
      )}
      <label className="flex items-center gap-3 text-sm text-ink-100">
        <input type="checkbox" name="active" defaultChecked={values.active} className="size-4 accent-brand-500" /> Conta ativa
      </label>
      {!id && <p className="text-xs text-ink-400">A pessoa recebe um convite por e-mail para definir a própria senha. A equipe nunca define senhas.</p>}
      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">{id ? "Salvar" : "Criar usuário"}</SubmitButton>
    </form>
  );
}
