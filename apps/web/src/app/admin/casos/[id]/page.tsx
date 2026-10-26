import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Maximize2 } from "lucide-react";
import type { AdminCaseDTO } from "@docdo/contracts";
import { api, ApiError } from "@/lib/api";
import { EXAM_LABEL, PLANS } from "@/lib/constants";
import { brl, caseCode, date } from "@/lib/format";
import { OrderBadge, StatusBadge } from "@/components/ui/badge";
import { Section } from "@/components/ui/misc";
import { StatusStepper } from "@/components/cases/stepper";
import { ModelUploader, DicomUploader } from "@/components/cases/uploader";
import { DicomList } from "@/components/cases/dicom-list";
import { Timeline } from "@/components/cases/timeline";
import { AccessList } from "@/components/cases/access-list";
import { Viewer3D } from "@/components/viewer";
import { AdminCaseForm } from "../case-form";
import { AccessManager } from "@/components/admin/access-manager";
import { DeleteCaseButton, GalleryForm, ModelRow, StatusButton } from "./client";

export default async function AdminCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // a API registra o acesso do admin no log do caso
  let c: AdminCaseDTO;
  try {
    c = await api<AdminCaseDTO>(`/admin/cases/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <>
      <Link href="/admin/casos" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-50">
        <ArrowLeft className="size-4" /> Casos
      </Link>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink-50">{c.title}</h1>
            <StatusBadge status={c.status} />
            {c.isPublic && <span className="rounded-full bg-sky-400/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300 ring-1 ring-sky-400/25">Na galeria · {c.views} views</span>}
          </div>
          <p className="mt-1.5 text-sm text-ink-300">
            <span className="font-mono">{caseCode(c.code)}</span> · {EXAM_LABEL[c.examType]} · {PLANS[c.plan].name} · {c.patient?.name ?? "sem paciente"} · {c.doctor?.name ?? "sem médico"} · {c.organization?.name ?? "sem clínica"} · {date(c.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(c.status === "PAID" || c.status === "UPLOADED") && <StatusButton caseId={c.id} status="PROCESSING">Iniciar reconstrução</StatusButton>}
          {c.status !== "READY" && c.models.length > 0 && <StatusButton caseId={c.id} status="READY" primary>Marcar 3D como pronto</StatusButton>}
          {c.models.length > 0 && (
            <Link href={`/visualizador/${c.id}`} className="btn-ghost"><Maximize2 className="size-4" /> Visualizador</Link>
          )}
        </div>
      </div>

      <div className="card mb-6 p-5"><StatusStepper status={c.status} /></div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Section title={`Modelos 3D (${c.models.length})`}>
            {c.models.length > 0 && (
              <div className="mb-5 h-[420px]">
                <Viewer3D key={c.models.map((m) => `${m.id}${m.color}${m.opacity}`).join()} models={c.models} className="h-full w-full" />
              </div>
            )}
            <ModelUploader caseId={c.id} />
            {c.models.length > 0 && (
              <div className="mt-4 divide-y divide-white/[0.04]">
                {c.models.map((m) => (
                  <ModelRow key={m.id} m={{ id: m.id, name: m.name, color: m.color, opacity: m.opacity, sortOrder: m.sortOrder, format: m.format, size: m.size, volumeMl: m.volumeMl }} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Dados do caso">
            <AdminCaseForm c={c} patient={c.patient} doctor={c.doctor} />
          </Section>

          <Section title={`Arquivos DICOM (${c.dicomFiles.length})`}>
            <div className="mb-5"><DicomUploader caseId={c.id} /></div>
            <DicomList caseId={c.id} files={c.dicomFiles} canDelete />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Acesso ao caso">
            <AccessManager caseId={c.id} patient={c.patient} doctor={c.doctor} shared={c.shares.map((s) => ({ id: s.userId, name: s.name, email: s.email, role: s.role }))} />
          </Section>
          <Section title="Galeria pública">
            <GalleryForm caseId={c.id} isPublic={c.isPublic} publicTitle={c.publicTitle ?? ""} publicDescription={c.publicDescription ?? ""} />
          </Section>
          <Section title="Pedidos" actions={<Link href="/admin/compras" className="text-xs font-semibold text-brand-400">Compras</Link>}>
            {c.orders.length ? (
              <ul className="space-y-3">
                {c.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="text-ink-100">{PLANS[o.plan].name} · {brl(o.amount)}</p>
                      <p className="text-xs text-ink-400">{o.user?.name} · {date(o.createdAt)} · {o.method}</p>
                    </div>
                    <OrderBadge status={o.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-400">Nenhum pedido.</p>
            )}
          </Section>
          <Section title="Histórico"><Timeline events={c.events} /></Section>
          <Section title="Acessos ao exame (LGPD)"><AccessList logs={c.accessLogs} showIp /></Section>
          <Section title="Zona de perigo"><DeleteCaseButton caseId={c.id} /></Section>
        </div>
      </div>
    </>
  );
}
