import type { Metadata } from "next";
import { UserCog } from "lucide-react";
import type { TeamMemberDTO } from "@docdo/contracts";
import { api } from "@/lib/api";
import { requireMe } from "@/lib/auth";
import { ORG_ROLE_LABEL } from "@/lib/constants";
import { date } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, PageHeader, Section } from "@/components/ui/misc";
import { ActionForm } from "@/components/ui/action-form";
import { inviteSecretary, renameOrg } from "@/lib/actions/org";
import { RemoveMember } from "./remove-member";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const me = await requireMe(["DOCTOR", "SECRETARY"]);
  if (!me.currentOrg) return <EmptyState icon={UserCog} title="Você ainda não faz parte de uma clínica" />;
  const team = await api<{ name: string; role: string; members: TeamMemberDTO[] }>("/org/team");
  const owner = team.role === "OWNER";

  return (
    <>
      <PageHeader title="Equipe" subtitle={team.name} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title={`Pessoas com acesso (${team.members.length})`}>
          <ul className="divide-y divide-white/[0.04]">
            {team.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-50">{m.name}</p>
                  <p className="truncate text-xs text-ink-400">{m.email} · desde {date(m.createdAt)}</p>
                </div>
                {m.pending && <Badge tone="warn">Convite pendente</Badge>}
                <Badge tone={m.role === "OWNER" ? "ok" : "neutral"}>{ORG_ROLE_LABEL[m.role]}</Badge>
                {owner && m.role !== "OWNER" && <RemoveMember userId={m.userId} name={m.name} />}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-400">
            A secretária vê os casos e os pacientes da clínica, envia exames e acompanha o andamento. Ela não abre o 3D, não lê a descrição clínica e não baixa os
            exames.
          </p>
        </Section>

        {owner && (
          <div className="space-y-6">
            <Section title="Convidar secretária">
              <ActionForm action={inviteSecretary} submit="Enviar convite" pending="Enviando…" className="space-y-4">
                <div>
                  <label className="label" htmlFor="inv-name">Nome</label>
                  <input id="inv-name" name="name" required className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="inv-email">E-mail</label>
                  <input id="inv-email" name="email" type="email" required className="input" />
                </div>
              </ActionForm>
            </Section>
            <Section title="Nome da clínica">
              <ActionForm action={renameOrg} submit="Salvar nome" className="space-y-4">
                <input name="name" defaultValue={team.name} required minLength={3} maxLength={120} className="input" aria-label="Nome da clínica" />
              </ActionForm>
            </Section>
          </div>
        )}
      </div>
    </>
  );
}
