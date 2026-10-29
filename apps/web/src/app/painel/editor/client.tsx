"use client";
import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Scissors } from "lucide-react";
import { UploadPanel, type StagedFile } from "@/components/editor/upload-panel";
import { VolumeList } from "@/components/editor/volume-list";
import { SegmentationViewer } from "@/components/editor/viewer/segmentation-viewer";
import { SubmitPanel, type SubmitCaseOption } from "@/components/editor/submit-panel";
import { stageAndConvert, type PipelinePhase, type VolumeInfo } from "@/lib/editor/pipeline";
import { getFile } from "@/lib/editor/stage-store";
import { runSegmentation, type SegModel, type SegPhase } from "@/lib/editor/seg-client";

const SEG_MODEL: SegModel = "vista3d";

const SEG_PHASE_LABEL: Record<SegPhase, string> = {
  uploading: "Enviando volume",
  queued: "Na fila",
  running: "Processando segmentação",
  done: "Concluído",
  error: "Falhou",
};

export function EditorClient({ cases }: { cases: SubmitCaseOption[] }) {
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<PipelinePhase>("staging");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [segPhase, setSegPhase] = useState<SegPhase | null>(null);
  const [segError, setSegError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{
    volumeBlob: Blob;
    labelmapBlob: Blob | null;
    name: string;
    sessionId: string | null;
  } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [promptLog, setPromptLog] = useState<unknown[]>([]);
  const labelmapGetterRef = useRef<(() => Promise<Blob>) | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const setLabelmapGetter = useCallback((getter: () => Promise<Blob>) => {
    labelmapGetterRef.current = getter;
    setCanEdit(true);
  }, []);
  const getLabelmap = useCallback(async () => {
    const getter = labelmapGetterRef.current;
    if (getter) return getter();
    throw new Error("Edição de labelmap indisponível.");
  }, []);

  const segmentar = useCallback(
    async (volume: VolumeInfo) => {
      setSegPhase("uploading");
      setSegError(null);
      setSessionId(null);
      setPromptLog([]);
      try {
        const rec = await getFile(volume.sessionId, volume.niiName);
        if (!rec) throw new Error("Volume convertido não encontrado no armazenamento local.");
        const { labelmapBlob, sessionId: sid } = await runSegmentation(
          rec.blob,
          SEG_MODEL,
          (p) => setSegPhase(p)
        );
        setSessionId(sid);
        setViewer({ volumeBlob: rec.blob, labelmapBlob, name: volume.description, sessionId: sid });
      } catch (e) {
        setSegError(e instanceof Error ? e.message : "Falha na segmentação.");
      } finally {
        setSegPhase(null);
      }
    },
    []
  );

  async function convert(files: StagedFile[]) {
    setBusy(true);
    setError(null);
    setVolumes([]);
    setSelected(null);
    setDone(0);
    setTotal(files.length);
    try {
      const result = await stageAndConvert(files, (p, d, t, msg) => {
        setPhase(p);
        setDone(d);
        setTotal(t);
        setMessage(msg);
      });
      setVolumes(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na conversão.");
    } finally {
      setBusy(false);
    }
  }

  const selectedVolume = volumes.find((v) => v.seriesId === selected) ?? null;

  if (viewer) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewer(null)}
            className="btn-ghost inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" /> Voltar aos volumes
          </button>
          <p className="text-sm text-ink-300">{viewer.name}</p>
        </div>
        <SegmentationViewer
          volumeBlob={viewer.volumeBlob}
          labelmapBlob={viewer.labelmapBlob}
          volumeName={viewer.name}
          sessionId={viewer.sessionId}
          onRegisterLabelmapGetter={setLabelmapGetter}
        />
        {sessionId && (
          <SubmitPanel
            sessionId={sessionId}
            getLabelmap={getLabelmap}
            promptLog={promptLog}
            disabled={!canEdit}
            cases={cases}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UploadPanel
        onFilesStaged={(files) => {
          setStaged(files);
          if (files.length === 0) setVolumes([]);
        }}
      />
      {staged.length > 0 && (
        <button type="button" disabled={busy} onClick={() => convert(staged)} className="btn-primary disabled:opacity-40">
          Converter para volume 3D
        </button>
      )}
      <VolumeList
        volumes={volumes}
        selected={selected}
        onSelect={setSelected}
        busy={busy}
        phase={phase}
        done={done}
        total={total}
        message={message}
        error={error}
      />
      {selectedVolume && (
        <div className="card space-y-3 p-4">
          <p className="text-sm font-semibold text-ink-50">{selectedVolume.description}</p>
          <button
            type="button"
            disabled={segPhase !== null}
            onClick={() => void segmentar(selectedVolume)}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-40"
          >
            <Scissors className="size-4" />
            {segPhase ? `${SEG_PHASE_LABEL[segPhase]}…` : "Segmentar"}
          </button>
          {segError && <p className="text-sm text-red-300">{segError}</p>}
        </div>
      )}
      {staged.length === 0 && volumes.length === 0 && (
        <p className="card p-6 text-sm text-ink-300">Nenhum arquivo enviado ainda. Arraste os arquivos acima para começar.</p>
      )}
    </div>
  );
}
