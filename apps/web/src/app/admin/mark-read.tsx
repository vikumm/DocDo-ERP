"use client";
import { Check } from "lucide-react";
import { markMessageRead } from "@/lib/actions/admin";

export function MarkReadButton({ id }: { id: string }) {
  return (
    <button onClick={() => markMessageRead(id)} title="Marcar como lida" className="h-fit rounded-lg p-1.5 text-ink-400 hover:bg-white/5 hover:text-brand-300">
      <Check className="size-4" />
    </button>
  );
}
