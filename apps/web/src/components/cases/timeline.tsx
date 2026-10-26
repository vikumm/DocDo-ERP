import type { EventDTO } from "@docdo/contracts";
import { dateTime } from "@/lib/format";

export function Timeline({ events }: { events: EventDTO[] }) {
  if (!events.length) return <p className="text-sm text-ink-400">Sem eventos.</p>;
  return (
    <ol className="relative space-y-4 border-l border-white/10 pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-brand-500 ring-4 ring-ink-850" />
          <p className="text-sm text-ink-100">{e.message}</p>
          <p className="text-xs text-ink-400">
            {dateTime(e.createdAt)}
            {e.user && ` · ${e.user.name}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
