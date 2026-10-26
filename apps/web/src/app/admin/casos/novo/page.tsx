import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { AdminCaseForm } from "../case-form";

export const metadata: Metadata = { title: "Novo caso" };

export default async function AdminNewCase() {
  return (
    <>
      <PageHeader title="Novo caso" subtitle="Crie um caso em nome de um médico ou paciente (ex.: exame recebido por outro canal)." />
      <div className="card max-w-3xl p-6">
        <AdminCaseForm />
      </div>
    </>
  );
}
