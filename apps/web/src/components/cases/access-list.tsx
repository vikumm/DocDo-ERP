import type { AccessLogDTO } from "@docdo/contracts";
import { ACCESS_LABEL, ROLE_LABEL } from "@/lib/constants";
import { dateTime } from "@/lib/format";

/** LGPD: transparência sobre quem abriu ou baixou o exame. */
export function AccessList({ logs, showIp = false }: { logs: AccessLogDTO[]; showIp?: boolean }) {
  if (!logs.length) return <p className="text-sm text-ink-400">Nenhum acesso registrado ainda.</p>;
  return (
    <ul className="space-y-3">
      {logs.map((l) => (
        <li key={l.id} className="text-sm">
          <p className="text-ink-100">
            <span className="font-medium">{l.user?.name ?? "Visitante"}</span>
            {l.user && <span className="text-ink-400"> ({ROLE_LABEL[l.user.role].toLowerCase()})</span>} {ACCESS_LABEL[l.action]}
          </p>
          <p className="text-xs text-ink-400">
            {dateTime(l.createdAt)}
            {l.detail ? ` · ${l.detail}` : ""}
            {showIp && l.ip ? ` · IP ${l.ip}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
