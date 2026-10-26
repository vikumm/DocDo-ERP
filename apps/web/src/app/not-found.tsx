import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <Logo className="mx-auto" />
        <p className="mt-10 font-mono text-sm text-brand-400">404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink-50">Página não encontrada</h1>
        <p className="mt-2 text-sm text-ink-300">O caso ou página que você procura não existe ou você não tem acesso.</p>
        <Link href="/" className="btn-primary mt-8">Voltar ao início</Link>
      </div>
    </div>
  );
}
