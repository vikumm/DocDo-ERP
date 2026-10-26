"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { UserCombobox, type PickedUser } from "./user-combobox";

type Selected = Pick<PickedUser, "id" | "name" | "email">;

/** Campo de formulário: escolhe um usuário pela busca e envia o id num input oculto. */
export function UserPickerField({ name, label, role, initial }: { name: string; label: string; role: "DOCTOR" | "PATIENT"; initial: Selected | null }) {
  const [sel, setSel] = useState<Selected | null>(initial);
  return (
    <div>
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={sel?.id ?? ""} />
      {sel ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-ink-950/60 px-3 py-2">
          <Avatar name={sel.name} className="size-7 text-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink-50">{sel.name}</p>
            <p className="truncate text-[11px] text-ink-400">{sel.email}</p>
          </div>
          <button type="button" onClick={() => setSel(null)} className="rounded-lg p-1 text-ink-400 hover:text-red-300" aria-label={`Remover ${label.toLowerCase()}`}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <UserCombobox role={role} onPick={(u) => setSel(u)} placeholder={role === "DOCTOR" ? "Buscar médico…" : "Buscar paciente…"} />
      )}
    </div>
  );
}
