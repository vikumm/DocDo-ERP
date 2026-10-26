"use client";
import dynamic from "next/dynamic";

/** three.js precisa do navegador: carrega o visualizador só no cliente. */
export const Viewer3D = dynamic(() => import("./viewer"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center text-xs text-ink-400">Iniciando visualizador 3D…</div>,
});

export type { ViewerModel } from "./viewer";
