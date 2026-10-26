import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ViewerDTO } from "@docdo/contracts";
import { api, ApiError } from "@/lib/api";
import { Viewer3D } from "@/components/viewer";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Visualizador 3D" };

export default async function ViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // a API decide o acesso: caso publicado (qualquer pessoa) ou acesso clínico; registra a visualização
  let v: ViewerDTO;
  try {
    v = await api<ViewerDTO>(`/viewer/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect(`/entrar?next=/visualizador/${id}`);
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="h-dvh p-0 sm:p-3">
      <Viewer3D
        models={v.models}
        title={v.title}
        subtitle={v.subtitle}
        className="h-full w-full rounded-none sm:rounded-2xl"
        headerSlot={
          <>
            <Link href={v.back} className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-950/60 text-ink-200 ring-1 ring-white/[0.06] backdrop-blur hover:text-ink-50" aria-label="Voltar">
              <ArrowLeft className="size-4" />
            </Link>
            <span className="hidden rounded-xl bg-ink-950/60 px-3 py-1.5 ring-1 ring-white/[0.06] backdrop-blur sm:block">
              <Logo href="/" className="[&_img]:h-6" />
            </span>
          </>
        }
      />
    </div>
  );
}
