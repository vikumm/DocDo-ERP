import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { CaseListItemDTO, MembershipDTO, UserDTO } from "@docdo/contracts";
import { api, ApiError } from "@/lib/api";
import { requireMe } from "@/lib/auth";
import { UserActions } from "@/components/admin/user-actions";
import { Badge } from "@/components/ui/badge";
import { ORG_ROLE_LABEL, ROLE_LABEL } from "@/lib/constants";
import { date } from "@/lib/format";
import { PageHeader, Section } from "@/components/ui/misc";
import { UserForm } from "@/components/admin/user-form";
import { CaseTable } from "@/components/cases/case-table";

export default async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(["ADMIN"]);
  let data: { user: UserDTO; memberships: MembershipDTO[]; cases: CaseListItemDTO[] };
  try {
    data = await api(`/admin/users/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { user: u, memberships, cases } = data;
  const back = u.role === "DOCTOR" ? "/admin/medicos" : u.role === "PATIENT" ? "/admin/pacientes" : u.role === "SECRETARY" ? "/admin/clinicas" : "/admin";
  return (
    <>
      <Link href={back} className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-50">
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <PageHeader title={u.name} subtitle={`${ROLE_LABEL[u.role]} · desde ${date(u.createdAt)}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {u.emailVerifiedAt ? <Badge tone="ok">E-mail confirmado</Badge> : <Badge tone="warn">E-mail não confirmado</Badge>}
        {u.role === "DOCTOR" && (u.approvedAt ? <Badge tone="ok">Médico aprovado</Badge> : <Badge tone="warn">Aguardando aprovação</Badge>)}
        {u.role !== "ADMIN" && (u.consentAt ? <Badge tone="neutral">{`Consentimento ${date(u.consentAt)}`}</Badge> : <Badge tone="warn">Sem consentimento</Badge>)}
        {u.role === "ADMIN" && (u.totpEnabledAt ? <Badge tone="ok">2FA ativo</Badge> : <Badge tone="danger">2FA pendente</Badge>)}
        {u.deletionRequestedAt && <Badge tone="danger">{`Exclusão pedida em ${date(u.deletionRequestedAt)}`}</Badge>}
        {memberships.map((m) => (
          <Badge key={m.organizationId} tone="info">{`${ORG_ROLE_LABEL[m.role]} · ${m.organizationName}`}</Badge>
        ))}
      </div>
      <div className="card mb-6 max-w-3xl p-6">
        <UserActions
          id={u.id}
          name={u.name}
          role={u.role}
          pendingApproval={u.role === "DOCTOR" && !u.approvedAt}
          deletionRequested={!!u.deletionRequestedAt}
          isSelf={u.id === me.user.id}
        />
      </div>
      <UserForm
        id={u.id}
        values={{ name: u.name, email: u.email, role: u.role, phone: u.phone ?? "", cpf: u.cpf ?? "", crm: u.crm ?? "", specialty: u.specialty ?? "", institution: u.institution ?? "", active: u.active }}
      />
      {cases.length > 0 && (
        <Section title={`Casos (${cases.length})`} className="mt-6">
          <CaseTable cases={cases} hrefBase="/admin/casos" />
        </Section>
      )}
    </>
  );
}
