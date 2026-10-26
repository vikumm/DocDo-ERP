import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/** Moldura das telas de conta (login, cadastro, links de e-mail). */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </div>
      <div data-theme="dark" className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[url(/brand/hero-bg.jpg)] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-tr from-ink-950 via-ink-900/70 to-brand-700/30" />
        <div className="absolute inset-x-12 bottom-12">
          <p className="text-3xl leading-tight font-bold text-ink-50">“Ver a relação do tumor com os vasos em 3D muda a conversa com a equipe e com o paciente.”</p>
          <p className="mt-4 text-sm text-ink-300">Planejamento cirúrgico com DocDo</p>
        </div>
      </div>
    </div>
  );
}
