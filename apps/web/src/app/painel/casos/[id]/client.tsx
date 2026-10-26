"use client";
import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import clsx from "clsx";
import { checkout, shareCase, unshareCase } from "@/lib/actions/cases";
import { PLANS } from "@/lib/constants";
import { brl } from "@/lib/format";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

export function CheckoutForm({ caseId, currentPlan, pending }: { caseId: string; currentPlan: "UNILATERAL" | "BILATERAL"; pending: boolean }) {
  const [state, action] = useActionState(checkout.bind(null, caseId), null);
  const [plan, setPlan] = useState(currentPlan);
  const [method, setMethod] = useState("pix");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="method" value={method} />
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.entries(PLANS) as [keyof typeof PLANS, (typeof PLANS)["UNILATERAL"]][]).map(([k, p]) => (
          <button key={k} type="button" onClick={() => setPlan(k)} className={clsx("rounded-xl border p-4 text-left transition", plan === k ? "border-brand-500/60 bg-brand-500/[0.06]" : "border-white/10 hover:border-white/20")}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink-50">{p.name}</p>
              {plan === k && <Check className="size-4 text-brand-400" />}
            </div>
            <p className="text-xs text-ink-400">{p.description}</p>
            <p className="mt-2 text-xl font-bold text-ink-50">{brl(p.price)}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["pix", "Pix"],
          ["cartao", "Cartão"],
          ["boleto", "Boleto"],
        ].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMethod(k)} className={clsx("rounded-xl border py-2.5 text-sm font-semibold transition", method === k ? "border-brand-500/60 text-brand-300" : "border-white/10 text-ink-200 hover:border-white/20")}>
            {l}
          </button>
        ))}
      </div>
      <FormMessage state={state} />
      {pending && !state && <p className="rounded-xl bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-300">Pedido gerado, aguardando confirmação do pagamento.</p>}
      <SubmitButton className="btn-primary w-full" pendingText="Gerando pedido…">{pending ? "Atualizar pedido" : `Pagar ${brl(PLANS[plan].price)}`}</SubmitButton>
    </form>
  );
}

export function ShareForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(shareCase.bind(null, caseId), null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="email" type="email" required placeholder="E-mail de quem vai acessar" className="input" />
        <SubmitButton className="btn-ghost shrink-0">Compartilhar</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function UnshareButton({ caseId, userId }: { caseId: string; userId: string }) {
  return (
    <button onClick={() => unshareCase(caseId, userId)} className="rounded-lg p-1 text-ink-400 hover:text-red-300" aria-label="Remover acesso">
      <X className="size-3.5" />
    </button>
  );
}
