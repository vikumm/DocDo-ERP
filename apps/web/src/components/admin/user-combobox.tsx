"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, Stethoscope, UserRound } from "lucide-react";
import clsx from "clsx";

export type PickedUser = { id: string; name: string; email: string; role: "DOCTOR" | "PATIENT"; crm?: string | null; specialty?: string | null };

/** Digite nome, e-mail, CRM ou CPF e escolha: "Joel Oliveira (joel@docdo.com.br)". */
export function UserCombobox({
  onPick,
  role,
  exclude = [],
  placeholder = "Digite o nome ou e-mail…",
  disabled,
}: {
  onPick: (u: PickedUser) => void;
  role?: "DOCTOR" | "PATIENT";
  exclude?: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PickedUser[]>([]);
  const [active, setActive] = useState(0);
  const excludeKey = exclude.join(",");

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, exclude: excludeKey });
        if (role) params.set("role", role);
        const res = await fetch(`/api/admin/users?${params}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults(data.users ?? []);
        setActive(0);
      } catch {
        /* requisição cancelada pela próxima digitação */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, role, excludeKey, open]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (u: PickedUser) => {
    onPick(u);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        value={q}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className="input pl-10"
      />
      {loading && <Loader2 className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-ink-400" />}
      {open && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-ink-950 p-1 shadow-xl shadow-black/10">
          {results.map((u, i) => {
            const Icon = u.role === "DOCTOR" ? Stethoscope : UserRound;
            return (
              <li
                key={u.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
                className={clsx("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", i === active && "bg-white/[0.06]")}
              >
                <Icon className={clsx("size-4 shrink-0", u.role === "DOCTOR" ? "text-brand-400" : "text-sky-300")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-50">
                    {u.name} <span className="text-ink-400">({u.email})</span>
                  </p>
                  <p className="truncate text-[11px] text-ink-400">
                    {u.role === "DOCTOR" ? ["Médico", u.crm, u.specialty].filter(Boolean).join(" · ") : "Paciente"}
                  </p>
                </div>
              </li>
            );
          })}
          {!loading && results.length === 0 && <li className="px-3 py-2.5 text-sm text-ink-400">{q ? `Ninguém encontrado para “${q}”.` : "Nenhum usuário disponível."}</li>}
        </ul>
      )}
    </div>
  );
}
