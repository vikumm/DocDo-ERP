import { proxyToApi } from "@/lib/proxy";

/** Upload de DICOM: o fluxo vai direto para a API (que valida, cifra e grava). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyToApi(req, `/cases/${encodeURIComponent((await params).id)}/dicom`);
}
