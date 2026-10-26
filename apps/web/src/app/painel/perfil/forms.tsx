"use client";
import { useActionState } from "react";
import { changePassword, updateProfile } from "@/lib/actions/profile";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

type Values = { name: string; phone: string; cpf: string; crm: string; specialty: string; institution: string };

export function ProfileForm({ values, doctor }: { values: Values; doctor: boolean }) {
  const [state, action] = useActionState(updateProfile, null);
  const field = (name: keyof Values, label: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={values[name]} className="input" />
    </div>
  );
  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="font-semibold text-ink-50">Dados pessoais</h2>
      {field("name", "Nome")}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("phone", "Telefone")}
        {field("cpf", "CPF")}
      </div>
      {doctor && (
        <div className="grid gap-4 sm:grid-cols-3">
          {field("crm", "CRM")}
          {field("specialty", "Especialidade")}
          {field("institution", "Instituição")}
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">Atualizar</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <h2 className="font-semibold text-ink-50">Senha</h2>
      <div>
        <label className="label" htmlFor="current">Senha atual</label>
        <input id="current" name="current" type="password" required className="input" autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="next">Nova senha</label>
        <input id="next" name="next" type="password" minLength={8} required className="input" autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="next2">Repita a nova senha</label>
        <input id="next2" name="next2" type="password" minLength={8} required className="input" autoComplete="new-password" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-ghost" pendingText="Alterando…">Alterar senha</SubmitButton>
    </form>
  );
}
