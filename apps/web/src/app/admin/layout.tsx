import { requireMe } from "@/lib/auth";
import { AppShell, type NavItem } from "@/components/shell/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // sem 2FA ativo, o admin é levado para a configuração antes de ver qualquer dado (a API também recusa)
  const me = await requireMe(["ADMIN"]);
  const nav: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true },
    { href: "/admin/casos", label: "Casos", icon: "cases" },
    { href: "/admin/clinicas", label: "Clínicas", icon: "clinics" },
    { href: "/admin/medicos", label: "Médicos", icon: "doctors" },
    { href: "/admin/pacientes", label: "Pacientes", icon: "patients" },
    { href: "/admin/compras", label: "Compras", icon: "orders" },
    { href: "/galeria", label: "Galeria pública", icon: "gallery" },
    { href: "/seguranca/2fa", label: "Segurança (2FA)", icon: "shield" },
  ];
  return (
    <AppShell nav={nav} user={{ name: me.user.name, email: me.user.email }} badge="Administração">
      {children}
    </AppShell>
  );
}
