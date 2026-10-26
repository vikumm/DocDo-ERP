import type { Metadata } from "next";
import Link from "next/link";
import { Box, Clock, FolderOpen, Plus, Search, X } from "lucide-react";
import type { CaseListDTO, CaseStatus } from "@docdo/contracts";
import { api } from "@/lib/api";
import { requireMe } from "@/lib/auth";
import { CaseTable } from "@/components/cases/case-table";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Meus casos" };

export default async function PanelHome({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const me = await requireMe(["DOCTOR", "PATIENT", "SECRETARY"]);
  const user = me.user;
  const { status, q = "" } = await searchParams;
  const term = q.trim();
  const qs = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (term) p.set("q", term);
    return p.size ? `?${p}` : "";
  };
  const { cases, counts } = await api<CaseListDTO>(`/cases${qs(status)}`);
  const count = (s: CaseStatus[]) => s.reduce((a, k) => a + (counts[k] ?? 0), 0);
  const isDoctor = user.role === "DOCTOR";
  const isSecretary = user.role === "SECRETARY";
  // quem participa de mais de uma clínica vê a coluna da clínica
  const multiOrg = new Set(cases.map((c) => c.organization?.name ?? "")).size > 1;
  const firstName = user.name.replace(/^(dr|dra)\.?\s+/i, "").split(" ")[0];

  const tabs = [
    { key: undefined, label: "Todos" },
    { key: "andamento", label: "Em andamento" },
    { key: "prontos", label: "Prontos" },
  ];

  return (
    <>
      <PageHeader
        title={`Olá, ${firstName}`}
        subtitle={
          isSecretary
            ? `Casos de ${me.currentOrg?.organizationName ?? "sua clínica"}: acompanhe o status e envie os exames dos pacientes.`
            : isDoctor
              ? "Acompanhe os casos dos seus pacientes e abra as reconstruções 3D."
              : "Acompanhe seus exames e veja as reconstruções 3D."
        }
        actions={
          <Link href="/painel/casos/novo" className="btn-primary">
            <Plus className="size-4" /> Enviar exame
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total de casos" value={count(["CREATED", "UPLOADED", "PAID", "PROCESSING", "READY", "CANCELLED"])} icon={FolderOpen} />
        <Stat label="Em andamento" value={count(["CREATED", "UPLOADED", "PAID", "PROCESSING"])} hint={`${count(["CREATED"])} aguardando DICOM · ${count(["UPLOADED"])} aguardando pagamento`} icon={Clock} />
        <Stat label="3D prontos" value={count(["READY"])} icon={Box} />
      </div>

      <form className="mt-10 flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input
            name="q"
            defaultValue={term}
            placeholder={user.role === "PATIENT" ? "Buscar por exame, médico ou código…" : "Buscar por paciente (nome ou e-mail), exame ou código…"}
            className="input pl-10"
            aria-label="Buscar casos"
          />
        </div>
        <button className="btn-ghost">Buscar</button>
        {term && (
          <Link href={`/painel${status ? `?status=${status}` : ""}`} className="btn-ghost" aria-label="Limpar busca">
            <X className="size-4" />
          </Link>
        )}
      </form>

      <div className="mt-4 mb-4 flex flex-wrap items-center gap-1">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={`/painel${qs(t.key)}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${status === t.key ? "bg-white/[0.07] text-ink-50" : "text-ink-300 hover:text-ink-50"}`}
          >
            {t.label}
          </Link>
        ))}
        {term && <span className="ml-2 text-sm text-ink-400">{cases.length} resultado(s) para “{term}”</span>}
      </div>
      {cases.length ? (
        <CaseTable cases={cases} hrefBase="/painel/casos" showPeople={isDoctor || isSecretary ? "patient" : "doctor"} showOrg={multiOrg} />
      ) : (
        term ? (
          <EmptyState icon={Search} title="Nenhum caso encontrado" text={`Nada corresponde a “${term}”. Confira o nome ou o e-mail do paciente.`} />
        ) : (
        <EmptyState
          icon={FolderOpen}
          title="Nenhum caso por aqui"
          text="Crie um caso e envie os arquivos DICOM do exame para receber a reconstrução 3D."
          action={<Link href="/painel/casos/novo" className="btn-primary">Enviar primeiro exame</Link>}
        />
        )
      )}
    </>
  );
}
