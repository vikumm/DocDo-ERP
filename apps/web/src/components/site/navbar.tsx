"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const links = [
  { href: "/#solucoes", label: "Soluções" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/galeria", label: "Galeria 3D" },
  { href: "/#planos", label: "Planos" },
  { href: "/#empresa", label: "A Empresa" },
  { href: "/#contato", label: "Contato" },
];

export function Navbar({ loggedHref }: { loggedHref?: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={clsx("fixed inset-x-0 top-0 z-50 transition", scrolled || open ? "border-b border-white/[0.06] bg-ink-900/80 backdrop-blur-xl" : "bg-transparent")}>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Logo />
        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-200 transition hover:text-ink-50">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          {loggedHref ? (
            <Link href={loggedHref} className="btn-primary">Acessar painel</Link>
          ) : (
            <>
              <Link href="/entrar" className="btn-ghost">Entrar</Link>
              <Link href="/cadastro" className="btn-primary">Enviar exame</Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle className="border-transparent" />
          <button className="rounded-lg p-2 text-ink-100" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="border-t border-white/[0.06] px-4 pt-2 pb-5 lg:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-100 hover:bg-white/5">
              {l.label}
            </Link>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {loggedHref ? (
              <Link href={loggedHref} className="btn-primary col-span-2">Acessar painel</Link>
            ) : (
              <>
                <Link href="/entrar" className="btn-ghost">Entrar</Link>
                <Link href="/cadastro" className="btn-primary">Enviar exame</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
