import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import type { OrganizationRowDTO } from "@docdo/contracts";
import { api } from "@/lib/api";
import { ORG_ROLE_LABEL } from "@/lib/constants";
import { date } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Clínicas" };

export default async function ClinicsPage() {
  const orgs = await api<OrganizationRowDTO[]>("/admin/organizations");
  return (
    <>
      <PageHeader title="Clínicas" subtitle={`${orgs.length} clínica(s) no DocDo. Cada uma é um tenant isolado.`} />
      {orgs.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {orgs.map((o) => (
            <section key={o.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ink-50">{o.name}</h2>
                  <p className="text-xs text-ink-400">desde {date(o.createdAt)}</p>
                </div>
                <Link href={`/admin/casos?q=${encodeURIComponent(o.name)}`} className="text-xs font-semibold text-brand-400 hover:text-brand-300">
                  {o.cases} caso(s)
                </Link>
              </div>
              <ul className="mt-4 space-y-2">
                {o.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/admin/usuarios/${m.userId}`} className="min-w-0 truncate text-ink-100 hover:text-brand-300">
                      {m.name} <span className="text-xs text-ink-400">{m.email}</span>
                    </Link>
                    <span className="flex shrink-0 gap-1">
                      {m.pending && <Badge tone="warn">Convite pendente</Badge>}
                      <Badge tone={m.role === "OWNER" ? "ok" : "neutral"}>{ORG_ROLE_LABEL[m.role]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={Building2} title="Nenhuma clínica ainda" text="Cada médico ganha um consultório quando confirma o cadastro." />
      )}
    </>
  );
}
