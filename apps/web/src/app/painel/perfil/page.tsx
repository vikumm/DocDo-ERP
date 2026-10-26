import type { Metadata } from "next";
import type { SessionDTO } from "@docdo/contracts";
import { api } from "@/lib/api";
import { requireMe } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { signOutOtherDevices } from "@/lib/actions/profile";
import { Section } from "@/components/ui/misc";
import { DeleteAccount } from "./privacy";
import { PageHeader } from "@/components/ui/misc";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const me = await requireMe(["DOCTOR", "PATIENT", "SECRETARY"]);
  const u = me.user;
  const sessions = await api<SessionDTO[]>("/me/sessions");
  return (
    <>
      <PageHeader title="Perfil" subtitle={u.email} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ProfileForm
          doctor={u.role === "DOCTOR"}
          values={{ name: u.name, phone: u.phone ?? "", cpf: u.cpf ?? "", crm: u.crm ?? "", specialty: u.specialty ?? "", institution: u.institution ?? "" }}
        />
        <PasswordForm />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title={`Sessões abertas (${sessions.length})`}>
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.id} className="text-sm">
                <p className="truncate text-ink-100">
                  {s.userAgent?.match(/(Chrome|Firefox|Safari|Edg)[^ ]*/)?.[0] ?? "Navegador"} {s.current && <span className="ml-1 text-xs font-semibold text-brand-400">este aparelho</span>}
                </p>
                <p className="text-xs text-ink-400">Desde {dateTime(s.createdAt)}{s.ip ? ` · IP ${s.ip}` : ""}</p>
              </li>
            ))}
          </ul>
          {sessions.length > 1 && (
            <form action={signOutOtherDevices} className="mt-4">
              <button className="btn-ghost">Sair dos outros aparelhos</button>
            </form>
          )}
        </Section>

        <Section title="Meus dados (LGPD)">
          <p className="text-sm text-ink-300">Baixe uma cópia dos seus dados ou peça a exclusão da sua conta.</p>
          <p className="mt-1 text-xs text-ink-400">
            Aceite da Política de Privacidade: {u.consentAt ? `${dateTime(u.consentAt)} (versão ${u.consentVersion})` : "pendente"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/api/me/export" className="btn-ghost">Baixar meus dados (JSON)</a>
            <DeleteAccount />
          </div>
        </Section>
      </div>
    </>
  );
}
