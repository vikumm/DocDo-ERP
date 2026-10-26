"use client";
import { useTransition } from "react";
import { toggleUserActive } from "@/lib/actions/admin";

export function ToggleActive({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(() => toggleUserActive(id))} disabled={pending} className={`rounded-lg px-2 py-1 text-xs font-semibold ${active ? "text-red-300 hover:bg-red-500/10" : "text-brand-300 hover:bg-brand-500/10"}`}>
      {active ? "Desativar" : "Ativar"}
    </button>
  );
}
