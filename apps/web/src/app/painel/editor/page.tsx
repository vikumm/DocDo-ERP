import type { Metadata } from "next";
import type { CaseListDTO } from "@docdo/contracts";
import { api } from "@/lib/api";
import { requireMe } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { EditorClient } from "./client";

export const metadata: Metadata = { title: "Editor" };

export default async function EditorPage() {
  await requireMe(["DOCTOR", "PATIENT", "SECRETARY"]);
  const { cases } = await api<CaseListDTO>("/cases");
  return (
    <>
      <PageHeader title="Editor" subtitle="Envie os arquivos do exame (DICOM, .zip ou NIfTI) para segmentar e visualizar em 3D." />
      <EditorClient
        cases={cases.map((c) => ({ id: c.id, title: c.title, code: c.code }))}
      />
    </>
  );
}
