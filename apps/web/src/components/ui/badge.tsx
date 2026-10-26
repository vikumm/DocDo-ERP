import clsx from "clsx";
import type { CaseStatus, OrderStatus } from "@docdo/contracts";
import { ORDER_LABEL, ORDER_TONE, STATUS_LABEL, STATUS_TONE } from "@/lib/constants";

export type Tone = "neutral" | "warn" | "info" | "accent" | "ok" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-white/[0.05] text-ink-200 ring-white/10",
  warn: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
  info: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
  accent: "bg-violet-400/10 text-violet-300 ring-violet-400/25",
  ok: "bg-brand-500/10 text-brand-300 ring-brand-500/25",
  danger: "bg-red-400/10 text-red-300 ring-red-400/25",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset", tones[tone], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export const StatusBadge = ({ status }: { status: CaseStatus }) => <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
export const OrderBadge = ({ status }: { status: OrderStatus }) => <Badge tone={ORDER_TONE[status]}>{ORDER_LABEL[status]}</Badge>;
