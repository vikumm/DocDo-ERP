import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import type { AdminUserRowDTO, Role } from "@docdo/contracts";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { ToggleActive } from "./toggle-active";

export async function UsersPage({ role, q }: { role: Extract<Role, "DOCTOR" | "PATIENT">; q: string }) {
  const doctor = role === "DOCTOR";
  const term = q.trim();
  const users = await api<AdminUserRowDTO[]>(`/admin/users?role=${role}${term ? `&q=${encodeURIComponent(term)}` : ""}`);
  const spent = (id: string) => users.find((u) => u.id === id)?.paid ?? 0;

  return (
    <>
      <PageHeader
        title={doctor ? "Médicos" : "Pacientes"}
        subtitle={`${users.length} ${doctor ? "médico(s)" : "paciente(s)"} cadastrados`}
        actions={<Link href={`/admin/usuarios/novo?role=${role}`} className="btn-primary"><Plus className="size-4" /> {doctor ? "Novo médico" : "Novo paciente"}</Link>}
      />
      <form className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input name="q" defaultValue={q} placeholder={doctor ? "Buscar por nome, e-mail ou CRM…" : "Buscar por nome, e-mail ou CPF…"} className="input pl-10" />
        </div>
        <button className="btn-ghost">Buscar</button>
      </form>
      {users.length ? (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[760px]">
            <thead>
              <tr>
                <th>Nome</th>
                {doctor ? <th>CRM / Especialidade</th> : <th>Contato</th>}
                <th>Casos</th>
                <th>Pagos</th>
                <th>Cadastro</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const count = u.cases;
                return (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/usuarios/${u.id}`} className="flex items-center gap-3">
                        <Avatar name={u.name} />
                        <span>
                          <span className="block font-semibold text-ink-50 hover:text-brand-300">{u.name}</span>
                          <span className="text-xs text-ink-400">{u.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-ink-200">
                      {doctor ? (
                        <>{u.crm ?? "—"}<span className="block text-xs text-ink-400">{u.specialty ?? ""}{u.institution ? ` · ${u.institution}` : ""}</span></>
                      ) : (
                        <>{u.phone ?? "—"}<span className="block text-xs text-ink-400">{u.cpf ?? ""}</span></>
                      )}
                    </td>
                    <td><Link href={`/admin/casos?q=${encodeURIComponent(u.name)}`} className="font-semibold text-ink-50 tabular-nums hover:text-brand-300">{count}</Link></td>
                    <td className="text-ink-200 tabular-nums">{spent(u.id).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-ink-300">{date(u.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {u.deletionRequestedAt ? <Badge tone="danger">Exclusão pedida</Badge> : u.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="danger">Inativo</Badge>}
                        {!u.emailVerifiedAt && <Badge tone="warn">E-mail pendente</Badge>}
                        {doctor && !u.approvedAt && <Badge tone="warn">Aguardando aprovação</Badge>}
                      </div>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={`/admin/usuarios/${u.id}`} className="mr-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-200 hover:bg-white/5">Editar</Link>
                      <ToggleActive id={u.id} active={u.active} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Users} title="Ninguém encontrado" />
      )}
    </>
  );
}
