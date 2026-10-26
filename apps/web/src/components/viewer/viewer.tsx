"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, Environment, GizmoHelper, GizmoViewport, Html, Lightformer, Line } from "@react-three/drei";
import clsx from "clsx";
import {
  Box,
  Camera,
  Eye,
  EyeOff,
  Focus,
  Layers,
  Maximize,
  Minimize,
  MousePointer2,
  RotateCcw,
  Ruler,
  Scissors,
  Sparkles,
  Trash2,
  Expand,
  X,
  FlipVertical2,
  Grid3x3,
} from "lucide-react";
import { loadGeometry } from "./loaders";

export type ViewerModel = {
  id: string;
  name: string;
  url: string;
  format: string;
  color: string;
  opacity: number;
  volumeMl?: number | null;
};

type Layer = ViewerModel & {
  visible: boolean;
  geometry?: THREE.BufferGeometry;
  centroid?: THREE.Vector3;
  size?: THREE.Vector3;
  error?: string;
};

type Tool = "orbit" | "measure" | "clip" | "explode";
type ClipAxis = "axial" | "coronal" | "sagittal";
type Measurement = { id: number; a: THREE.Vector3; b: THREE.Vector3 };

// eixos do mundo após a rotação Z-up → Y-up: X = esquerda do paciente, Y = superior, Z = anterior
const CLIP_NORMAL: Record<ClipAxis, THREE.Vector3> = {
  axial: new THREE.Vector3(0, -1, 0),
  coronal: new THREE.Vector3(0, 0, -1),
  sagittal: new THREE.Vector3(-1, 0, 0),
};
const AXIS_INDEX: Record<ClipAxis, "x" | "y" | "z"> = { axial: "y", coronal: "z", sagittal: "x" };

const VIEWS = [
  { key: "A", label: "Anterior", dir: [0, 0, 1] },
  { key: "P", label: "Posterior", dir: [0, 0, -1] },
  { key: "D", label: "Direita", dir: [-1, 0, 0] },
  { key: "E", label: "Esquerda", dir: [1, 0, 0] },
  { key: "S", label: "Superior", dir: [0, 1, 0.0001] },
  { key: "I", label: "Inferior", dir: [0, -1, 0.0001] },
] as const;

const BACKGROUNDS = {
  dark: { css: "radial-gradient(120% 90% at 50% 20%, #17211d 0%, #0a0f0d 55%, #050807 100%)", fill: "#0a0f0d" },
  studio: { css: "radial-gradient(120% 90% at 50% 15%, #3a4542 0%, #1a2120 60%, #0e1312 100%)", fill: "#1a2120" },
  light: { css: "radial-gradient(120% 90% at 50% 15%, #ffffff 0%, #e8eeeb 60%, #cfd8d4 100%)", fill: "#e8eeeb" },
};

/** Distância em que uma esfera de raio r cabe inteira na tela, considerando FOV vertical e horizontal. */
function fitDistance(c: CameraControls, r: number, padding: number) {
  const cam = c.camera as THREE.PerspectiveCamera;
  const vfov = THREE.MathUtils.degToRad(cam.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
  return (r / Math.sin(Math.min(vfov, hfov) / 2)) * padding;
}

export default function Viewer({
  models,
  title,
  subtitle,
  compact = false,
  headerSlot,
  className,
}: {
  models: ViewerModel[];
  title?: string;
  subtitle?: string;
  /** modo vitrine (landing): sem interface, auto-rotação, sem zoom */
  compact?: boolean;
  headerSlot?: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<CameraControls>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  const [layers, setLayers] = useState<Layer[]>(() => models.map((m) => ({ ...m, visible: true })));
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [bounds, setBounds] = useState<{ box: THREE.Box3; radius: number } | null>(null);

  const [tool, setTool] = useState<Tool>("orbit");
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [clip, setClip] = useState<{ axis: ClipAxis; pos: number; flip: boolean }>({ axis: "axial", pos: 0, flip: false });
  const [explode, setExplode] = useState(0);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [pendingPoint, setPendingPoint] = useState<THREE.Vector3 | null>(null);
  const [autoRotate, setAutoRotate] = useState(compact);
  const [wireframe, setWireframe] = useState(false);
  // fundo inicial acompanha o tema do site; depois o usuário escolhe livremente
  const [bg, setBg] = useState<keyof typeof BACKGROUNDS>(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  useEffect(() => {
    const on = (e: Event) => setBg((e as CustomEvent).detail === "dark" ? "dark" : "light");
    window.addEventListener("docdo-theme", on);
    return () => window.removeEventListener("docdo-theme", on);
  }, []);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  // em containers estreitos (visualizador embutido, celular) o painel começa recolhido para não cobrir o modelo
  useEffect(() => {
    if ((containerRef.current?.clientWidth ?? 0) < 900) setPanelOpen(false);
  }, []);

  // ── carregamento ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(
        models.map((m) => loadGeometry(m.url, m.format, (p) => !cancelled && setProgress((s) => ({ ...s, [m.id]: p })))),
      );
      if (cancelled) return;
      // centraliza o conjunto na origem mantendo a relação anatômica entre as estruturas
      const union = new THREE.Box3();
      results.forEach((r) => r.status === "fulfilled" && union.union(r.value.boundingBox!));
      const center = union.isEmpty() ? new THREE.Vector3() : union.getCenter(new THREE.Vector3());
      const next = models.map<Layer>((m, i) => {
        const r = results[i];
        if (r.status === "rejected") return { ...m, visible: false, error: String(r.reason?.message ?? r.reason) };
        const g = r.value.translate(-center.x, -center.y, -center.z);
        g.computeBoundingBox();
        g.computeBoundingSphere();
        return {
          ...m,
          visible: true,
          geometry: g,
          centroid: g.boundingBox!.getCenter(new THREE.Vector3()),
          size: g.boundingBox!.getSize(new THREE.Vector3()),
        };
      });
      const box = union.isEmpty() ? new THREE.Box3(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50)) : union.clone().translate(center.negate());
      setBounds({ box, radius: box.getBoundingSphere(new THREE.Sphere()).radius });
      setLayers(next);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [models]);

  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  useEffect(() => () => layersRef.current.forEach((l) => l.geometry?.dispose()), []);

  const loadPct = useMemo(() => {
    if (!models.length) return 1;
    return models.reduce((s, m) => s + (progress[m.id] ?? 0), 0) / models.length;
  }, [models, progress]);

  // ── câmera ──
  const goView = useCallback(
    (dir: readonly number[], smooth = true) => {
      const c = controlsRef.current;
      if (!c || !bounds) return;
      const v = new THREE.Vector3(...(dir as [number, number, number])).normalize().multiplyScalar(fitDistance(c, bounds.radius, compact ? 0.95 : 1.1));
      c.setLookAt(v.x, v.y, v.z, 0, 0, 0, smooth);
    },
    [bounds, compact],
  );

  // enquadramento inicial: aplicado dentro da cena, onde o controle de câmera já está montado
  const initialEye = useMemo(() => {
    if (!ready || !bounds) return null;
    return { dir: new THREE.Vector3(...((compact ? [0.35, 0.15, 1] : [0, 0, 1]) as [number, number, number])).normalize(), radius: bounds.radius, padding: compact ? 0.95 : 1.1 };
  }, [ready, bounds, compact]);

  const focusLayer = useCallback((id: string) => {
    const l = layers.find((x) => x.id === id);
    const c = controlsRef.current;
    if (!l?.geometry || !c) return;
    const box = l.geometry.boundingBox!.clone();
    if (explode && l.centroid) box.translate(l.centroid.clone().multiplyScalar(explode));
    c.fitToBox(box, true, { paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 10 });
    setSelected(id);
  }, [layers, explode]);

  const reset = useCallback(() => {
    setExplode(0);
    setTool("orbit");
    setSelected(null);
    setLayers((ls) => ls.map((l) => ({ ...l, visible: !l.error, opacity: models.find((m) => m.id === l.id)?.opacity ?? 1, color: models.find((m) => m.id === l.id)?.color ?? l.color })));
    goView([0, 0, 1]);
  }, [goView, models]);

  // ── utilidades ──
  const screenshot = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;
    const src = gl.domElement;
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = BACKGROUNDS[bg].fill;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    ctx.font = `${Math.round(out.height / 40)}px sans-serif`;
    ctx.fillStyle = bg === "light" ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.5)";
    ctx.fillText(`DocDo · ${title ?? ""} · ${new Date().toLocaleString("pt-BR")}`, out.height / 40, out.height - out.height / 40);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `docdo-${Date.now()}.png`;
    a.click();
  }, [bg, title]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const updateLayer = (id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const solo = (id: string) => setLayers((ls) => ls.map((l) => ({ ...l, visible: !l.error && l.id === id })));
  const showAll = () => setLayers((ls) => ls.map((l) => ({ ...l, visible: !l.error })));

  const selectTool = (t: Tool) => {
    setTool((cur) => (cur === t && t !== "orbit" ? "orbit" : t));
    setPendingPoint(null);
  };

  // atalhos de teclado
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === "r") reset();
      else if (k === "m") selectTool("measure");
      else if (k === "c") selectTool("clip");
      else if (k === "x") selectTool("explode");
      else if (k === "f") toggleFullscreen();
      else if (k === "escape") { setTool("orbit"); setPendingPoint(null); }
      else if (/^[1-6]$/.test(k)) goView(VIEWS[Number(k) - 1].dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact, reset, toggleFullscreen, goView]);

  const clipRange = bounds ? { min: bounds.box.min[AXIS_INDEX[clip.axis]], max: bounds.box.max[AXIS_INDEX[clip.axis]] } : { min: -1, max: 1 };
  const selectedLayer = layers.find((l) => l.id === selected);
  const hoveredLayer = hover && layers.find((l) => l.id === hover.id);
  const light = bg === "light";

  return (
    <div
      ref={containerRef}
      data-theme={compact ? undefined : light ? "light" : "dark"}
      className={clsx("relative isolate overflow-hidden select-none", !compact && "rounded-2xl ring-1 ring-white/[0.06]", fullscreen && "rounded-none!", className)}
      style={{ background: compact ? "transparent" : BACKGROUNDS[bg].css }}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
        camera={{ fov: 35, near: 0.5, far: 5000, position: [0, 0, 300] }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          glRef.current = gl;
        }}
        onPointerMissed={() => tool === "orbit" && setSelected(null)}
        className={clsx(tool === "measure" ? "cursor-crosshair" : hover ? "cursor-pointer" : "cursor-grab active:cursor-grabbing")}
      >
        <Scene
          layers={layers}
          tool={tool}
          clip={tool === "clip" ? clip : null}
          explode={explode}
          wireframe={wireframe}
          selected={selected}
          hovered={hover?.id ?? null}
          measurements={measurements}
          pendingPoint={pendingPoint}
          radius={bounds?.radius ?? 50}
          initialEye={initialEye}
          autoRotate={autoRotate}
          compact={compact}
          controlsRef={controlsRef}
          light={light}
          onHover={(h) => setHover(h)}
          onSelect={(id) => setSelected(id)}
          onFocus={focusLayer}
          onPoint={(p) => {
            if (!pendingPoint) setPendingPoint(p);
            else {
              setMeasurements((ms) => [...ms, { id: Date.now(), a: pendingPoint, b: p }]);
              setPendingPoint(null);
            }
          }}
        />
      </Canvas>

      {/* carregamento */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="w-56 text-center">
            <Box className="mx-auto mb-3 size-6 animate-pulse text-brand-400" />
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${Math.round(loadPct * 100)}%` }} />
            </div>
            {!compact && <p className="mt-2 text-xs text-ink-300">Carregando estruturas · {Math.round(loadPct * 100)}%</p>}
          </div>
        </div>
      )}

      {ready && !models.length && !compact && (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-300">Nenhum modelo 3D disponível para este caso ainda.</div>
      )}

      {/* tooltip de hover */}
      {hoveredLayer && tool !== "measure" && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[140%] rounded-lg bg-ink-950/90 px-2.5 py-1 text-xs font-semibold text-ink-50 ring-1 ring-white/10 backdrop-blur"
          style={{ left: hover!.x, top: hover!.y }}
        >
          <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: hoveredLayer.color }} />
          {hoveredLayer.name}
        </div>
      )}

      {!compact && (
        <>
          {/* cabeçalho */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 sm:p-4">
            <div className="pointer-events-auto flex min-w-0 items-center gap-3">
              {headerSlot}
              {title && (
                <div className="min-w-0 rounded-xl bg-ink-950/70 px-3 py-2 text-ink-50 ring-1 ring-white/[0.08] backdrop-blur">
                  <p className="truncate text-sm font-semibold">{title}</p>
                  {subtitle && <p className="truncate text-xs text-ink-300">{subtitle}</p>}
                </div>
              )}
            </div>
            <div className="pointer-events-auto flex gap-1.5">
              <IconBtn label="Fundo" onClick={() => setBg((b) => (b === "dark" ? "studio" : b === "studio" ? "light" : "dark"))}>
                <Sparkles className="size-4" />
              </IconBtn>
              <IconBtn label="Capturar imagem" onClick={screenshot}>
                <Camera className="size-4" />
              </IconBtn>
              <IconBtn label={fullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              </IconBtn>
            </div>
          </div>

          {/* painel de estruturas */}
          <div className="absolute top-20 left-3 z-10 sm:left-4">
            <button
              onClick={() => setPanelOpen((o) => !o)}
              className="mb-2 inline-flex items-center gap-2 rounded-xl bg-ink-950/70 px-3 py-2 text-xs font-semibold text-ink-100 ring-1 ring-white/[0.08] backdrop-blur"
            >
              <Layers className="size-4" /> Estruturas ({layers.filter((l) => l.visible).length}/{layers.length})
            </button>
            {panelOpen && (
              <div className="max-h-[calc(100%-9rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-ink-950/80 p-2 ring-1 ring-white/[0.06] backdrop-blur-md">
                {layers.map((l) => (
                  <div key={l.id} className={clsx("rounded-xl p-2 transition", selected === l.id ? "bg-white/[0.07]" : "hover:bg-white/[0.04]")}>
                    <div className="flex items-center gap-2">
                      <label className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-white/20" style={{ background: l.color }} title="Alterar cor">
                        <input type="color" value={l.color} onChange={(e) => updateLayer(l.id, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                      </label>
                      <button onClick={() => setSelected(selected === l.id ? null : l.id)} className="min-w-0 flex-1 text-left">
                        <p className={clsx("truncate text-sm font-medium", l.visible ? "text-ink-50" : "text-ink-400 line-through")}>{l.name}</p>
                        <p className="text-[11px] text-ink-400">
                          {l.error ? <span className="text-red-300">erro ao carregar</span> : l.volumeMl ? `${l.volumeMl.toLocaleString("pt-BR")} ml` : l.format.toUpperCase()}
                        </p>
                      </button>
                      <button onClick={() => focusLayer(l.id)} disabled={!l.geometry} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/10 hover:text-ink-50 disabled:opacity-30" title="Focar">
                        <Focus className="size-3.5" />
                      </button>
                      <button onClick={() => updateLayer(l.id, { visible: !l.visible })} disabled={!l.geometry} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/10 hover:text-ink-50 disabled:opacity-30" title={l.visible ? "Ocultar" : "Mostrar"}>
                        {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      </button>
                    </div>
                    {selected === l.id && l.geometry && (
                      <div className="mt-2 space-y-2 border-t border-white/[0.06] pt-2 pl-7">
                        <label className="flex items-center gap-2 text-[11px] text-ink-300">
                          Opacidade
                          <input type="range" min={0.05} max={1} step={0.05} value={l.opacity} onChange={(e) => updateLayer(l.id, { opacity: Number(e.target.value) })} className="flex-1" />
                          <span className="w-8 text-right tabular-nums">{Math.round(l.opacity * 100)}%</span>
                        </label>
                        {l.size && (
                          <p className="text-[11px] text-ink-400">
                            Dimensões: {l.size.x.toFixed(0)} × {l.size.z.toFixed(0)} × {l.size.y.toFixed(0)} mm
                            <span className="block text-ink-500">L-D · A-P · C-C</span>
                          </p>
                        )}
                        <button onClick={() => solo(l.id)} className="text-[11px] font-semibold text-brand-400 hover:text-brand-300">
                          Isolar estrutura
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="mt-1 flex gap-1 border-t border-white/[0.06] p-1 pt-2">
                  <button onClick={showAll} className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold text-ink-200 hover:bg-white/5">Mostrar todas</button>
                  <button onClick={() => setLayers((ls) => ls.map((l) => ({ ...l, opacity: l.opacity < 1 ? 1 : 0.35 })))} className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold text-ink-200 hover:bg-white/5">
                    Raio-X
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* painéis contextuais das ferramentas */}
          <div className="absolute inset-x-0 bottom-20 z-10 flex justify-center px-3">
            {tool === "clip" && (
              <ToolPanel title="Plano de corte" onClose={() => setTool("orbit")}>
                <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-white/[0.04] p-1">
                  {(["axial", "coronal", "sagittal"] as ClipAxis[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setClip((c) => ({ ...c, axis: a, pos: 0 }))}
                      className={clsx("rounded-md px-2 py-1 text-xs font-semibold capitalize", clip.axis === a ? "bg-brand-500 text-on-brand" : "text-ink-200 hover:bg-white/5")}
                    >
                      {a === "sagittal" ? "Sagital" : a}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={clipRange.min}
                    max={clipRange.max}
                    step={(clipRange.max - clipRange.min) / 400}
                    value={clip.pos}
                    onChange={(e) => setClip((c) => ({ ...c, pos: Number(e.target.value) }))}
                    className="w-56"
                  />
                  <button onClick={() => setClip((c) => ({ ...c, flip: !c.flip }))} className="rounded-lg p-1.5 text-ink-200 hover:bg-white/10" title="Inverter lado">
                    <FlipVertical2 className="size-4" />
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-ink-400">Posição: {(clip.pos - clipRange.min).toFixed(1)} mm</p>
              </ToolPanel>
            )}
            {tool === "explode" && (
              <ToolPanel title="Vista explodida" onClose={() => setTool("orbit")}>
                <input type="range" min={0} max={1.5} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="w-64" />
                <p className="mt-2 text-[11px] text-ink-400">Afasta as estruturas a partir do centro para ver relações ocultas.</p>
              </ToolPanel>
            )}
            {tool === "measure" && (
              <ToolPanel title="Medição" onClose={() => setTool("orbit")}>
                <p className="text-[11px] text-ink-300">{pendingPoint ? "Clique no segundo ponto…" : "Clique em dois pontos sobre as estruturas."}</p>
                {measurements.length > 0 && (
                  <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                    {measurements.map((m, i) => (
                      <li key={m.id} className="flex items-center justify-between gap-6 rounded-lg bg-white/[0.04] px-2 py-1 text-xs">
                        <span className="text-ink-300">#{i + 1}</span>
                        <span className="font-mono font-semibold text-brand-300">{m.a.distanceTo(m.b).toFixed(1)} mm</span>
                        <button onClick={() => setMeasurements((ms) => ms.filter((x) => x.id !== m.id))} className="text-ink-400 hover:text-red-300">
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {measurements.length > 0 && (
                  <button onClick={() => setMeasurements([])} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-300">
                    <Trash2 className="size-3" /> Limpar medições
                  </button>
                )}
              </ToolPanel>
            )}
          </div>

          {/* barra de ferramentas */}
          <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-3 sm:bottom-4">
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-ink-950/80 p-1.5 ring-1 ring-white/[0.08] backdrop-blur-md">
              <ToolBtn active={tool === "orbit"} onClick={() => selectTool("orbit")} label="Navegar">
                <MousePointer2 className="size-4" />
              </ToolBtn>
              <ToolBtn active={tool === "measure"} onClick={() => selectTool("measure")} label="Medir (M)">
                <Ruler className="size-4" />
              </ToolBtn>
              <ToolBtn active={tool === "clip"} onClick={() => selectTool("clip")} label="Corte (C)">
                <Scissors className="size-4" />
              </ToolBtn>
              <ToolBtn active={tool === "explode" || explode > 0} onClick={() => selectTool("explode")} label="Explodir (X)">
                <Expand className="size-4" />
              </ToolBtn>
              <span className="mx-1 h-6 w-px bg-white/10" />
              {VIEWS.map((v, i) => (
                <button key={v.key} onClick={() => goView(v.dir)} title={`${v.label} (${i + 1})`} className="grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-ink-200 hover:bg-white/10 hover:text-ink-50">
                  {v.key}
                </button>
              ))}
              <span className="mx-1 h-6 w-px bg-white/10" />
              <ToolBtn active={autoRotate} onClick={() => setAutoRotate((a) => !a)} label="Auto-rotação">
                <RotateCcw className={clsx("size-4", autoRotate && "animate-spin [animation-duration:3s]")} />
              </ToolBtn>
              <ToolBtn active={wireframe} onClick={() => setWireframe((w) => !w)} label="Malha">
                <Grid3x3 className="size-4" />
              </ToolBtn>
              <button onClick={reset} title="Restaurar (R)" className="h-9 shrink-0 rounded-xl px-3 text-xs font-semibold text-ink-200 hover:bg-white/10">
                Restaurar
              </button>
            </div>
          </div>

          {selectedLayer && tool === "orbit" && (
            <div className="absolute top-20 right-3 z-10 hidden w-56 rounded-2xl bg-ink-950/80 p-3 ring-1 ring-white/[0.06] backdrop-blur-md sm:right-4 md:block">
              <p className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Selecionado</p>
              <p className="mt-1 font-semibold text-ink-50">{selectedLayer.name}</p>
              {selectedLayer.volumeMl && <p className="mt-2 text-xs text-ink-300">Volume estimado <span className="float-right font-mono text-ink-50">{selectedLayer.volumeMl.toLocaleString("pt-BR")} ml</span></p>}
              {selectedLayer.size && (
                <p className="mt-1 text-xs text-ink-300">
                  Maior eixo <span className="float-right font-mono text-ink-50">{Math.max(selectedLayer.size.x, selectedLayer.size.y, selectedLayer.size.z).toFixed(1)} mm</span>
                </p>
              )}
              <p className="mt-3 text-[11px] text-ink-500">Duplo clique na estrutura para focar.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Scene({
  layers,
  tool,
  clip,
  explode,
  wireframe,
  selected,
  hovered,
  measurements,
  pendingPoint,
  radius,
  initialEye,
  autoRotate,
  compact,
  controlsRef,
  light,
  onHover,
  onSelect,
  onFocus,
  onPoint,
}: {
  layers: Layer[];
  tool: Tool;
  clip: { axis: ClipAxis; pos: number; flip: boolean } | null;
  explode: number;
  wireframe: boolean;
  selected: string | null;
  hovered: string | null;
  measurements: Measurement[];
  pendingPoint: THREE.Vector3 | null;
  radius: number;
  initialEye: { dir: THREE.Vector3; radius: number; padding: number } | null;
  autoRotate: boolean;
  compact: boolean;
  controlsRef: React.RefObject<CameraControls | null>;
  light: boolean;
  onHover: (h: { id: string; x: number; y: number } | null) => void;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onPoint: (p: THREE.Vector3) => void;
}) {
  const plane = useMemo(() => new THREE.Plane(), []);
  if (clip) {
    const n = CLIP_NORMAL[clip.axis].clone().multiplyScalar(clip.flip ? -1 : 1);
    plane.set(n, clip.flip ? -clip.pos : clip.pos);
  }
  const planes = useMemo(() => (clip ? [plane] : []), [clip, plane]);

  useFrame((_, dt) => {
    if (autoRotate) controlsRef.current?.rotate(dt * 0.35, 0, false);
  });

  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    c.minDistance = radius * 0.3;
    c.maxDistance = radius * 8;
    if (compact) {
      c.mouseButtons.wheel = 0;
      c.mouseButtons.right = 0;
      c.mouseButtons.middle = 0;
      c.touches.two = 0;
      c.touches.three = 0;
    }
  }, [radius, compact, controlsRef]);

  useEffect(() => {
    const c = controlsRef.current;
    if (!c || !initialEye) return;
    const apply = () => {
      const eye = initialEye.dir.clone().multiplyScalar(fitDistance(c, initialEye.radius, initialEye.padding));
      c.setLookAt(eye.x, eye.y, eye.z, 0, 0, 0, false);
    };
    apply();
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [initialEye, controlsRef]);

  /** primeira interseção visível (respeitando o plano de corte) */
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.intersections.find((i) => i.object.userData.layerId && (!clip || plane.distanceToPoint(i.point) >= 0));

  const markerR = radius * 0.012;

  return (
    <>
      <CameraControls ref={controlsRef} makeDefault smoothTime={0.35} />
      <hemisphereLight args={[light ? "#ffffff" : "#dfeee8", light ? "#8b9590" : "#1b2420", 0.9]} />
      <directionalLight position={[radius, radius * 1.5, radius * 2]} intensity={1.6} />
      <directionalLight position={[-radius * 2, -radius, -radius]} intensity={0.5} color="#9fd8c4" />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 5, 5]} scale={[10, 5, 1]} />
        <Lightformer intensity={1} position={[-5, 0, -2]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} color="#bff5e0" />
        <Lightformer intensity={0.8} position={[5, -2, 0]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} />
      </Environment>

      <group
        onPointerMove={(e) => {
          e.stopPropagation();
          const hit = pick(e);
          if (hit) onHover({ id: hit.object.userData.layerId, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
          else onHover(null);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5) return;
          const hit = pick(e);
          if (!hit) return;
          if (tool === "measure") onPoint(hit.point.clone());
          else onSelect(hit.object.userData.layerId);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          const hit = pick(e);
          if (hit && tool !== "measure") onFocus(hit.object.userData.layerId);
        }}
      >
        {layers.map((l) => {
          if (!l.geometry || !l.visible) return null;
          const transparent = l.opacity < 0.999;
          const glow = selected === l.id ? 0.28 : hovered === l.id ? 0.12 : 0;
          const offset = l.centroid && explode ? l.centroid.clone().multiplyScalar(explode) : undefined;
          return (
            <mesh key={l.id} geometry={l.geometry} position={offset} userData={{ layerId: l.id }} renderOrder={transparent ? 2 : 1}>
              <meshPhysicalMaterial
                key={`${transparent}-${!!clip}`}
                color={l.color}
                emissive={l.color}
                emissiveIntensity={glow}
                roughness={0.38}
                metalness={0.02}
                clearcoat={0.35}
                clearcoatRoughness={0.4}
                transparent={transparent}
                opacity={l.opacity}
                depthWrite={!transparent}
                side={clip ? THREE.DoubleSide : THREE.FrontSide}
                clippingPlanes={planes}
                wireframe={wireframe}
              />
            </mesh>
          );
        })}
      </group>

      {measurements.map((m) => (
        <group key={m.id}>
          <Line points={[m.a, m.b]} color="#34e6a0" lineWidth={2} depthTest={false} renderOrder={10} />
          {[m.a, m.b].map((p, i) => (
            <mesh key={i} position={p} renderOrder={10}>
              <sphereGeometry args={[markerR, 16, 16]} />
              <meshBasicMaterial color="#34e6a0" depthTest={false} />
            </mesh>
          ))}
          <Html position={m.a.clone().add(m.b).multiplyScalar(0.5)} center zIndexRange={[15, 0]}>
            <div className="pointer-events-none rounded-md bg-ink-950/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap text-brand-300 ring-1 ring-brand-500/40">
              {m.a.distanceTo(m.b).toFixed(1)} mm
            </div>
          </Html>
        </group>
      ))}
      {pendingPoint && (
        <mesh position={pendingPoint} renderOrder={10}>
          <sphereGeometry args={[markerR * 1.2, 16, 16]} />
          <meshBasicMaterial color="#f5d90a" depthTest={false} />
        </mesh>
      )}

      {!compact && (
        <GizmoHelper alignment="bottom-right" margin={[64, 110]}>
          <GizmoViewport labels={["E", "S", "A"]} axisColors={["#e5484d", "#34e6a0", "#3e63dd"]} labelColor="#0a0f0d" axisHeadScale={0.9} />
        </GizmoHelper>
      )}
    </>
  );
}

function ToolBtn({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx("grid size-9 shrink-0 place-items-center rounded-xl transition", active ? "bg-brand-500 text-on-brand" : "text-ink-200 hover:bg-white/10 hover:text-ink-50")}
    >
      {children}
    </button>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-9 place-items-center rounded-xl bg-ink-950/70 text-ink-200 ring-1 ring-white/[0.08] backdrop-blur transition hover:text-ink-50"
    >
      {children}
    </button>
  );
}

function ToolPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up rounded-2xl bg-ink-950/85 p-3 ring-1 ring-white/[0.08] backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-6">
        <p className="text-xs font-semibold text-ink-50">{title}</p>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-100" aria-label="Fechar">
          <X className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}
