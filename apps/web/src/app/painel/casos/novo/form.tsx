"use client";
import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { createCase } from "@/lib/actions/cases";
import { PLANS } from "@/lib/constants";
import { brl } from "@/lib/format";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

export function NewCaseForm({ role }: { role: "DOCTOR" | "PATIENT" | "SECRETARY" }) {
  const [state, action] = useActionState(createCase, null);
  const [plan, setPlan] = useState<"UNILATERAL" | "BILATERAL">("UNILATERAL");
  // médico e secretária cadastram o caso para um paciente
  const doctor = role !== "PATIENT";

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="card space-y-5 p-6">
        <h2 className="font-semibold text-ink-50">Sobre o exame</h2>
        <div>
          <label className="label" htmlFor="title">Título do caso</label>
          <input id="title" name="title" required className="input" placeholder="Ex.: TC de abdome — tumor renal" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="examType">Tipo de exame</label>
            <select id="examType" name="examType" className="input">
              <option value="CT">Tomografia</option>
              <option value="MRI">Ressonância</option>
              <option value="US">Ultrassom</option>
              <option value="OTHER">Outro</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bodyRegion">Região do corpo</label>
            <input id="bodyRegion" name="bodyRegion" className="input" placeholder="Ex.: Rim, Fígado, Tórax" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="description">O que precisa ser reconstruído?</label>
          <textarea id="description" name="description" rows={4} className="input resize-none" placeholder="Estruturas de interesse, cirurgia planejada, observações para a equipe…" />
        </div>

        <div className="border-t border-white/[0.06] pt-5">
          <h2 className="font-semibold text-ink-50">{doctor ? "Paciente" : "Seu médico (opcional)"}</h2>
          <p className="mt-1 text-xs text-ink-400">
            {doctor ? "Se o paciente ainda não tem conta DocDo, criamos uma para ele com este e-mail." : "Se o seu médico já usa o DocDo, informe o e-mail dele para que ele também acesse o caso."}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="counterpartEmail">{doctor ? "E-mail do paciente" : "E-mail do médico"}</label>
              <input id="counterpartEmail" name="counterpartEmail" type="email" required={doctor} className="input" />
            </div>
            {doctor && (
              <div>
                <label className="label" htmlFor="counterpartName">Nome do paciente</label>
                <input id="counterpartName" name="counterpartName" className="input" placeholder="Obrigatório se for novo" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <input type="hidden" name="plan" value={plan} />
        {(Object.entries(PLANS) as [keyof typeof PLANS, (typeof PLANS)["UNILATERAL"]][]).map(([key, p]) => (
          <button
            type="button"
            key={key}
            onClick={() => setPlan(key)}
            className={clsx("card w-full p-5 text-left transition", plan === key ? "border-brand-500/50 ring-4 ring-brand-500/10" : "hover:border-white/15")}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-ink-50">{p.name}</p>
                <p className="text-xs text-ink-400">{p.description}</p>
              </div>
              <span className={clsx("grid size-5 place-items-center rounded-full ring-1", plan === key ? "bg-brand-500 text-on-brand ring-brand-500" : "ring-white/20")}>
                {plan === key && <Check className="size-3" />}
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-ink-50">{brl(p.price)}</p>
            <ul className="mt-3 space-y-1">
              {p.features.map((f) => (
                <li key={f} className="text-xs text-ink-300">· {f}</li>
              ))}
            </ul>
          </button>
        ))}
        <p className="text-xs text-ink-400">O pagamento é feito depois do envio do DICOM. Você pode trocar de plano até lá.</p>
        <FormMessage state={state} />
        <SubmitButton className="btn-primary w-full py-3" pendingText="Criando caso…">Criar caso e enviar DICOM</SubmitButton>
      </div>
    </form>
  );
}
