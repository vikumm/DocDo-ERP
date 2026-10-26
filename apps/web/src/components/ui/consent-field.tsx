import Link from "next/link";

export function ConsentField() {
  return (
    <label className="flex items-start gap-3 text-sm text-ink-200">
      <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-brand-500" />
      <span>
        Li e aceito a{" "}
        <Link href="/privacidade" target="_blank" className="font-semibold text-brand-400 underline-offset-2 hover:underline">
          Política de Privacidade
        </Link>{" "}
        e autorizo o tratamento dos meus dados, inclusive dados de saúde dos exames, para a reconstrução 3D.
      </span>
    </label>
  );
}
