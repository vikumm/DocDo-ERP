import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-ink-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-300">
            Exames de imagem transformados em modelos 3D interativos para planejamento cirúrgico e comunicação com o paciente. Desde 2015.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wider text-ink-400 uppercase">Produto</p>
          <ul className="mt-4 space-y-2 text-sm text-ink-200">
            <li><Link href="/galeria" className="hover:text-brand-300">Galeria de casos 3D</Link></li>
            <li><Link href="/#planos" className="hover:text-brand-300">Planos</Link></li>
            <li><Link href="/cadastro?perfil=medico" className="hover:text-brand-300">Sou médico</Link></li>
            <li><Link href="/cadastro" className="hover:text-brand-300">Sou paciente</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wider text-ink-400 uppercase">Empresa</p>
          <ul className="mt-4 space-y-2 text-sm text-ink-200">
            <li><Link href="/#empresa" className="hover:text-brand-300">Sobre o DocDo</Link></li>
            <li><Link href="/#contato" className="hover:text-brand-300">Contato</Link></li>
            <li><Link href="/entrar" className="hover:text-brand-300">Acessar painel</Link></li>
            <li><Link href="/privacidade" className="hover:text-brand-300">Política de Privacidade</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.04] py-6 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} DocDo · InfiniBrains. Todos os direitos reservados.
      </div>
    </footer>
  );
}
