/// <reference lib="webworker" />
// DICOM → NIfTI conversion worker.
// Reads staged blobs from IndexedDB, extracts zips with fflate, groups DICOM
// files into series via readDicomTags, converts each series with
// readImageDicomFileSeries + niftiWriteImage (itk-wasm), and stages the NIfTI
// blobs back into IndexedDB.

import { unzip } from "fflate";
import { readDicomTags, readImageDicomFileSeries } from "@itk-wasm/dicom";
import { niftiWriteImage } from "@itk-wasm/image-io";
import type { BinaryFile, Image } from "itk-wasm";
import { getFile, putFile } from "./stage-store";
import type { ConvertRequest, ConvertResponse, WorkerVolume } from "./convert-types";

const post = (msg: ConvertResponse) => self.postMessage(msg);

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) =>
    unzip(data, (err, files) => (err ? reject(err) : resolve(files)))
  );
}

function looksLikeDicom(name: string, data?: Uint8Array): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".dcm") || lower.endsWith(".dicom")) return true;
  // No extension: check DICM magic at offset 128.
  if (data && data.length > 132 && data[128] === 0x44 && data[129] === 0x49 && data[130] === 0x43 && data[131] === 0x4d) return true;
  return !lower.includes(".");
}

const TAG_SERIES_UID = "0020|000e";
const TAG_SERIES_DESC = "0008|103e";
const TAG_MODALITY = "0008|0060";
const TAG_STUDY_DESC = "0008|1030";

async function convert(req: ConvertRequest) {
  const { sessionId, files } = req;
  const total = files.length;
  let done = 0;

  // 1. Load staged blobs; extract zips inline.
  const dicomFiles: BinaryFile[] = [];
  const niftiInputs: { name: string; data: Uint8Array }[] = [];

  for (const f of files) {
    const rec = await getFile(sessionId, f.name);
    if (!rec) continue;
    const data = new Uint8Array(await rec.blob.arrayBuffer());
    if (f.kind === "nifti") {
      niftiInputs.push({ name: f.name, data });
    } else if (f.kind === "zip") {
      const extracted = await unzipAsync(data);
      for (const [path, content] of Object.entries(extracted)) {
        if (path.startsWith("__MACOSX") || path.endsWith("/")) continue;
        if (looksLikeDicom(path.split("/").pop() ?? path, content)) {
          dicomFiles.push({ path, data: content });
        } else if (/\.nii(\.gz)?$/i.test(path)) {
          niftiInputs.push({ name: path.split("/").pop() ?? path, data: content });
        }
      }
    } else if (looksLikeDicom(f.name, data)) {
      dicomFiles.push({ path: f.name, data });
    }
    post({ type: "progress", phase: "extract", done: ++done, total });
  }

  const volumes: WorkerVolume[] = [];

  // 2. NIfTI passthrough: stage straight back with metadata unavailable.
  for (const n of niftiInputs) {
    const niiName = `nii-${crypto.randomUUID()}.nii.gz`;
    await putFile(sessionId, niiName, new Blob([n.data as BlobPart]), "nifti");
    volumes.push({ seriesId: niiName, description: n.name, modality: null, size: n.data.byteLength, sliceCount: null, niiName });
  }

  if (dicomFiles.length === 0) {
    if (volumes.length === 0) throw new Error("Nenhum arquivo DICOM ou NIfTI encontrado nos arquivos enviados.");
    post({ type: "done", volumes });
    return;
  }

  // 3. Group DICOMs into series via SeriesInstanceUID tag (first block per file).
  const groups = new Map<string, BinaryFile[]>();
  const seriesMeta = new Map<string, { description: string; modality: string | null }>();
  const metaTasks: Promise<void>[] = [];
  for (const df of dicomFiles) {
    metaTasks.push(
      readDicomTags(df as never, { webWorker: false, tagsToRead: { tags: [TAG_SERIES_UID, TAG_SERIES_DESC, TAG_MODALITY, TAG_STUDY_DESC] } })
        .then((r) => {
          const get = (tag: string) => r.tags.find(([t]) => t === tag)?.[1] ?? null;
          const uid = get(TAG_SERIES_UID) ?? "unknown";
          const list = groups.get(uid) ?? [];
          list.push(df);
          groups.set(uid, list);
          if (!seriesMeta.has(uid)) {
            seriesMeta.set(uid, {
              description: get(TAG_SERIES_DESC) || get(TAG_STUDY_DESC) || `Série ${groups.size}`,
              modality: get(TAG_MODALITY),
            });
          }
        })
        .catch(() => {
          const uid = "unknown";
          const list = groups.get(uid) ?? [];
          list.push(df);
          groups.set(uid, list);
          if (!seriesMeta.has(uid)) seriesMeta.set(uid, { description: "Série sem identificação", modality: null });
        })
    );
    // Serialize in blocks of 24 to bound memory of concurrent tag reads.
    if (metaTasks.length % 24 === 0) await Promise.all(metaTasks.splice(0));
  }
  await Promise.all(metaTasks);

  // 4. Convert each series to a NIfTI volume.
  const seriesIds = [...groups.keys()];
  let seriesDone = 0;
  for (const uid of seriesIds) {
    const seriesFiles = groups.get(uid)!;
    const { outputImage } = await readImageDicomFileSeries({ inputImages: seriesFiles, singleSortedSeries: false, webWorkerPool: null as never });
    const meta = seriesMeta.get(uid) ?? { description: uid, modality: null };
    const written = await niftiWriteImage(outputImage as Image, `series.nii`, { useCompression: true, webWorker: false });
    if (!written.couldWrite) throw new Error(`Falha ao converter série ${meta.description}.`);
    const data = written.serializedImage.data;
    const niiName = `nii-${uid}.nii.gz`;
    await putFile(sessionId, niiName, new Blob([data as BlobPart]), "nifti");
    volumes.push({
      seriesId: uid,
      description: meta.description,
      modality: meta.modality,
      size: data.byteLength,
      sliceCount: (outputImage as Image).size[2] ?? null,
      niiName,
    });
    post({ type: "progress", phase: "read", done: ++seriesDone, total: seriesIds.length, message: meta.description });
  }

  post({ type: "done", volumes });
}

self.addEventListener("message", (e: MessageEvent<ConvertRequest>) => {
  if (e.data?.type !== "convert") return;
  convert(e.data).catch((err: unknown) => {
    post({ type: "error", error: err instanceof Error ? err.message : String(err) });
  });
});
