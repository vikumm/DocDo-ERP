// Cornerstone3D side-by-side MPR viewer: left = raw volume, right = volume with
// labelmap overlay (or "Sem segmentação" overlay when no labelmap is provided).
// NIfTI loading via @cornerstonejs/nifti-volume-loader imageIds + streaming volume.
// Editing: brush/eraser/rectangle-scissors on the right viewport only, plus
// point-prompt re-segmentation via the segmentation service (vista3d).

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, CircleDot, Eraser, Loader2, Minus, MousePointer2, Square, X } from "lucide-react";
import { runInteractive, type PromptPoint } from "@/lib/editor/seg-client";

export type SegmentInfo = { index: number; color: string; label: string };

type ToolMode = "navegar" | "pincel" | "borracha" | "cortar" | "ponto";

const MODE_LABEL: Record<ToolMode, string> = {
  navegar: "Navegar",
  pincel: "Pincel",
  borracha: "Borracha",
  cortar: "Cortar",
  ponto: "Ponto",
};

let initPromise: Promise<void> | null = null;
let mountCounter = 0;

// Dynamic import keeps cornerstone (WebGL) out of SSR and the initial bundle.
async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const core = await import("@cornerstonejs/core");
      const tools = await import("@cornerstonejs/tools");
      const nifti = await import("@cornerstonejs/nifti-volume-loader");
      await core.init();
      await tools.init();
      core.imageLoader.registerImageLoader("nifti", nifti.cornerstoneNiftiImageLoader);
      await nifti.init();
      tools.addTool(tools.StackScrollTool);
      tools.addTool(tools.ZoomTool);
      tools.addTool(tools.PanTool);
      tools.addTool(tools.WindowLevelTool);
      tools.addTool(tools.CrosshairsTool);
      tools.addTool(tools.BrushTool);
      tools.addTool(tools.RectangleScissorsTool);
    })();
    // A rejected init must not poison later mounts: reset so the next mount retries.
    initPromise.catch(() => {
      initPromise = null;
    });
  }
  await initPromise;
}

const rgbaToHex = (rgba: number[] | undefined) =>
  rgba && rgba.length >= 3
    ? `#${rgba.slice(0, 3).map((c) => c.toString(16).padStart(2, "0")).join("")}`
    : "#888888";

async function gzipDecompress(data: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

// Rebuild a NIfTI-1 blob from the ORIGINAL labelmap header (geometry preserved
// verbatim) + the edited voxel data from the cornerstone labelmap volume.
// The cornerstone nifti loader maps NIfTI slices 1:1 into volume voxel order,
// so the flat index order matches the file's voxel order.
async function buildEditedNifti(
  originalBlob: Blob,
  scalarData: ArrayLike<number>
): Promise<Blob> {
  const buf = await originalBlob.arrayBuffer();
  const headerBuf = (new Uint8Array(buf)[0] === 0x1f && new Uint8Array(buf)[1] === 0x8b)
    ? await gzipDecompress(buf)
    : buf;
  const dv = new DataView(headerBuf);
  const dim = [dv.getUint16(42, true), dv.getUint16(44, true), dv.getUint16(46, true)];
  const voxelCount = dim[0] * dim[1] * dim[2];
  if (voxelCount === 0) throw new Error("Cabeçalho NIfTI do labelmap inválido.");
  if (scalarData.length !== voxelCount)
    throw new Error(
      `Tamanho do labelmap editado (${scalarData.length}) difere do original (${voxelCount}).`
    );
  const voxOffset = Math.trunc(dv.getFloat32(108, true)) || 352;
  const out = new Uint8Array(voxOffset + voxelCount);
  out.set(new Uint8Array(headerBuf, 0, voxOffset));
  const voxels = out.subarray(voxOffset);
  for (let i = 0; i < voxelCount; i++) {
    const v = scalarData[i];
    voxels[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return new Blob([out], { type: "application/octet-stream" });
}

export function SegmentationViewer({
  volumeBlob,
  labelmapBlob,
  volumeName,
  sessionId,
  onRegisterLabelmapGetter,
}: {
  volumeBlob: Blob;
  labelmapBlob?: Blob | null;
  volumeName?: string;
  sessionId?: string | null;
  onRegisterLabelmapGetter?: (getter: () => Promise<Blob>) => void;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [opacity, setOpacityState] = useState(0.6);
  const [mode, setMode] = useState<ToolMode>("navegar");
  const [brushSize, setBrushSizeState] = useState(25);
  const brushSizeRef = useRef(25);
  const [activeSegment, setActiveSegmentState] = useState<number | null>(null);
  const [targetSegment, setTargetSegment] = useState<number | null>(null);
  const [points, setPoints] = useState<PromptPoint[]>([]);
  const [negativeMode, setNegativeMode] = useState(false);
  const [resegStatus, setResegStatus] = useState<"idle" | "running" | "choice">("idle");
  const [resegError, setResegError] = useState<string | null>(null);
  const [pendingLabelmap, setPendingLabelmap] = useState<Blob | null>(null);
  const [activeLabelmap, setActiveLabelmap] = useState<Blob | null>(labelmapBlob ?? null);
  const toolsRef = useRef<typeof import("@cornerstonejs/tools") | null>(null);
  const coreRef = useRef<typeof import("@cornerstonejs/core") | null>(null);
  const idsRef = useRef<{
    suffix: number;
    volumeId: string;
    segId: string;
    labelmapVolumeId: string;
    viewportRight: string;
  } | null>(null);
  const labelmapBlobRef = useRef<Blob | null>(labelmapBlob ?? null);

  useEffect(() => {
    labelmapBlobRef.current = labelmapBlob ?? null;
  }, [labelmapBlob]);

  const setOpacity = useCallback((value: number) => {
    setOpacityState(value);
    const tools = toolsRef.current;
    const ids = idsRef.current;
    if (!tools || !ids) return;
    tools.segmentation.config.style.setStyle(
      { viewportId: ids.viewportRight, type: tools.Enums.SegmentationRepresentations.Labelmap },
      { fillAlpha: value, outlineOpacity: Math.min(1, value + 0.3) }
    );
  }, []);

  const toggleSegment = useCallback(
    (index: number) => {
      const tools = toolsRef.current;
      const ids = idsRef.current;
      if (!tools || !ids) return;
      const nowVisible = hidden.has(index);
      tools.segmentation.config.visibility.setSegmentIndexVisibility(
        ids.viewportRight,
        { segmentationId: ids.segId },
        index,
        nowVisible
      );
      setHidden((prev) => {
        const next = new Set(prev);
        if (nowVisible) next.delete(index);
        else next.add(index);
        return next;
      });
    },
    [hidden]
  );

  const applyMode = useCallback((next: ToolMode) => {
    const tools = toolsRef.current;
    const ids = idsRef.current;
    setMode(next);
    if (!tools || !ids) return;
    const tg = tools.ToolGroupManager.getToolGroup(`docdo-tg-right-${ids.suffix}`);
    if (!tg) return;
    const { BrushTool, RectangleScissorsTool, CrosshairsTool, WindowLevelTool } = tools;
    for (const name of [BrushTool.toolName, RectangleScissorsTool.toolName]) {
      tg.setToolDisabled(name);
    }
    if (next === "navegar") {
      tg.setToolActive(WindowLevelTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
      });
      tg.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
      });
    } else {
      // Editing modes own the primary button on the right viewport.
      tg.setToolDisabled(CrosshairsTool.toolName);
      tg.setToolDisabled(WindowLevelTool.toolName);
      if (next === "pincel" || next === "borracha") {
        tg.setActiveStrategy(
          BrushTool.toolName,
          next === "pincel" ? "FILL_INSIDE_CIRCLE" : "ERASE_INSIDE_CIRCLE"
        );
        tg.setToolActive(BrushTool.toolName, {
          bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
        });
      } else if (next === "cortar") {
        tg.setActiveStrategy(RectangleScissorsTool.toolName, "ERASE_INSIDE");
        tg.setToolActive(RectangleScissorsTool.toolName, {
          bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
        });
      }
      // "ponto" leaves primary free: clicks are captured via MOUSE_CLICK events.
    }
  }, []);

  const changeMode = useCallback(
    (next: ToolMode) => {
      if (next === "ponto" && !sessionId) {
        setResegError("Re-segmentação indisponível (sessão expirada).");
        return;
      }
      setResegError(null);
      setPoints([]);
      applyMode(next);
    },
    [applyMode, sessionId]
  );

  const setBrushSize = useCallback((value: number) => {
    setBrushSizeState(value);
    brushSizeRef.current = value;
    const tools = toolsRef.current;
    const ids = idsRef.current;
    if (!tools || !ids) return;
    const tg = tools.ToolGroupManager.getToolGroup(`docdo-tg-right-${ids.suffix}`);
    tg?.setToolConfiguration(tools.BrushTool.toolName, { brushSize: value });
  }, []);

  const setActiveSegment = useCallback((index: number) => {
    setActiveSegmentState(index);
    setTargetSegment(index);
    const tools = toolsRef.current;
    const ids = idsRef.current;
    if (!tools || !ids) return;
    tools.segmentation.segmentIndex.setActiveSegmentIndex(ids.segId, index);
  }, []);

  const teardown = useCallback(async () => {
    const ids = idsRef.current;
    if (!ids) return;
    idsRef.current = null;
    try {
      await ensureInit();
      const core = await import("@cornerstonejs/core");
      const tools = await import("@cornerstonejs/tools");
      tools.segmentation.removeAllSegmentations();
      const re = core.getRenderingEngine(`docdo-re-${ids.suffix}`);
      (
        re as unknown as { _docdoSyncs?: Array<{ destroy: () => void }> } | undefined
      )?._docdoSyncs?.forEach((s) => s.destroy());
      re?.destroy();
      tools.ToolGroupManager.destroyToolGroup(`docdo-tg-left-${ids.suffix}`);
      tools.ToolGroupManager.destroyToolGroup(`docdo-tg-right-${ids.suffix}`);
      core.cache.removeVolumeLoadObject(ids.volumeId);
      core.cache.removeVolumeLoadObject(ids.labelmapVolumeId);
    } catch {
      // best-effort teardown
    }
  }, []);

  const setup = useCallback(async () => {
    if (!leftRef.current || !rightRef.current) return;
    setStatus("loading");
    await teardown();
    await ensureInit();
    const core = await import("@cornerstonejs/core");
    const tools = await import("@cornerstonejs/tools");
    toolsRef.current = tools;
    coreRef.current = core;
    const { volumeLoader, RenderingEngine, Enums: CoreEnums, setVolumesForViewports } = core;
    const { segmentation, ToolGroupManager, synchronizers, utilities } = tools;

    const suffix = ++mountCounter;
    const volumeId = `docdo-vol-${suffix}`;
    const labelmapVolumeId = `docdo-label-${suffix}`;
    const segId = `docdo-seg-${suffix}`;
    const vpLeft = `docdo-left-${suffix}`;
    const vpRight = `docdo-right-${suffix}`;
    const reId = `docdo-re-${suffix}`;
    idsRef.current = { suffix, volumeId, segId, labelmapVolumeId, viewportRight: vpRight };

    // The nifti loader detects compression via the URL path; blob URLs carry no
    // ".gz" suffix, so gzip data must be decompressed before staging.
    const stageForLoader = async (blob: Blob) => {
      const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      return head[0] === 0x1f && head[1] === 0x8b
        ? new Blob([await gzipDecompress(await blob.arrayBuffer())])
        : blob;
    };
    const volumeBlobForLoader = await stageForLoader(volumeBlob);
    const labelmapBlobForLoader = activeLabelmap ? await stageForLoader(activeLabelmap) : null;

    const volumeUrl = URL.createObjectURL(volumeBlobForLoader);
    const labelmapUrl = labelmapBlobForLoader ? URL.createObjectURL(labelmapBlobForLoader) : null;

    const renderingEngine = new RenderingEngine(reId);
    const syncs: Array<{ destroy: () => void }> = [];
    (renderingEngine as unknown as { _docdoSyncs?: Array<{ destroy: () => void }> })._docdoSyncs =
      syncs;

    const addNavTools = (tg: NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>) => {
      tg.addTool(tools.StackScrollTool.toolName);
      tg.addTool(tools.ZoomTool.toolName);
      tg.addTool(tools.PanTool.toolName);
      tg.addTool(tools.WindowLevelTool.toolName);
      tg.addTool(tools.CrosshairsTool.toolName);
      tg.setToolActive(tools.WindowLevelTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
      });
      tg.setToolActive(tools.PanTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }],
      });
      tg.setToolActive(tools.ZoomTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
      });
      tg.setToolActive(tools.StackScrollTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
      });
      tg.setToolActive(tools.CrosshairsTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
      });
    };

    try {
      const nifti = await import("@cornerstonejs/nifti-volume-loader");
      const volumeImageIds = await nifti.createNiftiImageIdsAndCacheMetadata({ url: volumeUrl });
      const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: volumeImageIds });
      await volume.load();

      renderingEngine.setViewports([
        {
          viewportId: vpLeft,
          type: CoreEnums.ViewportType.ORTHOGRAPHIC,
          element: leftRef.current,
          defaultOptions: { orientation: CoreEnums.OrientationAxis.AXIAL },
        },
        {
          viewportId: vpRight,
          type: CoreEnums.ViewportType.ORTHOGRAPHIC,
          element: rightRef.current,
          defaultOptions: { orientation: CoreEnums.OrientationAxis.AXIAL },
        },
      ]);

      // Separate tool groups keep the left viewport navigation-only while the
      // right viewport can switch to brush/scissors editing.
      const tgLeft = ToolGroupManager.createToolGroup(`docdo-tg-left-${suffix}`);
      const tgRight = ToolGroupManager.createToolGroup(`docdo-tg-right-${suffix}`);
      if (!tgLeft || !tgRight) throw new Error("Falha ao criar grupo de ferramentas do visualizador.");
      tgLeft.addViewport(vpLeft, reId);
      tgRight.addViewport(vpRight, reId);
      addNavTools(tgLeft);
      addNavTools(tgRight);
      tgRight.addTool(tools.BrushTool.toolName);
      tgRight.addTool(tools.RectangleScissorsTool.toolName);
      tgRight.setToolConfiguration(tools.BrushTool.toolName, { brushSize: brushSizeRef.current });
      tgRight.setToolDisabled(tools.BrushTool.toolName);
      tgRight.setToolDisabled(tools.RectangleScissorsTool.toolName);

      await setVolumesForViewports(renderingEngine, [{ volumeId }], [vpLeft, vpRight]);

      // Synchronize camera + slice between the two viewports.
      const camSync = synchronizers.createCameraPositionSynchronizer(`docdo-sync-cam-${suffix}`);
      const sliceSync = synchronizers.createImageSliceSynchronizer(`docdo-sync-slice-${suffix}`);
      for (const sync of [camSync, sliceSync]) {
        sync.addSource({ renderingEngineId: reId, viewportId: vpLeft });
        sync.addTarget({ renderingEngineId: reId, viewportId: vpRight });
        syncs.push(sync);
      }

      if (labelmapUrl) {
        const labelImageIds = await nifti.createNiftiImageIdsAndCacheMetadata({ url: labelmapUrl });
        const labelVolume = await volumeLoader.createAndCacheVolume(labelmapVolumeId, {
          imageIds: labelImageIds,
        });
        await labelVolume.load();

        segmentation.addSegmentations([
          {
            segmentationId: segId,
            representation: {
              type: tools.Enums.SegmentationRepresentations.Labelmap,
              data: { volumeId: labelmapVolumeId },
            },
          },
        ]);
        await segmentation.addLabelmapRepresentationToViewport(vpRight, [
          { segmentationId: segId, type: tools.Enums.SegmentationRepresentations.Labelmap },
        ]);
        segmentation.config.style.setStyle(
          { viewportId: vpRight, type: tools.Enums.SegmentationRepresentations.Labelmap },
          { fillAlpha: opacity, outlineOpacity: Math.min(1, opacity + 0.3) }
        );

        const indices = utilities.segmentation.getUniqueSegmentIndices(segId) as number[];
        const segInfos = indices
          .filter((i) => i > 0)
          .map((i) => ({
            index: i,
            color: rgbaToHex(
              segmentation.config.color.getSegmentIndexColor(vpRight, segId, i) as number[]
            ),
            label: `Segmento ${i}`,
          }));
        setSegments(segInfos);
        if (segInfos.length > 0) {
          setActiveSegmentState(segInfos[0].index);
          setTargetSegment(segInfos[0].index);
          segmentation.segmentIndex.setActiveSegmentIndex(segId, segInfos[0].index);
        }
      }

      renderingEngine.render();
      setStatus("ready");
    } finally {
      URL.revokeObjectURL(volumeUrl);
      if (labelmapUrl) URL.revokeObjectURL(labelmapUrl);
    }
  }, [volumeBlob, activeLabelmap, opacity, teardown]);

  useEffect(() => {
    void setup().catch((e) => {
      setError(e instanceof Error ? e.message : "Falha ao carregar o volume.");
      setStatus("error");
    });
  }, [setup]);

  useEffect(() => {
    if (status !== "ready" || !activeLabelmap || !onRegisterLabelmapGetter) return;
    onRegisterLabelmapGetter(async () => {
      const core = coreRef.current;
      const tools = toolsRef.current;
      const ids = idsRef.current;
      if (!core || !tools || !ids) throw new Error("Visualizador não inicializado.");
      const labelVolume = core.cache.getVolume(ids.labelmapVolumeId);
      if (!labelVolume) throw new Error("Labelmap não carregado.");
      const vm = labelVolume.voxelManager;
      const scalarData =
        vm?.getCompleteScalarDataArray?.() ??
        (labelVolume.imageData?.getPointData().getScalars().getData() as unknown as ArrayLike<number>);
      if (!scalarData) throw new Error("Não foi possível ler os voxels do labelmap.");
      tools.utilities.segmentation.triggerSegmentationRender(ids.viewportRight);
      return buildEditedNifti(activeLabelmap, scalarData);
    });
  }, [status, activeLabelmap, onRegisterLabelmapGetter]);

  // Point prompts: primary click = positive, alt-click = negative.
  useEffect(() => {
    if (status !== "ready" || mode !== "ponto") return;
    let cleanup: (() => void) | null = null;
    const handler = (evt: Event) => {
      const ids = idsRef.current;
      if (!ids) return;
      const detail = (
        evt as CustomEvent<{
          viewportId: string;
          currentPoints?: { world?: { x: number; y: number; z: number } };
          event?: { altKey?: boolean; button?: number; buttons?: number };
        }>
      ).detail;
      if (!detail || detail.viewportId !== ids.viewportRight) return;
      const world = detail.currentPoints?.world;
      if (!world) return;
      const isNegative = negativeMode || detail.event?.altKey === true || detail.event?.button === 2;
      setPoints((prev) => [
        ...prev,
        { x: world.x, y: world.y, z: world.z, pos: !isNegative },
      ]);
    };
    void Promise.all([import("@cornerstonejs/tools"), import("@cornerstonejs/core")]).then(
      ([t, c]) => {
        const target = c.eventTarget;
        target.addEventListener(t.Enums.Events.MOUSE_CLICK, handler);
        cleanup = () => target.removeEventListener(t.Enums.Events.MOUSE_CLICK, handler);
      }
    );
    return () => {
      cleanup?.();
    };
  }, [status, mode, negativeMode]);

  // Unmount cleanup: destroy engine, tool groups, synchronizers, cached volumes.
  useEffect(() => {
    return () => {
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resegmentar = useCallback(async () => {
    if (!sessionId || !targetSegment || points.length === 0) return;
    setResegStatus("running");
    setResegError(null);
    try {
      // TODO(coord convention): world coords are LPS (Cornerstone); the MONAI
      // runner assumes a spacing-scaled voxel index — RAS/LPS flip may be needed.
      const blob = await runInteractive(sessionId, points, targetSegment);
      setPendingLabelmap(blob);
      setResegStatus("choice");
    } catch (e) {
      setResegError(e instanceof Error ? e.message : "Falha na re-segmentação.");
      setResegStatus("idle");
    }
  }, [sessionId, points, targetSegment]);

  const acceptNewLabelmap = useCallback(() => {
    if (!pendingLabelmap) return;
    setPoints([]);
    setResegStatus("idle");
    setPendingLabelmap(null);
    setActiveLabelmap(pendingLabelmap);
    labelmapBlobRef.current = pendingLabelmap;
  }, [pendingLabelmap]);

  const keepEdits = useCallback(() => {
    setPoints([]);
    setResegStatus("idle");
    setPendingLabelmap(null);
  }, []);

  if (status === "error") {
    return <p className="card p-4 text-sm text-red-300">{error}</p>;
  }

  const editReady = activeLabelmap !== null && segments.length > 0;

  return (
    <div className="space-y-4">
      <div className="relative grid gap-4 md:grid-cols-2">
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-ink-950/60 text-sm text-ink-300">
            <Loader2 className="size-4 animate-spin" /> Carregando volume…
          </div>
        )}
        <figure className="card relative overflow-hidden p-0">
          <div ref={leftRef} className="h-[28rem] w-full" />
          <figcaption className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
            Volume original{volumeName ? ` · ${volumeName}` : ""}
          </figcaption>
        </figure>
        <figure className="card relative overflow-hidden p-0">
          <div ref={rightRef} className="h-[28rem] w-full" />
          <figcaption className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
            Segmentação
          </figcaption>
          {!activeLabelmap && (
            <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-xs text-white">
              Sem segmentação
            </p>
          )}
        </figure>
      </div>

      {editReady && (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-50">Ferramentas</span>
            {(
              [
                ["navegar", MousePointer2],
                ["pincel", Brush],
                ["borracha", Eraser],
                ["cortar", Square],
                ["ponto", CircleDot],
              ] as const
            ).map(([m, Icon]) => (
              <button
                key={m}
                type="button"
                onClick={() => changeMode(m)}
                aria-pressed={mode === m}
                className={`btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${
                  mode === m ? "bg-brand-500/20 text-brand-100" : ""
                }`}
              >
                <Icon className="size-3.5" /> {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {(mode === "pincel" || mode === "borracha") && (
            <label className="flex items-center gap-3 text-xs text-ink-300">
              Tamanho do pincel
              <input
                type="range"
                min={2}
                max={80}
                step={1}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-48 accent-brand-500"
              />
              <span className="tabular-nums">{brushSize}px</span>
            </label>
          )}

          {mode === "pincel" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-300">Segmento ativo</span>
              {segments.map((s) => (
                <button
                  key={s.index}
                  type="button"
                  onClick={() => setActiveSegment(s.index)}
                  aria-pressed={activeSegment === s.index}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs transition ${
                    activeSegment === s.index ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span className="size-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-ink-100">{s.index}</span>
                </button>
              ))}
            </div>
          )}

          {mode === "ponto" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink-300">Segmento alvo</span>
                {segments.map((s) => (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => setTargetSegment(s.index)}
                    aria-pressed={targetSegment === s.index}
                    className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs transition ${
                      targetSegment === s.index ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="size-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-ink-100">{s.index}</span>
                  </button>
                ))}
                <label className="ml-2 flex items-center gap-1.5 text-xs text-ink-300">
                  <input
                    type="checkbox"
                    checked={negativeMode}
                    onChange={(e) => setNegativeMode(e.target.checked)}
                    className="accent-brand-500"
                  />
                  Próximo ponto negativo
                </label>
              </div>
              {points.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {points.map((p, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setPoints((prev) => prev.filter((_, j) => j !== i))}
                        className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs ${
                          p.pos ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200"
                        }`}
                      >
                        {p.pos ? "+" : <Minus className="size-3" />}
                        <span className="tabular-nums">
                          {p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}
                        </span>
                        <X className="size-3 opacity-60" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                disabled={resegStatus !== "idle" || points.length === 0 || !sessionId}
                onClick={() => void resegmentar()}
                className="btn-primary inline-flex items-center gap-2 text-xs disabled:opacity-40"
              >
                {resegStatus === "running" && <Loader2 className="size-3.5 animate-spin" />}
                Re-segmentar
              </button>
              {resegError && <p className="text-sm text-red-300">{resegError}</p>}
            </div>
          )}

          {resegStatus === "choice" && pendingLabelmap && (
            <div className="space-y-2 rounded-xl bg-white/5 p-3">
              <p className="text-xs text-ink-100">
                Nova segmentação pronta. Descartar suas edições manuais e usar a nova?
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={acceptNewLabelmap} className="btn-primary px-3 py-1.5 text-xs">
                  Descartar edições e usar nova segmentação
                </button>
                <button type="button" onClick={keepEdits} className="btn-ghost px-3 py-1.5 text-xs">
                  Manter minhas edições
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {editReady && (
        <div className="card space-y-3 p-4">
          <p className="text-sm font-semibold text-ink-50">Segmentos ({segments.length})</p>
          <ul className="flex flex-wrap gap-2">
            {segments.map((s) => (
              <li key={s.index}>
                <button
                  type="button"
                  onClick={() => toggleSegment(s.index)}
                  aria-pressed={!hidden.has(s.index)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs transition ${
                    hidden.has(s.index) ? "opacity-40 hover:opacity-70" : "hover:bg-white/5"
                  }`}
                >
                  <span className="size-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-ink-100">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-3 text-xs text-ink-300">
            Opacidade da sobreposição
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-48 accent-brand-500"
            />
            <span className="tabular-nums">{Math.round(opacity * 100)}%</span>
          </label>
        </div>
      )}
    </div>
  );
}
