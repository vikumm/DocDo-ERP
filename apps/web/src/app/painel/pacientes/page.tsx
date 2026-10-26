import type { Metadata } from "next";
import Link from "next/link";
import { Contact, Search, X } from "lucide-react";
import type { OrgPatientDTO } from "@docdo/contracts";
import { api } from "@/lib/api";
import { requireMe } from "@/lib/auth";
import { date } from "@/lib/format";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Pacientes" };

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireMe(["DOCTOR", "SECRETARY"]);
  if (!me.currentOrg) return <EmptyState icon={Contact} title="Você ainda não faz parte de uma clínica" />;
  const { q = "" } = await searchParams;
  const term = q.trim();
  // a API devolve só os pacientes do médico (ou da clínica, para a secretária)
  const patients = await api<OrgPatientDTO[]>(`/org/patients${term ? `?q=${encodeURIComponent(term)}` : ""}`);
  const doctor = me.user.role === "DOCTOR";

  return (
    <>
      <PageHeader
        title={doctor ? "Meus pacientes" : "Pacientes"}
        subtitle={
          term
            ? `${patients.length} resultado(s) para “${term}”`
            : doctor
              ? `${patients.length} paciente(s) com casos sob sua responsabilidade em ${me.currentOrg.organizationName}`
              : `${patients.length} paciente(s) com casos em ${me.currentOrg.organizationName}`
        }
        actions={<Link href="/painel/casos/novo" className="btn-primary">Enviar exame</Link>}
      />
      <form className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input name="q" defaultValue={term} placeholder="Buscar paciente por nome ou e-mail…" className="input pl-10" aria-label="Buscar pacientes" />
        </div>
        <button className="btn-ghost">Buscar</button>
        {term && (
          <Link href="/painel/pacientes" className="btn-ghost" aria-label="Limpar busca">
            <X className="size-4" />
          </Link>
        )}
      </form>
      {patients.length ? (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[600px]">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Casos</th>
                <th>Último caso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="flex items-center gap-3">
                      <Avatar name={p.name} />
                      <span>
                        <span className="block font-semibold text-ink-50">{p.name}</span>
                        <span className="text-xs text-ink-400">{p.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="text-ink-200 tabular-nums">{p.cases}</td>
                  <td className="text-ink-300">{date(p.lastCaseAt)}</td>
                  <td className="text-right">
                    <Link href={`/painel?q=${encodeURIComponent(p.email)}`} className="text-xs font-semibold text-brand-400 hover:text-brand-300">
                      Ver casos
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : term ? (
        <EmptyState icon={Search} title="Nenhum paciente encontrado" text={`Nada corresponde a “${term}”.`} />
      ) : (
        <EmptyState icon={Contact} title="Nenhum paciente ainda" text="Os pacientes aparecem aqui quando você cria o primeiro caso para eles." />
      )}
    </>
  );
}
