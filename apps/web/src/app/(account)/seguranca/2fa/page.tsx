import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { TotpStatusDTO } from "@docdo/contracts";
import { api } from "@/lib/api";
import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/auth";
import { date } from "@/lib/format";
import { startTotpSetup } from "@/lib/actions/security";
import { EnabledPanel, SetupForm } from "./forms";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function TwoFactorPage() {
  // página de configuração: o admin entra aqui antes de ter o 2FA (não usa requireMe, que redirecionaria para cá)
  const me = await getMe();
  if (!me) redirect("/entrar");
  if (me.user.role !== "ADMIN") redirect(homeFor(me.user.role));
  // o segredo é gerado e cifrado na API; aqui só chega o QR do aparelho que está sendo configurado
  const st = await api<TotpStatusDTO>("/me/2fa");

  if (st.enabled)
    return (
      <>
        <ShieldCheck className="size-8 text-brand-400" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-50">2FA ativo</h1>
        <p className="mt-2 text-sm text-ink-300">
          Ativado em {date(st.enabledAt)} · {st.recoveryCodesLeft} código(s) de recuperação disponíveis.
        </p>
        <EnabledPanel />
        <Link href="/admin" className="btn-ghost mt-8 w-full">Voltar ao admin</Link>
      </>
    );

  if (!st.pending)
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight text-ink-50">Ative a verificação em duas etapas</h1>
        <p className="mt-2 text-sm text-ink-300">
          Contas de administrador acessam dados de todos os pacientes, por isso o DocDo exige um segundo fator. Você vai precisar de um aplicativo autenticador
          (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).
        </p>
        <form action={startTotpSetup} className="mt-8">
          <button className="btn-primary w-full py-3">Gerar QR code</button>
        </form>
      </>
    );

  const { secret, qrDataUrl: qr } = st;
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-ink-50">Escaneie o QR code</h1>
      <p className="mt-2 text-sm text-ink-300">Abra o aplicativo autenticador, adicione uma conta pelo QR code e digite o código de 6 dígitos que aparecer.</p>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no servidor */}
        <img src={qr} alt="QR code para o aplicativo autenticador" width={220} height={220} />
      </div>
      <p className="mt-3 text-center text-xs text-ink-400">
        Sem câmera? Digite a chave: <span className="font-mono text-ink-200 select-all">{secret.match(/.{1,4}/g)?.join(" ")}</span>
      </p>
      <SetupForm />
    </>
  );
}
