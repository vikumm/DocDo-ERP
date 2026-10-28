// Main-thread client for the conversion worker.

import type { ConvertInputFile, ConvertProgress, WorkerVolume } from "./convert-types";

export type { ConvertInputFile, ConvertProgress, WorkerVolume };

export function runConversion(
  sessionId: string,
  files: ConvertInputFile[],
  onProgress?: (p: ConvertProgress) => void
): Promise<WorkerVolume[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./convert.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<import("./convert-types").ConvertResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress?.(msg);
      } else if (msg.type === "done") {
        cleanup();
        resolve(msg.volumes);
      } else {
        cleanup();
        reject(new Error(msg.error));
      }
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || "Falha inesperada na conversão."));
    };
    worker.postMessage({ type: "convert", sessionId, files });
  });
}
