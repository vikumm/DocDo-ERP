// Worker protocol shared between convert.ts (main) and convert.worker.ts.
// Structured-cloneable messages only.

export type ConvertInputFile = {
  name: string; // staged name in IDB (flat, unique)
  kind: "dicom" | "zip" | "nifti" | "folder";
};

export type ConvertRequest = {
  type: "convert";
  sessionId: string;
  files: ConvertInputFile[];
};

export type WorkerVolume = {
  seriesId: string;
  description: string;
  modality: string | null;
  size: number;
  sliceCount: number | null;
  /** staged name of the NIfTI blob written back to IDB by the worker */
  niiName: string;
};

export type ConvertProgress = {
  type: "progress";
  phase: "extract" | "read" | "write";
  done: number;
  total: number;
  message?: string;
};

export type ConvertSuccess = {
  type: "done";
  volumes: WorkerVolume[];
};

export type ConvertFailure = {
  type: "error";
  error: string;
};

export type ConvertResponse = ConvertProgress | ConvertSuccess | ConvertFailure;
