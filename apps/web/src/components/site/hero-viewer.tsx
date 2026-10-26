"use client";
import { Viewer3D, type ViewerModel } from "@/components/viewer";

export function HeroViewer({ models }: { models: ViewerModel[] }) {
  return <Viewer3D models={models} compact className="h-full w-full" />;
}
