// Client for the segmentation service — via the web BFF (/api/segmentation), which forwards
// to the Nest API with the session cookie; the Nest API proxies to the seg service on the
// internal network. The browser never talks to the seg service directly.

export type SegModel = "vista3d" | "nv_segment_ct";
export type SegJobStatus = "queued" | "running" | "done" | "error";
export type SegPhase = "uploading" | "queued" | "running" | "done" | "error";

type JobOut = {
  id: string;
  session_id: string;
  kind: string;
  model: string;
  status: string;
  params: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const BASE = "/api/segmentation";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Serviço de segmentação respondeu ${res.status}.`);
  }
  return res.json() as Promise<T>;
}

export async function createSession(caseId?: string): Promise<string> {
  const out = await json<{ id: string }>(
    await fetch(`${BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(caseId ? { body: JSON.stringify({ caseId }) } : {}),
    })
  );
  return out.id;
}

export async function uploadVolume(sessionId: string, niiBlob: Blob): Promise<void> {
  const form = new FormData();
  form.append("file", niiBlob, "volume.nii.gz");
  await json(await fetch(`${BASE}/sessions/${sessionId}/volume`, { method: "POST", body: form }));
}

export type PromptPoint = { x: number; y: number; z: number; pos: boolean };

export async function enqueueInteractiveJob(
  sessionId: string,
  points: PromptPoint[],
  label: number
): Promise<string> {
  // NOTE: coordinates are sent as Cornerstone world coords (LPS). The MONAI
  // runner converts world -> voxel (divides by spacing); an RAS/LPS convention
  // mismatch may require a flip on the service side. KNOWN RISK — see notepad.
  const out = await json<JobOut>(
    await fetch(`${BASE}/sessions/${sessionId}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "interactive",
        model: "vista3d",
        params: {
          points: points.map((p) => ({ x: p.x, y: p.y, z: p.z, pos: p.pos })),
          label,
        },
      }),
    })
  );
  return out.id;
}

export async function runInteractive(
  sessionId: string,
  points: PromptPoint[],
  label: number,
  pollMs = 2000
): Promise<Blob> {
  const jobId = await enqueueInteractiveJob(sessionId, points, label);  for (;;) {
    await new Promise((r) => setTimeout(r, pollMs));
    const job = await getJob(sessionId, jobId);
    if (job.status === "queued" || job.status === "running") continue;
    if (job.status === "done") return getLabelmap(sessionId);
    throw new Error(`Re-segmentação falhou (status: ${job.status}).`);
  }
}

export async function enqueueJob(sessionId: string, model: SegModel): Promise<string> {
  const out = await json<JobOut>(
    await fetch(`${BASE}/sessions/${sessionId}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "auto", model }),
    })
  );
  return out.id;
}

export async function getJob(sessionId: string, jobId: string): Promise<JobOut> {
  const jobs = await json<JobOut[]>(await fetch(`${BASE}/sessions/${sessionId}/jobs`));
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new Error("Trabalho de segmentação não encontrado.");
  return job;
}

export async function getLabelmap(sessionId: string): Promise<Blob> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/labelmap`);
  if (!res.ok) throw new Error(`Falha ao baixar o labelmap (${res.status}).`);
  return res.blob();
}

export type SegmentationResult = { labelmapBlob: Blob; sessionId: string };

/** Run the full segmentation flow, reporting pt-BR phase transitions. */
export async function runSegmentation(
  niiBlob: Blob,
  model: SegModel,
  onPhase: (phase: SegPhase, detail?: string) => void,
  pollMs = 2000
): Promise<SegmentationResult> {
  onPhase("uploading", "Enviando volume");
  const sessionId = await createSession();
  await uploadVolume(sessionId, niiBlob);
  const jobId = await enqueueJob(sessionId, model);
  onPhase("queued", "Na fila");
  for (;;) {
    await new Promise((r) => setTimeout(r, pollMs));
    const job = await getJob(sessionId, jobId);
    if (job.status === "queued") continue;
    if (job.status === "running") {
      onPhase("running", "Processando");
      continue;
    }
    if (job.status === "done") {
      onPhase("done", "Concluído");
      return { labelmapBlob: await getLabelmap(sessionId), sessionId };
    }
    throw new Error(`Segmentação falhou (status: ${job.status}).`);
  }
}
