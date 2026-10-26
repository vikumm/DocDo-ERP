import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { OrderDTO, OrderStatus } from "@docdo/contracts";
import { api } from "@/lib/api";
import { ORDER_LABEL, PLANS } from "@/lib/constants";
import { brl, caseCode, dateTime } from "@/lib/format";
import { OrderBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { OrderActions } from "./actions";

export const metadata: Metadata = { title: "Compras" };
const STATUSES = Object.keys(ORDER_LABEL) as OrderStatus[];

export default async function Orders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
  const { orders, sums } = await api<{ orders: OrderDTO[]; sums: Partial<Record<OrderStatus, { amount: number; count: number }>> }>(
    `/admin/orders${filter ? `?status=${filter}` : ""}`,
  );
  // mesmo formato de antes: { _sum: { amount }, _count }
  const sum = (s: OrderStatus) => (sums[s] ? { _sum: { amount: sums[s]!.amount }, _count: sums[s]!.count } : undefined);
  const paidCount = sum("PAID")?._count ?? 0;

  return (
    <>
      <PageHeader title="Compras" subtitle="Pedidos de reconstrução. Confirmar o pagamento libera o caso para a fila." />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Recebido" value={brl(sum("PAID")?._sum.amount ?? 0)} hint={`${paidCount} pedidos pagos`} />
        <Stat label="A receber" value={brl(sum("PENDING")?._sum.amount ?? 0)} hint={`${sum("PENDING")?._count ?? 0} pendentes`} />
        <Stat label="Ticket médio" value={brl(paidCount ? sum("PAID")!._sum.amount / paidCount : 0)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/admin/compras" className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${!filter ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink-200 ring-white/10"}`}>Todos</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/compras?status=${s}`} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${filter === s ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink-200 ring-white/10"}`}>
            {ORDER_LABEL[s]} · {sum(s)?._count ?? 0}
          </Link>
        ))}
      </div>
      {orders.length ? (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[860px]">
            <thead>
              <tr>
                <th>Caso</th>
                <th>Comprador</th>
                <th>Plano</th>
                <th>Valor</th>
                <th>Método</th>
                <th>Data</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/casos/${o.case?.id}`} className="font-semibold text-ink-50 hover:text-brand-300">{o.case?.title}</Link>
                    <p className="font-mono text-[11px] text-ink-400">{caseCode(o.case?.code ?? 0)}</p>
                  </td>
                  <td className="text-ink-200">{o.user?.name}<span className="block text-xs text-ink-400">{o.user?.role === "DOCTOR" ? "Médico" : "Paciente"}</span></td>
                  <td className="text-ink-200">{PLANS[o.plan].name}</td>
                  <td className="font-semibold text-ink-50 tabular-nums">{brl(o.amount)}</td>
                  <td className="text-ink-300 capitalize">{o.method ?? "—"}</td>
                  <td className="text-ink-300">{dateTime(o.createdAt)}{o.paidAt && <span className="block text-xs text-ink-500">pago {dateTime(o.paidAt)}</span>}</td>
                  <td><OrderBadge status={o.status} /></td>
                  <td><OrderActions id={o.id} status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={ShoppingCart} title="Nenhum pedido" />
      )}
    </>
  );
}
