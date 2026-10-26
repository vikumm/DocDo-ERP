import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/auth";
import { AuthShell } from "@/components/shell/auth-shell";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // valida na API: um cookie de sessão revogada/desativada não pode redirecionar (evita loop com /painel)
  const me = await getMe();
  if (me) redirect(homeFor(me.user.role));
  return <AuthShell>{children}</AuthShell>;
}
