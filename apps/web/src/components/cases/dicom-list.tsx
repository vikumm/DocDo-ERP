import { Download, FileImage } from "lucide-react";
import type { DicomFileDTO } from "@docdo/contracts";
import { bytes, dateTime } from "@/lib/format";
import { DeleteDicomButton } from "./delete-dicom";

export function DicomList({ caseId, files, canDelete, canDownload = true }: { caseId: string; files: DicomFileDTO[]; canDelete: boolean; canDownload?: boolean }) {
  if (!files.length) return <p className="text-sm text-ink-400">Nenhum arquivo enviado ainda.</p>;
  const total = files.reduce((s, f) => s + Number(f.size), 0);
  const shown = files.slice(0, 50);
  return (
    <div>
      <p className="mb-3 text-xs text-ink-400">
        {files.length} arquivo(s) · {bytes(total)}
      </p>
      <ul className="max-h-72 divide-y divide-white/[0.04] overflow-y-auto rounded-xl border border-white/[0.06]">
        {shown.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <FileImage className="size-4 shrink-0 text-ink-400" />
            <span className="min-w-0 flex-1 truncate text-ink-100">{f.originalName}</span>
            <span className="hidden text-xs text-ink-400 sm:block">{bytes(f.size)}</span>
            <span className="hidden text-xs text-ink-500 md:block">{dateTime(f.createdAt)}</span>
            {/* download é acesso clínico: a secretária não baixa exames */}
            {canDownload && (
              <a href={`/api/files/dicom/${f.id}`} className="rounded-lg p-1.5 text-ink-400 hover:bg-white/5 hover:text-ink-50" aria-label="Baixar">
                <Download className="size-3.5" />
              </a>
            )}
            {canDelete && <DeleteDicomButton caseId={caseId} fileId={f.id} />}
          </li>
        ))}
      </ul>
      {files.length > shown.length && <p className="mt-2 text-xs text-ink-500">+ {files.length - shown.length} arquivos</p>}
    </div>
  );
}
