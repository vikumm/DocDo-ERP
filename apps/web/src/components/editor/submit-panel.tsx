"use client";
import { useState } from "react";
import { Check, Loader2, Save, Send } from "lucide-react";

export type SubmitCaseOption = { id: string; title: string; code: number };

type FeedbackStatus = "idle" | "sending" | "done" | "error";
type SaveStatus = "idle" | "sending" | "done" | "error";

async function errText(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  return body.error ?? body.detail ?? `Erro ${res.status}.`;
}

export function SubmitPanel({
  sessionId,
  getLabelmap,
  promptLog,
  disabled,
  getOriginalVolume,
  cases,
}: {
  sessionId: string | null;
  getLabelmap: () => Promise<Blob>;
  promptLog: unknown[];
  disabled?: boolean;
  getOriginalVolume?: () => Promise<Blob | null>;
  cases: SubmitCaseOption[];
}) {
  const [fbStatus, setFbStatus] = useState<FeedbackStatus>("idle");
  const [fbError, setFbError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string>("");

  async function enviar() {
    if (!sessionId) return;
    setFbStatus("sending");
    setFbError(null);
    try {
      const form = new FormData();
      form.append("labelmap", await getLabelmap(), "edited_labelmap.nii.gz");
      form.append(
        "prompt_log",
        new Blob([JSON.stringify({ events: promptLog, submittedAt: new Date().toISOString() })], {
          type: "application/json",
        }),
        "prompt_log.json"
      );
      if (getOriginalVolume) {
        const vol = await getOriginalVolume();
        if (vol) form.append("original", vol, "original.nii.gz");
      }
      const res = await fetch(`/api/segmentation/sessions/${encodeURIComponent(sessionId)}/feedback`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await errText(res));
      setFbStatus("done");
    } catch (e) {
      setFbError(e instanceof Error ? e.message : "Falha ao enviar ajustes.");
      setFbStatus("error");
    }
  }

  async function salvar() {
    if (!sessionId || !caseId) return;
    setSaveStatus("sending");
    setSaveError(null);
    try {
      const res = await fetch(`/api/segmentation/sessions/${encodeURIComponent(sessionId)}/save-to-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      if (!res.ok) throw new Error(await errText(res));
      setSaveStatus("done");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Falha ao salvar no caso.");
      setSaveStatus("error");
    }
  }

  const busy = disabled || !sessionId;

  return (
    <div className="card space-y-5 p-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-50">Enviar ajustes</p>
        <p className="text-sm text-ink-300">
          Envia o labelmap editado e o histórico de prompts para treinar e melhorar o modelo.
        </p>
        <button
          type="button"
          disabled={busy || fbStatus === "sending"}
          onClick={() => void enviar()}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-40"
        >
          {fbStatus === "sending" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : fbStatus === "done" ? (
            <Check className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {fbStatus === "sending" ? "Enviando…" : fbStatus === "done" ? "Ajustes enviados" : "Enviar ajustes"}
        </button>
        {fbStatus === "error" && fbError && <p className="text-sm text-red-300">{fbError}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-50">Salvar no caso</p>
        {cases.length === 0 ? (
          <p className="text-sm text-ink-300">Nenhum caso disponível para salvar.</p>
        ) : (
          <>
            <select
              value={caseId}
              onChange={(e) => {
                setCaseId(e.target.value);
                setSaveStatus("idle");
              }}
              disabled={busy || saveStatus === "sending"}
              className="input w-full max-w-sm"
            >
              <option value="">Selecione um caso…</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.code} — {c.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || saveStatus === "sending" || !caseId}
              onClick={() => void salvar()}
              className="btn-ghost inline-flex items-center gap-2 disabled:opacity-40"
            >
              {saveStatus === "sending" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saveStatus === "done" ? (
                <Check className="size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {saveStatus === "sending" ? "Salvando…" : saveStatus === "done" ? "Salvo no caso" : "Salvar no caso"}
            </button>
            {saveStatus === "error" && saveError && <p className="text-sm text-red-300">{saveError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
