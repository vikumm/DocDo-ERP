import type { Metadata } from "next";
import { UsersPage } from "@/components/admin/users-page";

export const metadata: Metadata = { title: "Pacientes" };

export default async function Patients({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <UsersPage role="PATIENT" q={(await searchParams).q ?? ""} />;
}
