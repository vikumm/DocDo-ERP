"use client";
import { useActionState } from "react";
import { sendContact } from "@/lib/actions/public";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

export function ContactForm() {
  const [state, action] = useActionState(sendContact, null);
  return (
    <form action={action} className="card grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="c-name">Nome</label>
        <input id="c-name" name="name" className="input" placeholder="Insira seu nome completo" required />
      </div>
      <div>
        <label className="label" htmlFor="c-email">E-mail</label>
        <input id="c-email" name="email" type="email" className="input" placeholder="voce@exemplo.com" />
      </div>
      <div>
        <label className="label" htmlFor="c-phone">Telefone</label>
        <input id="c-phone" name="phone" className="input" placeholder="(00) 00000-0000" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="c-msg">Mensagem</label>
        <textarea id="c-msg" name="message" rows={4} className="input resize-none" placeholder="Conte como podemos ajudar" required />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage state={state} />
        <SubmitButton className="btn-primary sm:ml-auto" pendingText="Enviando...">Enviar mensagem</SubmitButton>
      </div>
    </form>
  );
}
