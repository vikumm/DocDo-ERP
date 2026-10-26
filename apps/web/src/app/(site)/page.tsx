import Link from "next/link";
import {
  ArrowRight,
  Box,
  Check,
  CloudUpload,
  CreditCard,
  Glasses,
  HeartPulse,
  Layers,
  Lock,
  MonitorSmartphone,
  Ruler,
  Scissors,
  Stethoscope,
  UserRound,
  Wand2,
} from "lucide-react";
import type { FeaturedDTO, GalleryCaseDTO } from "@docdo/contracts";
import { api } from "@/lib/api";
import { PLANS } from "@/lib/constants";
import { brl } from "@/lib/format";
import { HeroViewer } from "@/components/site/hero-viewer";
import { CaseCard } from "@/components/site/case-card";
import { ContactForm } from "@/components/site/contact-form";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [featured, all] = await Promise.all([api<FeaturedDTO>("/public/featured"), api<GalleryCaseDTO[]>("/public/gallery")]);
  const gallery = all.slice(0, 3);
  const highlight = featured?.models.find((m) => m.volumeMl && /tum|les/i.test(m.name)) ?? featured?.models.find((m) => m.volumeMl);

  return (
    <>
      {/* ───────── hero ───────── */}
      <section className="relative overflow-hidden pt-16">
        <div className="only-dark absolute inset-0 -z-10 bg-[url(/brand/hero-bg.jpg)] bg-cover bg-center opacity-40" />
        <div className="only-light absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_75%_40%,color-mix(in_oklab,var(--color-brand-500)_14%,transparent),transparent_70%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-900/30 via-ink-900/70 to-ink-900" />
        <div className="absolute top-1/3 right-[10%] -z-10 size-[520px] rounded-full bg-brand-500/15 blur-[120px]" />

        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:py-10">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-400" /> DocDo v5 · visualizador 3D renovado
            </span>
            <h1 className="mt-6 text-4xl leading-[1.05] font-extrabold tracking-tight text-ink-50 sm:text-5xl lg:text-6xl">
              Veja seus exames de imagem por <span className="text-gradient">outro ângulo</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
              Transformamos tomografias e ressonâncias em modelos 3D interativos. Órgãos, vasos e lesões viram objetos que o médico gira, corta e mede — no computador, tablet ou celular.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/cadastro" className="btn-primary px-5 py-3 text-base">
                Enviar meu exame <ArrowRight className="size-4" />
              </Link>
              <Link href={featured ? `/visualizador/${featured.id}` : "/galeria"} className="btn-ghost px-5 py-3 text-base">
                <Box className="size-4" /> Explorar um caso em 3D
              </Link>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/[0.06] pt-6">
              {[
                ["2015", "criado por médicos e engenheiros"],
                ["2017", "pioneiro em cirurgia com HoloLens"],
                ["100%", "dados anonimizados"],
              ].map(([v, l]) => (
                <div key={v}>
                  <dt className="text-2xl font-bold text-ink-50">{v}</dt>
                  <dd className="mt-1 text-xs leading-snug text-ink-300">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative h-[420px] sm:h-[520px] lg:h-[640px]">
            <div className="absolute inset-6 rounded-[2.5rem] border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent" />
            {featured && <HeroViewer models={featured.models} />}
            {highlight && (
              <div className="pointer-events-none absolute top-10 left-2 hidden animate-float rounded-2xl bg-ink-950/70 px-3 py-2 ring-1 ring-white/10 backdrop-blur sm:block">
                <p className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase">{highlight.name} · volume</p>
                <p className="flex items-center gap-1.5 font-mono text-sm font-semibold text-ink-50">
                  <span className="size-2 rounded-full" style={{ background: highlight.color }} />
                  {highlight.volumeMl!.toLocaleString("pt-BR")} ml
                </p>
              </div>
            )}
            <div className="pointer-events-none absolute right-2 bottom-16 hidden animate-float rounded-2xl bg-ink-950/70 px-3 py-2 ring-1 ring-white/10 backdrop-blur [animation-delay:-4s] sm:block">
              <p className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase">Estruturas segmentadas</p>
              <p className="mt-1 flex gap-1.5">
                {featured?.models.map((m) => (
                  <span key={m.id} title={m.name} className="size-3 rounded-full" style={{ background: m.color }} />
                ))}
              </p>
            </div>
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-ink-400">Arraste para girar · caso real anonimizado</p>
          </div>
        </div>
      </section>

      {/* ───────── soluções ───────── */}
      <section id="solucoes" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-400">Ágil e resolutivo</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">A anatomia cirúrgica, clara antes da primeira incisão</h2>
            <p className="mt-4 text-ink-300">
              O DocDo oferece mobilidade multiplataforma para auxiliar médicos no planejamento de cirurgias de alta complexidade. Exames convencionais como TC ou RM viram um ambiente 3D, com toda a segurança dos dados.
            </p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              { icon: Stethoscope, title: "Planejamento cirúrgico", text: "Relação exata entre tumor, vasos e órgãos. Meça distâncias, calcule volumes e simule cortes anatômicos." },
              { icon: HeartPulse, title: "Paciente que entende", text: "Mostre o caso em 3D na consulta. O paciente acessa o próprio modelo pelo celular e compartilha com a família." },
              { icon: Lock, title: "Segurança de dados", text: "DICOM armazenado com acesso restrito ao médico e ao paciente. Casos na galeria são sempre anonimizados." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="card p-6 transition hover:border-brand-500/25">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-ink-50">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{text}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Layers, label: "Camadas por estrutura", text: "Cor, opacidade, isolar e focar" },
              { icon: Scissors, label: "Corte anatômico", text: "Planos axial, coronal e sagital" },
              { icon: Ruler, label: "Medição em mm", text: "Distâncias direto no modelo" },
              { icon: MonitorSmartphone, label: "Qualquer tela", text: "Navegador, tablet e celular" },
            ].map(({ icon: Icon, label, text }) => (
              <div key={label} className="flex items-start gap-3 rounded-2xl border border-white/[0.05] p-4">
                <Icon className="mt-0.5 size-5 shrink-0 text-brand-400" />
                <div>
                  <p className="text-sm font-semibold text-ink-50">{label}</p>
                  <p className="text-xs text-ink-400">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── como funciona ───────── */}
      <section id="como-funciona" className="scroll-mt-20 border-y border-white/[0.05] bg-ink-950/60 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-brand-400">Como funciona</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">Do DICOM ao 3D em quatro passos</h2>
          </div>
          <ol className="mt-14 grid gap-4 md:grid-cols-4">
            {[
              { icon: CloudUpload, t: "Envie o exame", d: "Médico ou paciente cria o caso e faz upload dos arquivos DICOM (ou .zip do CD)." },
              { icon: CreditCard, t: "Escolha o plano", d: "Rim unilateral ou bilateral (os dois rins). Pagamento por Pix, cartão ou boleto." },
              { icon: Wand2, t: "Reconstrução", d: "Nossa equipe segmenta cada estrutura e associa os modelos 3D ao seu caso." },
              { icon: Glasses, t: "Visualize", d: "O 3D aparece no painel do médico e do paciente. Gire, corte, meça e compartilhe." },
            ].map(({ icon: Icon, t, d }, i) => (
              <li key={t} className="relative card p-6">
                <span className="font-mono text-xs font-semibold text-ink-500">0{i + 1}</span>
                <Icon className="mt-4 size-6 text-brand-400" />
                <h3 className="mt-4 font-semibold text-ink-50">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{d}</p>
                {i < 3 && <ArrowRight className="absolute top-1/2 -right-3.5 z-10 hidden size-5 -translate-y-1/2 text-ink-500 md:block" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────── galeria ───────── */}
      <section id="galeria" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-400">Galeria de casos</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">Explore casos reais já reconstruídos</h2>
              <p className="mt-3 text-ink-300">Casos anonimizados, publicados com autorização, para você ver o resultado antes de enviar o seu.</p>
            </div>
            <Link href="/galeria" className="btn-ghost shrink-0">Ver galeria completa <ArrowRight className="size-4" /></Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((c) => (
              <CaseCard key={c.id} c={c} href={`/visualizador/${c.id}`} />
            ))}
            {gallery.length === 0 && <p className="text-sm text-ink-400">Em breve, novos casos publicados.</p>}
          </div>
        </div>
      </section>

      {/* ───────── para quem ───────── */}
      <section className="pb-24">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-2">
          {[
            {
              icon: Stethoscope,
              who: "Para médicos",
              title: "Planeje com o 3D do seu paciente",
              items: ["Crie casos e envie o DICOM direto do painel", "Compartilhe com colegas da equipe cirúrgica", "Ferramentas de corte, medição e volumetria", "Histórico de todos os seus casos"],
              href: "/cadastro?perfil=medico",
              cta: "Cadastrar como médico",
            },
            {
              icon: UserRound,
              who: "Para pacientes",
              title: "Entenda o seu exame de verdade",
              items: ["Envie seu exame e vincule seu médico", "Acompanhe cada etapa da reconstrução", "Veja seu 3D pelo celular, quando quiser", "Compartilhe com quem você confia"],
              href: "/cadastro",
              cta: "Cadastrar como paciente",
            },
          ].map(({ icon: Icon, who, title, items, href, cta }) => (
            <div key={who} className="card relative overflow-hidden p-8">
              <div className="absolute -top-20 -right-20 size-60 rounded-full bg-brand-500/10 blur-3xl" />
              <Icon className="size-7 text-brand-400" />
              <p className="mt-5 text-sm font-semibold text-brand-400">{who}</p>
              <h3 className="mt-1 text-2xl font-bold text-ink-50">{title}</h3>
              <ul className="mt-6 space-y-3">
                {items.map((it) => (
                  <li key={it} className="flex gap-3 text-sm text-ink-200">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-400" /> {it}
                  </li>
                ))}
              </ul>
              <Link href={href} className="btn-ghost mt-8">{cta} <ArrowRight className="size-4" /></Link>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── planos ───────── */}
      <section id="planos" className="scroll-mt-20 border-y border-white/[0.05] bg-ink-950/60 py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-brand-400">Planos</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">Pague por caso, sem mensalidade</h2>
            <p className="mt-3 text-ink-300">Clínicas e hospitais com volume mensal: fale com a gente.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {(Object.entries(PLANS) as [keyof typeof PLANS, (typeof PLANS)[keyof typeof PLANS]][]).map(([key, p]) => {
              const hot = key === "BILATERAL";
              return (
                <div key={key} className={`card relative p-8 ${hot ? "border-brand-500/40 bg-gradient-to-b from-brand-500/[0.08] to-transparent" : ""}`}>
                  <p className="text-lg font-semibold text-ink-50">{p.name}</p>
                  <p className="mt-1 text-sm text-ink-300">{p.description}</p>
                  <p className="mt-6 text-4xl font-extrabold tracking-tight text-ink-50">
                    {brl(p.price)}
                    <span className="text-base font-medium text-ink-400"> /caso</span>
                  </p>
                  <ul className="mt-6 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-3 text-sm text-ink-200">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand-400" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/cadastro" className={`${hot ? "btn-primary" : "btn-ghost"} mt-8 w-full`}>Começar agora</Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── empresa ───────── */}
      <section id="empresa" className="scroll-mt-20 py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-brand-400">A Empresa</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">Feito por médicos e programadores, desde 2015</h2>
            <p className="mt-5 leading-relaxed text-ink-300">
              O DocDo foi criado em 2015 pela InfiniBrains, unindo médicos e engenheiros de software. Ao longo dessa caminhada, esteve presente em congressos médicos no mundo todo e ganhou destaque nacional como startup inovadora.
            </p>
            <p className="mt-4 leading-relaxed text-ink-300">
              Em 2017, o DocDo foi um dos pioneiros a levar esse ambiente 3D para os óculos de realidade aumentada Microsoft HoloLens, usado pela primeira vez no auxílio intraoperatório de uma cirurgia minimamente invasiva de câncer renal.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl ring-1 ring-white/[0.08]">
            <iframe
              className="aspect-video w-full"
              src="https://www.youtube-nocookie.com/embed/U9tHxlLQfQ4"
              title="DocDo — cirurgia com HoloLens"
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ───────── contato ───────── */}
      <section id="contato" className="scroll-mt-20 pb-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="text-sm font-semibold text-brand-400">Contato</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">Fale com a equipe DocDo</h2>
            <p className="mt-4 text-ink-300">Estamos à disposição. Respondemos em até 24h, exceto feriados e fins de semana.</p>
          </div>
          <ContactForm />
        </div>
      </section>
    </>
  );
}
