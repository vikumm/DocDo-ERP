import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Plus, Search } from "lucide-react";
import type { CaseListDTO, CaseStatus } from "@docdo/contracts";
import { api } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/constants";
import { CaseTable } from "@/components/cases/case-table";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Casos" };

const STATUSES = Object.keys(STATUS_LABEL) as CaseStatus[];

export default async function AdminCases({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; galeria?: string }> }) {
  const { q = "", status, galeria } = await searchParams;
  const term = q.trim();
  const params = new URLSearchParams();
  if (term) params.set("q", term);
  if (status) params.set("status", status);
  if (galeria) params.set("galeria", "1");
  const { cases, counts: byStatus } = await api<CaseListDTO>(`/admin/cases?${params}`);
  const counts = Object.entries(byStatus).map(([s, n]) => ({ status: s as CaseStatus, _count: n ?? 0 }));
  const qs = (s?: string) => {
    const p = new URLSearchParams();
    if (term) p.set("q", term);
    if (s) p.set("status", s);
    return `/admin/casos${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Casos" subtitle="Gerencie status, associe modelos 3D e publique na galeria." actions={<Link href="/admin/casos/novo" className="btn-primary"><Plus className="size-4" /> Novo caso</Link>} />
      <form className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input name="q" defaultValue={q} placeholder="Buscar por título, código (DD-00001), paciente, médico, clínica…" className="input pl-10" />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn-ghost">Buscar</button>
      </form>
      <div className="mb-6 flex flex-wrap gap-1.5">
        <Link href={qs()} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${!status && !galeria ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink-200 ring-white/10"}`}>
          Todos · {counts.reduce((a, c) => a + c._count, 0)}
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={qs(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status === s ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink-200 ring-white/10"}`}>
            {STATUS_LABEL[s]} · {counts.find((c) => c.status === s)?._count ?? 0}
          </Link>
        ))}
        <Link href="/admin/casos?galeria=1" className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${galeria ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink-200 ring-white/10"}`}>
          Na galeria
        </Link>
      </div>
      {cases.length ? <CaseTable cases={cases} hrefBase="/admin/casos" showOrg /> : <EmptyState icon={FolderKanban} title="Nenhum caso encontrado" />}
    </>
  );
}
