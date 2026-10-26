import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import type { GalleryCaseDTO } from "@docdo/contracts";
import { api } from "@/lib/api";
import { CaseCard } from "@/components/site/case-card";

export const metadata: Metadata = { title: "Galeria de casos 3D" };
export const dynamic = "force-dynamic";

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ q?: string; regiao?: string }> }) {
  const { q = "", regiao = "" } = await searchParams;
  const all = await api<GalleryCaseDTO[]>("/public/gallery");
  const regions = [...new Set(all.map((c) => c.bodyRegion).filter(Boolean))] as string[];
  const term = q.trim().toLowerCase();
  const cases = all.filter(
    (c) =>
      (!regiao || c.bodyRegion === regiao) &&
      (!term || `${c.title} ${c.description ?? ""} ${c.bodyRegion ?? ""} ${c.models.map((m) => m.name).join(" ")}`.toLowerCase().includes(term)),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-32 pb-24 sm:px-6">
      <p className="text-sm font-semibold text-brand-400">Galeria DocDo</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-ink-50">Casos reconstruídos em 3D</h1>
      <p className="mt-3 max-w-2xl text-ink-300">
        Abra qualquer caso no visualizador: gire, corte, meça e isole estruturas. Todos os casos foram anonimizados e publicados com autorização.
      </p>

      <form className="mt-10 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input name="q" defaultValue={q} placeholder="Buscar por órgão, estrutura ou procedimento…" className="input pl-10" />
        </div>
        {regiao && <input type="hidden" name="regiao" value={regiao} />}
        <button className="btn-ghost">Buscar</button>
      </form>
      {regions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={{ pathname: "/galeria", query: q ? { q } : {} }} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${!regiao ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink-200 ring-white/10 hover:ring-white/25"}`}>
            Todas
          </Link>
          {regions.map((r) => (
            <Link key={r} href={{ pathname: "/galeria", query: { ...(q ? { q } : {}), regiao: r } }} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${regiao === r ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink-200 ring-white/10 hover:ring-white/25"}`}>
              {r}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cases.map((c) => (
          <CaseCard key={c.id} c={c} href={`/visualizador/${c.id}`} />
        ))}
      </div>
      {cases.length === 0 && <p className="mt-10 text-sm text-ink-400">Nenhum caso encontrado para esse filtro.</p>}

      <div className="card mt-16 flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center">
        <div>
          <p className="text-lg font-semibold text-ink-50">Quer ver o seu exame assim?</p>
          <p className="mt-1 text-sm text-ink-300">Crie sua conta, envie o DICOM e receba seu modelo 3D.</p>
        </div>
        <Link href="/cadastro" className="btn-primary">Enviar meu exame</Link>
      </div>
    </div>
  );
}
