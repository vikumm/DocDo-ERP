"use client";
import { useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { removeMember } from "@/lib/actions/org";

export function RemoveMember({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => confirm(`Remover o acesso de ${name} à clínica?`) && start(async () => void (await removeMember(userId)))}
      disabled={pending}
      className="rounded-lg p-1.5 text-ink-400 hover:bg-red-500/10 hover:text-red-300"
      aria-label={`Remover ${name}`}
      title="Remover acesso"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
    </button>
  );
}
