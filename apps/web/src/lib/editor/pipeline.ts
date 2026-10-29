// Pipeline orchestration: stage raw uploads to IndexedDB, run the conversion
// worker, keep NIfTI outputs staged, and return the volume list.

import type { StagedFile } from "@/components/editor/upload-panel";
import { deleteSession, putFile } from "./stage-store";
import { runConversion, type ConvertProgress, type WorkerVolume } from "./convert";

export const MAX_TOTAL_BYTES = 2 * 1024 ** 3;

export type VolumeInfo = WorkerVolume & { sessionId: string };

export type PipelinePhase = "staging" | ConvertProgress["phase"];

export async function stageAndConvert(
  files: StagedFile[],
  onProgress?: (phase: PipelinePhase, done: number, total: number, message?: string) => void
): Promise<VolumeInfo[]> {
  const totalBytes = files.reduce((s, f) => s + f.file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error("Total acima de 2 GB. Remova arquivos antes de converter.");
  }
  if (files.length === 0) return [];

  const sessionId = crypto.randomUUID();

  // 1. Stage raw files to IndexedDB under a fresh session.
  onProgress?.("staging", 0, files.length);
  let i = 0;
  for (const f of files) {
    await putFile(sessionId, `${f.id}-${f.file.name}`, f.file, f.kind);
    onProgress?.("staging", ++i, files.length);
  }

  // 2. Convert in worker (it stages NIfTI outputs itself).
  try {
    const volumes = await runConversion(
      sessionId,
      files.map((f) => ({ name: `${f.id}-${f.file.name}`, kind: f.kind })),
      (p) => onProgress?.(p.phase, p.done, p.total, p.message)
    );
    return volumes.map((v) => ({ ...v, sessionId }));
  } catch (err) {
    await deleteSession(sessionId).catch(() => {});
    throw err;
  }
}
