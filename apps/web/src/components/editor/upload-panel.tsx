"use client";
import { useRef, useState } from "react";
import { CloudUpload, FolderOpen, FileArchive, FileImage, Layers, X, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { bytes } from "@/lib/format";

const TOTAL_CAP = 2 * 1024 ** 3;

export type StagedFileKind = "zip" | "nifti" | "dicom" | "folder";

export type StagedFile = {
  id: string;
  file: File;
  kind: StagedFileKind;
};

function kindOf(f: File): StagedFileKind {
  const name = f.name.toLowerCase();
  if (name.endsWith(".zip")) return "zip";
  if (name.endsWith(".nii") || name.endsWith(".nii.gz")) return "nifti";
  if ((f as File & { webkitRelativePath?: string }).webkitRelativePath) return "folder";
  return "dicom";
}

const KIND_LABEL: Record<StagedFileKind, string> = {
  zip: "ZIP",
  nifti: "NIfTI",
  dicom: "DICOM",
  folder: "Pasta",
};

function KindIcon({ kind }: { kind: StagedFileKind }) {
  const c = "size-3.5";
  if (kind === "zip") return <FileArchive className={c} />;
  if (kind === "nifti") return <Layers className={c} />;
  return <FileImage className={c} />;
}

export function UploadPanel({ onFilesStaged }: { onFilesStaged: (files: StagedFile[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [staged, setStaged] = useState<StagedFile[]>([]);

  const total = staged.reduce((s, f) => s + f.file.size, 0);
  const overCap = total > TOTAL_CAP;

  function stage(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.size > 0 && !f.name.startsWith("."));
    if (!files.length) return;
    const next = [...staged, ...files.map((file) => ({ id: crypto.randomUUID(), file, kind: kindOf(file) }))];
    setStaged(next);
    onFilesStaged(next);
    if (fileRef.current) fileRef.current.value = "";
    if (dirRef.current) dirRef.current.value = "";
  }

  function remove(id: string) {
    const next = staged.filter((f) => f.id !== id);
    setStaged(next);
    onFilesStaged(next);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          stage(e.dataTransfer.files);
        }}
        className={clsx("rounded-2xl border-2 border-dashed p-6 text-center transition", drag ? "border-brand-500 bg-brand-500/5" : "border-white/10")}
      >
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && stage(e.target.files)} />
        <input
          ref={dirRef}
          type="file"
          multiple
          hidden
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => e.target.files && stage(e.target.files)}
        />
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20">
          <CloudUpload className="size-5" />
        </span>
        <p className="mt-3 font-semibold text-ink-50">Arraste os arquivos do exame aqui</p>
        <p className="mt-1 text-xs text-ink-400">DICOM (.dcm ou pasta do CD), .zip, .nii ou .nii.gz · até 2 GB no total</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary">
            Abrir arquivos
          </button>
          <button type="button" onClick={() => dirRef.current?.click()} className="btn-ghost">
            <FolderOpen className="size-4" /> Enviar pasta
          </button>
        </div>
      </div>

      {staged.length > 0 && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-50">
              {staged.length} arquivo(s) · {bytes(total)}
            </p>
            {staged.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setStaged([]);
                  onFilesStaged([]);
                }}
                className="text-xs font-semibold text-ink-400 hover:text-ink-50"
              >
                Limpar tudo
              </button>
            )}
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {staged.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2">
                <KindIcon kind={f.kind} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{f.file.name}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold tracking-wide text-ink-300 uppercase">{KIND_LABEL[f.kind]}</span>
                <span className="text-xs text-ink-400">{bytes(f.file.size)}</span>
                <button type="button" onClick={() => remove(f.id)} className="rounded-lg p-1 text-ink-400 hover:bg-white/5 hover:text-red-300" aria-label={`Remover ${f.file.name}`}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {overCap && (
        <p className="inline-flex items-center gap-1.5 text-sm text-amber-300">
          <AlertTriangle className="size-4" /> Total acima de 2 GB ({bytes(total)}). Remova arquivos antes de continuar.
        </p>
      )}
    </div>
  );
}
