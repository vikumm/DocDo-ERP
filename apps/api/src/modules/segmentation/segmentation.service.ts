import { Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import type { Response as ExpressResponse } from "express";
type FetchResponse = Awaited<ReturnType<typeof fetch>>;
import type { AuthInfo } from "../../common/auth";
import { db } from "../../common/db";
import { fail } from "../../common/http";
import { canOperate, findCase, hasClinicalAccess } from "../../common/access";
import { saveStream } from "../../lib/storage";
import type { SegSession } from "@prisma/client";

const SEG_URL = (process.env.SEG_SERVICE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const SEG_KEY = process.env.SEG_SERVICE_KEY ?? "";

/** Extrai `detail` de um corpo de erro JSON; corpos não-JSON caem no texto cru. */
function safeDetail(text: string): string | undefined {
  try {
    return JSON.parse(text)?.detail;
  } catch {
    return undefined;
  }
}

/**
 * Chamada ao serviço de segmentação (rede interna). Autenticação por chave compartilhada
 * quando definida — o serviço ainda não exige (ver notepad). Corpos em fluxo, sem buffering.
 */
async function segFetch(path: string, init: RequestInit & { duplex?: "half" } = {}): Promise<FetchResponse> {
  const headers = new Headers(init.headers);
  if (SEG_KEY) headers.set("x-bff-key", SEG_KEY);
  let res: FetchResponse;
  try {
    res = await fetch(`${SEG_URL}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    return fail("Serviço de segmentação indisponível.", 502);
  }
  if (!res.ok && res.body) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    const detail = text ? (safeDetail(text) ?? text) : "";
    fail(detail || `Serviço de segmentação respondeu ${res.status}.`, res.status === 422 ? 400 : 502);
  }
  return res;
}

/** Node stream a partir do corpo de uma resposta do fetch. */
const nodeBody = (res: FetchResponse) => Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);

@Injectable()
export class SegmentationService {
  /** A sessão é visível pelo RLS; aqui aplicamos a regra da aplicação (clínica ou acesso clínico ao caso). */
  async requireSession(a: AuthInfo, id: string): Promise<SegSession> {
    const sess = await db.segSession.findUnique({ where: { id } });
    if (!sess) fail("Sessão não encontrada.", 404);
    const orgIds = a.memberships.map((m) => m.organizationId);
    let ok = sess!.userId === a.user.id || (!!sess!.organizationId && orgIds.includes(sess!.organizationId));
    if (!ok && sess!.caseId) {
      const c = await findCase(a, sess!.caseId);
      ok = !!c && (await hasClinicalAccess(a, c));
    }
    if (!ok) fail("Sessão não encontrada.", 404);
    return sess!;
  }

  async createSession(a: AuthInfo, caseId?: string) {
    let organizationId: string | null = null;
    if (caseId) {
      const c = await findCase(a, caseId);
      if (!c || !(await canOperate(a, c))) fail("Caso não encontrado.", 404);
      organizationId = c!.organizationId;
    } else {
      organizationId = a.currentOrg?.organizationId ?? null;
    }
    const res = await segFetch("/v1/sessions", { method: "POST" });
    const out = (await res.json()) as { id: string };
    await db.segSession.create({ data: { id: out.id, userId: a.user.id, organizationId, caseId: caseId ?? null } });
    return out;
  }

  /** Repassa o corpo em fluxo (multipart do navegador vai direto ao serviço). */
  uploadVolume(id: string, req: { headers: Record<string, string | string[] | undefined>; body: Readable }) {
    const ct = String(req.headers["content-type"] ?? "");
    if (!ct.startsWith("multipart/form-data")) fail("Envio inválido.");
    return segFetch(`/v1/sessions/${id}/volume`, {
      method: "POST",
      headers: { "content-type": ct },
      body: req.body,
      duplex: "half",
    }).then((r) => r.json());
  }

  async listJobs(a: AuthInfo, id: string) {
    await this.requireSession(a, id);
    const res = await segFetch(`/v1/jobs?session_id=${encodeURIComponent(id)}`);
    return res.json();
  }

  async createJob(a: AuthInfo, id: string, body: unknown) {
    await this.requireSession(a, id);
    // o session_id vem da rota, nunca do corpo
    const payload = typeof body === "object" && body ? { ...(body as object), session_id: id } : { session_id: id };
    const res = await segFetch("/v1/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return res.json();
  }

  feedback(id: string, req: { headers: Record<string, string | string[] | undefined>; body: Readable }) {
    const ct = String(req.headers["content-type"] ?? "");
    if (!ct.startsWith("multipart/form-data")) fail("Envio inválido.");
    return segFetch(`/v1/sessions/${id}/feedback`, {
      method: "POST",
      headers: { "content-type": ct },
      body: req.body,
      duplex: "half",
    }).then((r) => r.json());
  }

  /** Download em fluxo (volume ou labelmap). */
  async download(a: AuthInfo, id: string, kind: "volume" | "labelmap", res: ExpressResponse) {
    const s = await this.requireSession(a, id);
    if (s.userId !== a.user.id && !a.adminReady) {
      const orgIds = a.memberships.map((m) => m.organizationId);
      const mine = (!!s.organizationId && orgIds.includes(s.organizationId)) || (s.caseId ? !!(await findCase(a, s.caseId)) : false);
      if (!mine) fail("Sessão não encontrada.", 404);
    }
    const out = await segFetch(`/v1/sessions/${id}/${kind}`);
    res.setHeader("Content-Type", out.headers.get("content-type") ?? "application/octet-stream");
    const len = out.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);
    res.setHeader("Cache-Control", "private, no-store");
    nodeBody(out).on("error", () => res.destroy()).pipe(res);
  }

  /** Baixa volume+labelmap do serviço e grava cifrados no caso. */
  async saveToCase(a: AuthInfo, id: string, caseId: unknown) {
    await this.requireSession(a, id);
    const cid = String(caseId ?? "");
    const c = await findCase(a, cid);
    if (!c || !(await canOperate(a, c))) fail("Caso não encontrado.", 404);

    const saved: { kind: "volume" | "labelmap"; key: string; size: number }[] = [];
    try {
      for (const kind of ["volume", "labelmap"] as const) {
        const out = await segFetch(`/v1/sessions/${id}/${kind}`);
        const r = await saveStream(`cases/${cid}/seg`, `${kind}.nii.gz`, nodeBody(out));
        saved.push({ kind, key: r.key, size: r.size });
      }
    } catch (e) {
      const { deleteFile } = await import("../../lib/storage");
      await Promise.all(saved.map((f) => deleteFile(f.key)));
      throw e;
    }
    const artifacts = [];
    for (const f of saved) {
      artifacts.push(
        await db.segArtifact.create({
          data: { caseId: cid, sessionId: id, kind: f.kind, storageKey: f.key, bytes: f.size },
          select: { id: true, kind: true, bytes: true },
        }),
      );
      }
    await db.caseEvent.create({ data: { caseId: cid, userId: a.user.id, message: "Segmentação salva no caso" } });
    return { artifacts };
  }
}
