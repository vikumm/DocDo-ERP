"use client";
import { useActionState, useTransition } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import type { CaseStatus } from "@docdo/contracts";
import { deleteCase, deleteModel, setCaseStatus, updateGallery, updateModel } from "@/lib/actions/admin";
import { bytes } from "@/lib/format";
import { SubmitButton } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/misc";

type ModelRowData = { id: string; name: string; color: string; opacity: number; sortOrder: number; format: string; size: number; volumeMl: number | null };

export function ModelRow({ m }: { m: ModelRowData }) {
  const [pending, start] = useTransition();
  return (
    <form action={(fd) => start(() => updateModel(m.id, fd))} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3 sm:grid-cols-[auto_1fr_8rem_4rem_auto]">
      <label className="relative size-8 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/20" style={{ background: m.color }}>
        <input type="color" name="color" defaultValue={m.color} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <div className="min-w-0">
        <input name="name" defaultValue={m.name} className="input py-1.5" aria-label="Nome da estrutura" />
        <p className="mt-1 text-[11px] text-ink-400">
          {m.format.toUpperCase()} · {bytes(m.size)}
          {m.volumeMl ? ` · ${m.volumeMl.toLocaleString("pt-BR")} ml` : ""}
        </p>
      </div>
      <label className="hidden items-center gap-2 text-[11px] text-ink-400 sm:flex">
        Opac.
        <input type="range" name="opacity" min={0.05} max={1} step={0.05} defaultValue={m.opacity} className="w-full" />
      </label>
      <input name="sortOrder" type="number" defaultValue={m.sortOrder} className="input hidden py-1.5 sm:block" aria-label="Ordem" />
      <div className="flex gap-1">
        <button className="rounded-lg p-2 text-ink-300 hover:bg-white/5 hover:text-brand-300" title="Salvar" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => confirm(`Remover "${m.name}"?`) && start(() => deleteModel(m.id))}
          className="rounded-lg p-2 text-ink-400 hover:bg-red-500/10 hover:text-red-300"
          title="Remover"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </form>
  );
}

export function GalleryForm({ caseId, isPublic, publicTitle, publicDescription }: { caseId: string; isPublic: boolean; publicTitle: string; publicDescription: string }) {
  const [state, action] = useActionState(updateGallery.bind(null, caseId), null);
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-center gap-3 text-sm text-ink-100">
        <input type="checkbox" name="isPublic" defaultChecked={isPublic} className="size-4 accent-brand-500" />
        Publicar na galeria pública
      </label>
      <div>
        <label className="label" htmlFor="publicTitle">Título público</label>
        <input id="publicTitle" name="publicTitle" defaultValue={publicTitle} className="input" placeholder="Sem nome ou dados do paciente" />
      </div>
      <div>
        <label className="label" htmlFor="publicDescription">Descrição pública</label>
        <textarea id="publicDescription" name="publicDescription" rows={3} defaultValue={publicDescription} className="input resize-none" />
      </div>
      <p className="text-xs text-ink-400">Confirme que há autorização do paciente e que os modelos não contêm dados identificáveis.</p>
      <FormMessage state={state} />
      <SubmitButton className="btn-ghost">Salvar galeria</SubmitButton>
    </form>
  );
}

export function StatusButton({ caseId, status, children, primary }: { caseId: string; status: CaseStatus; children: React.ReactNode; primary?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(() => setCaseStatus(caseId, status))} disabled={pending} className={primary ? "btn-primary" : "btn-ghost"}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function DeleteCaseButton({ caseId }: { caseId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => confirm("Excluir o caso, os DICOM e os modelos 3D? Esta ação não pode ser desfeita.") && start(() => deleteCase(caseId))}
      disabled={pending}
      className="btn-danger"
    >
      <Trash2 className="size-4" /> Excluir caso
    </button>
  );
}
