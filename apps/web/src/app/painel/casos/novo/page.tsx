import type { Metadata } from "next";
import { requireMe } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { NewCaseForm } from "./form";

export const metadata: Metadata = { title: "Enviar exame" };

export default async function NewCasePage() {
  const me = await requireMe(["DOCTOR", "PATIENT", "SECRETARY"]);
  const role = me.user.role as "DOCTOR" | "PATIENT" | "SECRETARY";
  return (
    <>
      <PageHeader
        title="Enviar exame"
        subtitle={
          role === "SECRETARY"
            ? `O caso fica em ${me.currentOrg?.organizationName ?? "sua clínica"}, em nome do médico titular. Na próxima tela você envia os arquivos DICOM.`
            : "Crie o caso. Na próxima tela você envia os arquivos DICOM."
        }
      />
      {me.pendingDoctor ? (
        <p className="card p-6 text-sm text-ink-300">Você poderá criar casos assim que a equipe DocDo aprovar seu cadastro de médico.</p>
      ) : (
        <NewCaseForm role={role} />
      )}
    </>
  );
}
