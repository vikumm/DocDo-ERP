import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Banknote, Clock, FolderKanban, Mail, Stethoscope, Users } from "lucide-react";
import type { AdminDashboardDTO, CaseStatus } from "@docdo/contracts";
import { api } from "@/lib/api";
import { PLANS, STATUS_FLOW, STATUS_LABEL } from "@/lib/constants";
import { brl, caseCode, date, dateTime } from "@/lib/format";
import { OrderBadge, StatusBadge } from "@/components/ui/badge";
import { PageHeader, Section, Stat } from "@/components/ui/misc";
import { ColumnChart } from "@/components/charts/column-chart";
import { MarkReadButton } from "./mark-read";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const d = await api<AdminDashboardDTO>("/admin/dashboard");
  const { pendingDoctors, deletionRequests, queue, messages } = d;
  const pending = d.pendingOrders;
  const count = (s: CaseStatus) => d.byStatus[s] ?? 0;
  const totalCases = Object.values(d.byStatus).reduce((a, b) => a + (b ?? 0), 0);
  const revenue = d.revenue.map((r) => ({ label: r.label, value: r.value, display: brl(r.value), detail: `${r.count} pedido(s)` }));
  const thisMonth = revenue.at(-1)!.value;
  const maxStatus = Math.max(1, ...STATUS_FLOW.map(count));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão geral da operação DocDo." actions={<Link href="/admin/casos/novo" className="btn-primary">Novo caso</Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Receita total" value={brl(d.paidTotal)} hint={`${d.paidCount} pedidos pagos · ${brl(thisMonth)} este mês`} icon={Banknote} />
        <Stat label="Fila de reconstrução" value={count("PAID") + count("PROCESSING")} hint={`${count("PROCESSING")} em andamento · ${count("PAID")} aguardando`} icon={Clock} />
        <Stat label="Casos" value={totalCases} hint={`${count("READY")} prontos · ${count("UPLOADED")} aguardando pagamento`} icon={FolderKanban} />
        <Stat
          label="Usuários"
          value={d.doctors + d.patients + d.secretaries}
          hint={
            <span className="inline-flex gap-3">
              <span className="inline-flex items-center gap-1"><Stethoscope className="size-3" /> {d.doctors} médicos</span>
              <span className="inline-flex items-center gap-1"><Users className="size-3" /> {d.patients} pacientes</span>
              <span>{d.organizations} clínicas</span>
            </span>
          }
        />
      </div>

      {(pendingDoctors.length > 0 || deletionRequests.length > 0) && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {pendingDoctors.length > 0 && (
            <Section title={`Médicos aguardando aprovação (${pendingDoctors.length})`}>
              <ul className="space-y-2">
                {pendingDoctors.map((d) => (
                  <li key={d.id}>
                    <Link href={`/admin/usuarios/${d.id}`} className="flex justify-between gap-3 text-sm hover:text-brand-300">
                      <span className="text-ink-50">{d.name}</span>
                      <span className="text-xs text-ink-400">{d.crm} · {date(d.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {deletionRequests.length > 0 && (
            <Section title={`Pedidos de exclusão de dados (${deletionRequests.length})`}>
              <p className="mb-3 text-xs text-ink-400">A LGPD pede resposta em até 15 dias.</p>
              <ul className="space-y-2">
                {deletionRequests.map((d) => (
                  <li key={d.id}>
                    <Link href={`/admin/usuarios/${d.id}`} className="flex justify-between gap-3 text-sm hover:text-brand-300">
                      <span className="text-ink-50">{d.name}</span>
                      <span className="text-xs text-ink-400">pedido em {date(d.deletionRequestedAt!)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Receita confirmada · últimos 6 meses">
          <ColumnChart data={revenue} ariaLabel="Receita confirmada por mês" />
        </Section>
        <Section title="Casos por etapa">
          <ul className="space-y-3">
            {STATUS_FLOW.map((s) => (
              <li key={s}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-ink-200">{STATUS_LABEL[s]}</span>
                  <span className="font-semibold text-ink-50 tabular-nums">{count(s)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.04]">
                  <div className="h-full rounded-full bg-chart" style={{ width: `${(count(s) / maxStatus) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {count("CANCELLED") > 0 && <p className="mt-4 text-xs text-ink-400">+ {count("CANCELLED")} cancelado(s)</p>}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Fila de reconstrução" actions={<Link href="/admin/casos?status=PAID" className="text-xs font-semibold text-brand-400">Ver todos</Link>}>
          {queue.length ? (
            <ul className="divide-y divide-white/[0.04]">
              {queue.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/casos/${c.id}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-50">{c.title}</p>
                      <p className="text-xs text-ink-400">{caseCode(c.code)} · {c.doctor?.name ?? c.patient?.name} · {PLANS[c.plan].short} · {date(c.createdAt)}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">Fila vazia. 🎉</p>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="Pagamentos pendentes" actions={<Link href="/admin/compras?status=PENDING" className="text-xs font-semibold text-brand-400">Gerenciar</Link>}>
            {pending.length ? (
              <ul className="space-y-3">
                {pending.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <Link href={`/admin/casos/${o.case?.id}`} className="block truncate text-ink-50 hover:text-brand-300">{o.case?.title}</Link>
                      <p className="text-xs text-ink-400">{o.user?.name} · {brl(o.amount)} · {o.method}</p>
                    </div>
                    <OrderBadge status={o.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-400">Nenhum pagamento pendente.</p>
            )}
          </Section>

          <Section title="Mensagens do site">
            {messages.length ? (
              <ul className="space-y-4">
                {messages.map((m) => (
                  <li key={m.id} className="flex gap-3">
                    <Mail className="mt-0.5 size-4 shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-50">{m.name} <span className="font-normal text-ink-400">· {m.email ?? m.phone}</span></p>
                      <p className="mt-0.5 text-sm text-ink-300">{m.message}</p>
                      <p className="mt-1 text-xs text-ink-500">{dateTime(m.createdAt)}</p>
                    </div>
                    <MarkReadButton id={m.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-400">Nenhuma mensagem nova.</p>
            )}
          </Section>
        </div>
      </div>
      <Link href="/admin/casos" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-400 hover:text-brand-300">
        Ver todos os casos <ArrowRight className="size-4" />
      </Link>
    </>
  );
}
