import { AuthShell } from "@/components/shell/auth-shell";

/** Links de e-mail e etapas de conta: abrem mesmo com outra sessão ativa no navegador. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
