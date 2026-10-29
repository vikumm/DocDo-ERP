"use client";
import clsx from "clsx";
import { Layers, Check, Loader2, AlertTriangle } from "lucide-react";
import { bytes } from "@/lib/format";
import type { VolumeInfo } from "@/lib/editor/pipeline";
import type { PipelinePhase } from "@/lib/editor/pipeline";

const PHASE_LABEL: Record<PipelinePhase, string> = {
  staging: "Preparando arquivos",
  extract: "Extraindo e identificando",
  read: "Convertendo séries",
  write: "Gerando volumes",
};

export function VolumeList({
  volumes,
  selected,
  onSelect,
  busy,
  phase,
  done,
  total,
  message,
  error,
}: {
  volumes: VolumeInfo[];
  selected: string | null;
  onSelect: (seriesId: string) => void;
  busy: boolean;
  phase: PipelinePhase;
  done: number;
  total: number;
  message?: string;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-red-300">
        <AlertTriangle className="size-4" /> {error}
      </p>
    );
  }
  if (busy) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-ink-300">
        <Loader2 className="size-4 animate-spin" />
        {PHASE_LABEL[phase]}
        {total > 0 && ` (${done}/${total})`}
        {message && ` · ${message}`}…
      </p>
    );
  }
  if (volumes.length === 0) return null;

  return (
    <div className="card p-4">
      <p className="mb-3 text-sm font-semibold text-ink-50">Volumes detectados ({volumes.length})</p>
      <ul className="space-y-2">
        {volumes.map((v) => (
          <li key={v.seriesId}>
            <button
              type="button"
              onClick={() => onSelect(v.seriesId)}
              aria-pressed={selected === v.seriesId}
              className={clsx(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                selected === v.seriesId ? "bg-brand-500/10 ring-1 ring-brand-500/30" : "hover:bg-white/5"
              )}
            >
              <Layers className="size-4 shrink-0 text-ink-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-100">{v.description}</span>
                <span className="block text-xs text-ink-400">
                  {[v.modality, v.sliceCount != null ? `${v.sliceCount} fatias` : null, bytes(v.size)].filter(Boolean).join(" · ")}
                </span>
              </span>
              {selected === v.seriesId && <Check className="size-4 shrink-0 text-brand-400" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
