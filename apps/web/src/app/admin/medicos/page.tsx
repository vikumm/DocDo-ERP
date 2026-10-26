import type { Metadata } from "next";
import { UsersPage } from "@/components/admin/users-page";

export const metadata: Metadata = { title: "Médicos" };

export default async function Doctors({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <UsersPage role="DOCTOR" q={(await searchParams).q ?? ""} />;
}
