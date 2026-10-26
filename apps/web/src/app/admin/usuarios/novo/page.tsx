import type { Metadata } from "next";
import type { Role } from "@docdo/contracts";
import { PageHeader } from "@/components/ui/misc";
import { UserForm } from "@/components/admin/user-form";

export const metadata: Metadata = { title: "Novo usuário" };

export default async function NewUser({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const r: Role = role === "DOCTOR" || role === "ADMIN" ? role : "PATIENT";
  return (
    <>
      <PageHeader title="Novo usuário" />
      <UserForm id={null} values={{ name: "", email: "", role: r, phone: "", cpf: "", crm: "", specialty: "", institution: "", active: true }} />
    </>
  );
}
