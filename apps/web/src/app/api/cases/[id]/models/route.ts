import { proxyToApi } from "@/lib/proxy";

/** Modelos 3D reconstruídos (só admin; a API confere). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyToApi(req, `/admin/cases/${encodeURIComponent((await params).id)}/models`);
}
