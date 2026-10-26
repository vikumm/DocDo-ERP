"use client";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { OrderStatus } from "@docdo/contracts";
import { setOrderStatus } from "@/lib/actions/admin";

export function OrderActions({ id, status }: { id: string; status: OrderStatus }) {
  const [pending, start] = useTransition();
  const act = (s: OrderStatus, msg?: string) => (!msg || confirm(msg)) && start(() => setOrderStatus(id, s));
  if (pending) return <Loader2 className="ml-auto size-4 animate-spin text-ink-400" />;
  return (
    <div className="flex justify-end gap-1">
      {status === "PENDING" && (
        <>
          <button onClick={() => act("PAID")} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/10">Confirmar pagamento</button>
          <button onClick={() => act("CANCELLED", "Cancelar este pedido?")} className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-white/5">Cancelar</button>
        </>
      )}
      {status === "PAID" && <button onClick={() => act("REFUNDED", "Registrar estorno deste pedido?")} className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-white/5">Estornar</button>}
      {(status === "CANCELLED" || status === "REFUNDED") && <button onClick={() => act("PENDING")} className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-white/5">Reabrir</button>}
    </div>
  );
}
