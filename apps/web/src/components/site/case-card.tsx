import Link from "next/link";
import { Box, Eye } from "lucide-react";
import { EXAM_LABEL } from "@/lib/constants";
import type { ExamType } from "@docdo/contracts";

export type GalleryCase = {
  id: string;
  title: string;
  description: string | null;
  examType: ExamType;
  bodyRegion: string | null;
  views: number;
  models: { name: string; color: string }[];
};

/** Capa gerada a partir das cores das estruturas (sem imagem do paciente). */
export function CaseCard({ c, href }: { c: GalleryCase; href: string }) {
  const colors = c.models.map((m) => m.color);
  return (
    <Link href={href} className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-brand-500/30">
      <div data-theme="dark" className="relative aspect-[16/10] overflow-hidden bg-ink-950">
        {colors.map((col, i) => (
          <span
            key={i}
            className="absolute rounded-full opacity-70 blur-2xl transition duration-700 group-hover:scale-110"
            style={{
              background: col,
              width: `${38 + ((i * 17) % 30)}%`,
              height: `${45 + ((i * 23) % 30)}%`,
              left: `${(i * 29) % 70}%`,
              top: `${(i * 37) % 55}%`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,#060908_95%)]" />
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-ink-950/60 text-brand-300 ring-1 ring-white/10 backdrop-blur transition group-hover:scale-110 group-hover:bg-brand-500 group-hover:text-on-brand">
            <Box className="size-6" />
          </span>
        </div>
        <span className="absolute top-3 left-3 rounded-full bg-ink-950/70 px-2.5 py-1 text-[11px] font-semibold text-ink-100 backdrop-blur">
          {EXAM_LABEL[c.examType]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold text-brand-400">{c.bodyRegion ?? "Caso clínico"}</p>
        <h3 className="mt-1 font-semibold text-ink-50">{c.title}</h3>
        {c.description && <p className="mt-2 line-clamp-2 text-sm text-ink-300">{c.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-ink-400">
          <span className="flex -space-x-1">
            {c.models.slice(0, 6).map((m) => (
              <span key={m.name} title={m.name} className="size-3.5 rounded-full ring-2 ring-ink-850" style={{ background: m.color }} />
            ))}
            <span className="pl-3">{c.models.length} estruturas</span>
          </span>
          <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> {c.views}</span>
        </div>
      </div>
    </Link>
  );
}
