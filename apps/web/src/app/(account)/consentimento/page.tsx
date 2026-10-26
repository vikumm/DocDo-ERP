import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/auth";
import { acceptConsent } from "@/lib/actions/privacy";
import { ActionForm } from "@/components/ui/action-form";
import { ConsentField } from "@/components/ui/consent-field";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default async function ConsentPage() {
  const me = await getMe();
  if (!me) redirect("/entrar");
  if (me.user.consentAt || me.user.role === "ADMIN") redirect(homeFor(me.user.role));
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-ink-50">Atualizamos nossa política</h1>
      <p className="mt-2 text-sm text-ink-300">Para continuar usando o DocDo, precisamos do seu aceite para o tratamento dos seus dados, incluindo dados de saúde dos exames.</p>
      <ActionForm action={acceptConsent} submit="Aceitar e continuar">
        <ConsentField />
      </ActionForm>
    </>
  );
}
