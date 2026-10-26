import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CaseListItemDTO } from "@docdo/contracts";
import { StatusBadge } from "@/components/ui/badge";
import { EXAM_LABEL } from "@/lib/constants";
import { caseCode, date } from "@/lib/format";

type Row = CaseListItemDTO;

export function CaseTable({
  cases,
  hrefBase,
  showPeople = "both",
  showOrg = false,
}: {
  cases: Row[];
  hrefBase: string;
  showPeople?: "patient" | "doctor" | "both";
  /** mostra a clínica dona do caso (admin, ou quem participa de várias) */
  showOrg?: boolean;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="table-base min-w-[720px]">
        <thead>
          <tr>
            <th>Caso</th>
            <th>Exame</th>
            {showPeople !== "doctor" && <th>Paciente</th>}
            {showPeople !== "patient" && <th>Médico</th>}
            {showOrg && <th>Clínica</th>}
            <th>Status</th>
            <th>Criado em</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`${hrefBase}/${c.id}`} className="font-semibold text-ink-50 hover:text-brand-300">{c.title}</Link>
                <p className="font-mono text-[11px] text-ink-400">{caseCode(c.code)}{c.isPublic ? " · na galeria" : ""}</p>
              </td>
              <td className="text-ink-200">{EXAM_LABEL[c.examType]}{c.bodyRegion && <span className="block text-xs text-ink-400">{c.bodyRegion}</span>}</td>
              {showPeople !== "doctor" && <td className="text-ink-200">{c.patient?.name ?? <span className="text-ink-500">—</span>}</td>}
              {showPeople !== "patient" && <td className="text-ink-200">{c.doctor?.name ?? <span className="text-ink-500">—</span>}</td>}
              {showOrg && <td className="text-ink-300">{c.organization?.name ?? <span className="text-ink-500">Direto DocDo</span>}</td>}
              <td><StatusBadge status={c.status} /></td>
              <td className="text-ink-300">{date(c.createdAt)}</td>
              <td className="text-right">
                <Link href={`${hrefBase}/${c.id}`} className="inline-grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-white/5 hover:text-ink-50" aria-label="Abrir">
                  <ChevronRight className="size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
