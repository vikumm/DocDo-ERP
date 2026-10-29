"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard,
  FolderPlus,
  UserRound,
  Stethoscope,
  Users,
  FolderKanban,
  ShoppingCart,
  Images,
  ShieldCheck,
  UserCog,
  Building2,
  Contact,
  Scan,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/misc";
import { logout, switchOrg } from "@/lib/actions/auth";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  new: FolderPlus,
  profile: UserRound,
  doctors: Stethoscope,
  patients: Users,
  cases: FolderKanban,
  orders: ShoppingCart,
  gallery: Images,
  shield: ShieldCheck,
  team: UserCog,
  clinics: Building2,
  contacts: Contact,
  editor: Scan,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

export function AppShell({
  nav,
  user,
  badge,
  notice,
  orgs,
  children,
}: {
  nav: NavItem[];
  user: { name: string; email: string };
  badge: string;
  notice?: string;
  /** clínicas do usuário e a atual: aparece o nome e, com mais de uma, o seletor */
  orgs?: { current: { id: string; name: string } | null; all: { id: string; name: string }[] };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo href={nav[0].href} />
        <button className="rounded-lg p-1.5 text-ink-300 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
          <X className="size-5" />
        </button>
      </div>
      <p className="px-5 pb-2 text-[10px] font-bold tracking-[0.18em] text-brand-500 uppercase">{badge}</p>
      {orgs?.current && (
        <div className="mx-3 mb-3 rounded-xl border border-white/[0.06] px-3 py-2">
          <p className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">Clínica</p>
          {orgs.all.length > 1 ? (
            <form action={switchOrg}>
              <select
                name="organizationId"
                defaultValue={orgs.current.id}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="mt-0.5 w-full truncate bg-transparent text-sm font-semibold text-ink-50 outline-none"
                aria-label="Trocar de clínica"
              >
                {orgs.all.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </form>
          ) : (
            <p className="truncate text-sm font-semibold text-ink-50">{orgs.current.name}</p>
          )}
        </div>
      )}
      <nav className="flex-1 space-y-0.5 px-3">
        {nav.map((i) => {
          const Icon = ICONS[i.icon];
          const active = isActive(i);
          return (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/20" : "text-ink-300 hover:bg-white/[0.04] hover:text-ink-50",
              )}
            >
              <Icon className="size-4" /> {i.label}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-2xl border border-white/[0.06] p-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-50">{user.name}</p>
            <p className="truncate text-xs text-ink-400">{user.email}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <ThemeToggle withLabel />
        </div>
        <form action={logout}>
          <button className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold text-ink-300 hover:bg-white/5 hover:text-ink-50">
            <LogOut className="size-3.5" /> Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[0.06] bg-ink-950/60 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/[0.06] bg-ink-900">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.06] bg-ink-900/80 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-ink-100" aria-label="Abrir menu">
          <Menu className="size-5" />
        </button>
        <Logo href={nav[0].href} />
        <ThemeToggle className="size-9 border-transparent" />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        {notice && <p className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">{notice}</p>}
        {children}
      </main>
    </div>
  );
}
