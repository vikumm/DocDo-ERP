"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, FolderOpen, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { bytes } from "@/lib/format";

const BATCH_BYTES = 64 * 1024 * 1024;
const BATCH_FILES = 40;

/** Agrupa arquivos em lotes para não abrir uma requisição por fatia de DICOM. */
function batches(files: File[]) {
  const out: File[][] = [];
  let cur: File[] = [];
  let size = 0;
  for (const f of files) {
    if (cur.length && (size + f.size > BATCH_BYTES || cur.length >= BATCH_FILES)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(f);
    size += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

function send(endpoint: string, files: File[], onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f, f.name));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try {
        reject(new Error(JSON.parse(xhr.responseText).error));
      } catch {
        reject(new Error(`Falha no envio (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Conexão interrompida"));
    xhr.send(form);
  });
}

export function Uploader({
  endpoint,
  accept,
  allowFolder = false,
  title,
  hint,
  filter,
}: {
  endpoint: string;
  accept?: string;
  allowFolder?: boolean;
  title: string;
  hint: string;
  /** descarta arquivos irrelevantes de pastas (ex.: DICOMDIR, .DS_Store) */
  filter?: (f: File) => boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [state, setState] = useState<{ phase: "idle" | "uploading" | "done" | "error"; total: number; loaded: number; count: number; msg?: string }>({
    phase: "idle",
    total: 0,
    loaded: 0,
    count: 0,
  });

  async function upload(list: FileList | File[]) {
    let files = Array.from(list).filter((f) => f.size > 0 && !f.name.startsWith("."));
    if (filter) files = files.filter(filter);
    if (!files.length) return setState({ phase: "error", total: 0, loaded: 0, count: 0, msg: "Nenhum arquivo válido selecionado." });
    const total = files.reduce((s, f) => s + f.size, 0);
    setState({ phase: "uploading", total, loaded: 0, count: files.length });
    let done = 0;
    try {
      for (const b of batches(files)) {
        const size = b.reduce((s, f) => s + f.size, 0);
        await send(endpoint, b, (l) => setState((s) => ({ ...s, loaded: done + Math.min(l, size) })));
        done += size;
      }
      setState((s) => ({ ...s, phase: "done", loaded: total }));
      router.refresh();
    } catch (e) {
      setState((s) => ({ ...s, phase: "error", msg: (e as Error).message }));
      router.refresh();
    }
  }

  const pct = state.total ? Math.round((state.loaded / state.total) * 100) : 0;
  const busy = state.phase === "uploading";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!busy) upload(e.dataTransfer.files);
      }}
      className={clsx("rounded-2xl border-2 border-dashed p-6 text-center transition", drag ? "border-brand-500 bg-brand-500/5" : "border-white/10")}
    >
      <input ref={fileRef} type="file" multiple accept={accept} hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      {allowFolder && (
        <input
          ref={dirRef}
          type="file"
          multiple
          hidden
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      )}
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <CloudUpload className="size-5" />}
      </span>
      <p className="mt-3 font-semibold text-ink-50">{title}</p>
      <p className="mt-1 text-xs text-ink-400">{hint}</p>

      {busy ? (
        <div className="mx-auto mt-5 max-w-sm">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-300">
            Enviando {state.count} arquivo(s) · {bytes(state.loaded)} de {bytes(state.total)} · {pct}%
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary">
            Selecionar arquivos
          </button>
          {allowFolder && (
            <button type="button" onClick={() => dirRef.current?.click()} className="btn-ghost">
              <FolderOpen className="size-4" /> Selecionar pasta
            </button>
          )}
        </div>
      )}
      {state.phase === "done" && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-300">
          <CheckCircle2 className="size-4" /> {state.count} arquivo(s) enviados com sucesso.
        </p>
      )}
      {state.phase === "error" && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-red-300">
          <AlertCircle className="size-4" /> {state.msg}
        </p>
      )}
    </div>
  );
}

export function DicomUploader({ caseId }: { caseId: string }) {
  return (
    <Uploader
      endpoint={`/api/cases/${caseId}/dicom`}
      allowFolder
      title="Arraste os arquivos DICOM aqui"
      hint="Arquivos .dcm, a pasta do CD do exame ou um .zip · até 2 GB por arquivo"
      filter={(f) => !/^(DICOMDIR|thumbs\.db|desktop\.ini)$/i.test(f.name) && !/\.(exe|dll|inf|htm|html|txt|xml|ini|bat|pdf|jpg|png)$/i.test(f.name)}
    />
  );
}

export function ModelUploader({ caseId }: { caseId: string }) {
  return (
    <Uploader
      endpoint={`/api/cases/${caseId}/models`}
      accept=".stl,.obj,.ply,.glb"
      title="Arraste os modelos 3D reconstruídos"
      hint="Um arquivo por estrutura (STL, OBJ, PLY ou GLB). O nome do arquivo vira o nome da estrutura."
    />
  );
}
