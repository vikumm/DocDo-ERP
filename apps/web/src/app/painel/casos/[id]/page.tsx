import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Box, Maximize2 } from "lucide-react";
import type { CaseDetailDTO } from "@docdo/contracts";
import { api, ApiError } from "@/lib/api";
import { requireMe } from "@/lib/auth";
import { EXAM_LABEL, PLANS } from "@/lib/constants";
import { brl, caseCode, date } from "@/lib/format";
import { OrderBadge, StatusBadge } from "@/components/ui/badge";
import { Avatar, Section } from "@/components/ui/misc";
import { StatusStepper } from "@/components/cases/stepper";
import { DicomUploader } from "@/components/cases/uploader";
import { DicomList } from "@/components/cases/dicom-list";
import { Timeline } from "@/components/cases/timeline";
import { AccessList } from "@/components/cases/access-list";
import { Viewer3D } from "@/components/viewer";
import { CheckoutForm, ShareForm, UnshareButton } from "./client";

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const { id } = await params;
  const { novo } = await searchParams;
  const me = await requireMe(["DOCTOR", "PATIENT", "SECRETARY"]);
  const user = me.user;
  // a API confere o acesso, registra a visualização e omite o conteúdo clínico para a secretária
  let c: CaseDetailDTO;
  try {
    c = await api<CaseDetailDTO>(`/cases/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const canUpload = c.canUpload;
  const pendingOrder = c.orders.find((o) => o.status === "PENDING");
  const ready = c.status === "READY" && c.models.length > 0 && !c.restricted;

  return (
    <>
      <Link href="/painel" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-50">
        <ArrowLeft className="size-4" /> {user.role === "PATIENT" ? "Meus casos" : "Casos"}
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">{c.title}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1.5 text-sm text-ink-300">
            <span className="font-mono">{caseCode(c.code)}</span> · {EXAM_LABEL[c.examType]}
            {c.bodyRegion && ` · ${c.bodyRegion}`} · Plano {PLANS[c.plan].name} · criado em {date(c.createdAt)}
            {c.organization && ` · ${c.organization.name}`}
          </p>
        </div>
        {ready && (
          <Link href={`/visualizador/${c.id}`} className="btn-primary shrink-0">
            <Maximize2 className="size-4" /> Abrir visualizador 3D
          </Link>
        )}
      </div>

      {novo && canUpload && !c.dicomFiles.length && (
        <p className="mb-6 rounded-xl border border-brand-500/20 bg-brand-500/[0.06] px-4 py-3 text-sm text-brand-200">
          Caso criado! Agora envie os arquivos DICOM do exame abaixo.
        </p>
      )}

      {c.restricted && (
        <p className="mb-6 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-ink-300">
          Você vê o andamento do caso e pode enviar arquivos. O conteúdo clínico (descrição, 3D e download do exame) fica restrito ao médico e ao paciente.
        </p>
      )}

      <div className="card mb-6 p-5 sm:p-6">
        <StatusStepper status={c.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {ready ? (
            <div className="h-[480px] sm:h-[560px]">
              <Viewer3D models={c.models} title="Reconstrução 3D" subtitle={`${c.models.length} estruturas`} className="h-full w-full" />
            </div>
          ) : (
            <div className="card flex flex-col items-center px-6 py-12 text-center">
              <Box className="size-8 text-ink-500" />
              <p className="mt-3 font-semibold text-ink-100">
                {c.restricted && c.status === "READY"
                  ? "3D pronto: disponível para o médico e o paciente"
                  : c.status === "PROCESSING" ? "Nossa equipe está reconstruindo seu 3D" : c.status === "PAID" ? "Pagamento confirmado — caso na fila de reconstrução" : "O modelo 3D aparece aqui quando estiver pronto"}
              </p>
              <p className="mt-1 max-w-md text-sm text-ink-400">
                {c.status === "CREATED" && "Comece enviando os arquivos DICOM do exame."}
                {c.status === "UPLOADED" && "Arquivos recebidos. Conclua o pagamento para iniciarmos a reconstrução."}
                {(c.status === "PAID" || c.status === "PROCESSING") && `Plano ${PLANS[c.plan].name}. Avisaremos aqui assim que o 3D estiver pronto.`}
              </p>
            </div>
          )}

          {c.status === "UPLOADED" && (
            <Section title="Pagamento">
              <CheckoutForm caseId={c.id} currentPlan={c.plan} pending={!!pendingOrder} />
            </Section>
          )}

          <Section title="Arquivos DICOM">
            {canUpload && (
              <div className="mb-5">
                <DicomUploader caseId={c.id} />
              </div>
            )}
            <DicomList caseId={c.id} files={c.dicomFiles} canDelete={canUpload} canDownload={!c.restricted} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Pessoas">
            <ul className="space-y-4">
              {[
                { label: "Paciente", p: c.patient, extra: null },
                { label: "Médico responsável", p: c.doctor, extra: c.doctor?.crm ? [c.doctor.crm, c.doctor.specialty].filter(Boolean).join(" · ") : null },
              ].map(({ label, p, extra }) => (
                <li key={label} className="flex items-center gap-3">
                  {p ? <Avatar name={p.name} /> : <span className="size-9 rounded-full border border-dashed border-white/15" />}
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">{label}</p>
                    <p className="truncate text-sm text-ink-50">{p?.name ?? "Não vinculado"}</p>
                    {extra && <p className="text-xs text-ink-400">{extra}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {!c.restricted && (
            <div className="mt-5 border-t border-white/[0.06] pt-5">
              <p className="mb-2 text-xs font-semibold text-ink-300">Também têm acesso</p>
              {c.shares.length ? (
                <ul className="mb-3 space-y-2">
                  {c.shares.map((s) => (
                    <li key={s.userId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-ink-100">{s.name} <span className="text-xs text-ink-400">({s.role === "DOCTOR" ? "médico" : "paciente"})</span></span>
                      {c.createdById === user.id && <UnshareButton caseId={c.id} userId={s.userId} />}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-xs text-ink-400">Ninguém além dos responsáveis.</p>
              )}
              {c.canShare && <ShareForm caseId={c.id} />}
            </div>
            )}
          </Section>

          {c.description && (
            <Section title="Observações">
              <p className="text-sm whitespace-pre-line text-ink-200">{c.description}</p>
            </Section>
          )}

          {c.orders.length > 0 && (
            <Section title="Pedidos">
              <ul className="space-y-3">
                {c.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="text-ink-100">{PLANS[o.plan].name} · {brl(o.amount)}</p>
                      <p className="text-xs text-ink-400">{date(o.createdAt)} · {o.method}</p>
                    </div>
                    <OrderBadge status={o.status} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Histórico">
            <Timeline events={c.events} />
          </Section>

          {!c.restricted && (
            <Section title="Quem acessou este exame">
              <AccessList logs={c.accessLogs} />
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
