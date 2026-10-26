import { Check } from "lucide-react";
import clsx from "clsx";
import type { CaseStatus } from "@docdo/contracts";
import { STATUS_FLOW } from "@/lib/constants";

const STEPS = ["Caso criado", "DICOM enviado", "Pagamento", "Reconstrução", "3D pronto"];

export function StatusStepper({ status }: { status: CaseStatus }) {
  if (status === "CANCELLED") return <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">Este caso foi cancelado.</p>;
  const idx = STATUS_FLOW.indexOf(status);
  return (
    <ol className="grid grid-cols-5 gap-2">
      {STEPS.map((label, i) => {
        // o status indica a última etapa concluída; a seguinte é a atual
        const done = i <= idx;
        const current = i === idx + 1;
        return (
          <li key={label} className="flex flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={clsx("h-0.5 flex-1", i === 0 ? "opacity-0" : done || current ? "bg-brand-500" : "bg-white/10")} />
              <span
                className={clsx(
                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ring-1",
                  done ? "bg-brand-500 text-on-brand ring-brand-500" : current ? "bg-brand-500/15 text-brand-300 ring-brand-500/50" : "bg-white/[0.03] text-ink-400 ring-white/10",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={clsx("h-0.5 flex-1", i === STEPS.length - 1 ? "opacity-0" : done ? "bg-brand-500" : "bg-white/10")} />
            </div>
            <span className={clsx("mt-2 text-[11px] leading-tight font-medium sm:text-xs", done || current ? "text-ink-100" : "text-ink-400")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
