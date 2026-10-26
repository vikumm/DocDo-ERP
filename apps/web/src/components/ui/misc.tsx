import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { initials } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-300">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={clsx("inline-grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500/30 to-brand-700/20 text-xs font-bold text-brand-200 ring-1 ring-brand-500/30", className)}>
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20">
        <Icon className="size-5" />
      </span>
      <p className="font-semibold text-ink-50">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-300">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-ink-300 uppercase">{label}</p>
        {Icon && <Icon className="size-4 text-ink-400" />}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-ink-50 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

export function Section({ title, actions, children, className }: { title: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("card", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-sm font-semibold text-ink-50">{title}</h2>
        {actions}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } | null }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p className={clsx("rounded-xl px-3.5 py-2.5 text-sm", state.error ? "bg-red-500/10 text-red-300" : "bg-brand-500/10 text-brand-300")}>
      {state.error ?? state.ok}
    </p>
  );
}
