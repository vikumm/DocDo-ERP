import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { ROLE_LABEL } from "@/lib/constants";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe(["DOCTOR", "PATIENT", "SECRETARY"]);
  // contas anteriores ao registro de consentimento aceitam a política antes de continuar
  if (!me.user.consentAt) redirect("/consentimento");
  const role = me.user.role;
  const clinic = role !== "PATIENT";

  const nav: NavItem[] = [
    { href: "/painel", label: role === "PATIENT" ? "Meus casos" : "Casos", icon: "dashboard", exact: true },
    { href: "/painel/casos/novo", label: "Enviar exame", icon: "new" },
    { href: "/painel/editor", label: "Editor", icon: "editor" },
    ...(clinic ? ([{ href: "/painel/pacientes", label: "Pacientes", icon: "contacts" }, { href: "/painel/equipe", label: "Equipe", icon: "team" }] as NavItem[]) : []),
    { href: "/galeria", label: "Galeria 3D", icon: "gallery" },
    { href: "/painel/perfil", label: "Perfil", icon: "profile" },
  ];
  return (
    <AppShell
      nav={nav}
      user={{ name: me.user.name, email: me.user.email }}
      badge={`Área ${role === "SECRETARY" ? "da secretária" : `do ${ROLE_LABEL[role].toLowerCase()}`}`}
      orgs={
        clinic
          ? {
              current: me.currentOrg ? { id: me.currentOrg.organizationId, name: me.currentOrg.organizationName } : null,
              all: me.memberships.map((m) => ({ id: m.organizationId, name: m.organizationName })),
            }
          : undefined
      }
      notice={me.pendingDoctor ? "Seu cadastro de médico está em análise pela equipe DocDo. Assim que for aprovado, você poderá criar casos e receber exames de pacientes." : undefined}
    >
      {children}
    </AppShell>
  );
}
