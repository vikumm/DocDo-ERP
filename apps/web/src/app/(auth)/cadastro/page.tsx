import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./form";

export const metadata: Metadata = { title: "Cadastro" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const { perfil } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-ink-50">Crie sua conta</h1>
      <p className="mt-2 text-sm text-ink-300">Em poucos minutos você envia seu primeiro exame.</p>
      <RegisterForm initialRole={perfil === "medico" ? "DOCTOR" : "PATIENT"} />
      <p className="mt-8 text-center text-sm text-ink-300">
        Já tem conta? <Link href="/entrar" className="font-semibold text-brand-400 hover:text-brand-300">Entrar</Link>
      </p>
    </>
  );
}
