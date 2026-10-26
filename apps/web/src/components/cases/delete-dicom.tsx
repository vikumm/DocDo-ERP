"use client";
import { Trash2 } from "lucide-react";
import { deleteDicom } from "@/lib/actions/cases";

export function DeleteDicomButton({ caseId, fileId }: { caseId: string; fileId: string }) {
  return (
    <button
      onClick={() => confirm("Remover este arquivo?") && deleteDicom(caseId, fileId)}
      className="rounded-lg p-1.5 text-ink-400 hover:bg-red-500/10 hover:text-red-300"
      aria-label="Remover arquivo"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
