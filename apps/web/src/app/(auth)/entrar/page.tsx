import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; senha?: string }> }) {
  const { next, senha } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-ink-50">Bem-vindo de volta</h1>
      <p className="mt-2 text-sm text-ink-300">Acesse seus casos e o visualizador 3D.</p>
      <LoginForm next={next} notice={senha ? "Senha definida. Entre com seu e-mail e a nova senha." : undefined} />
      <p className="mt-8 text-center text-sm text-ink-300">
        Ainda não tem conta? <Link href="/cadastro" className="font-semibold text-brand-400 hover:text-brand-300">Cadastre-se</Link>
      </p>
    </>
  );
}
