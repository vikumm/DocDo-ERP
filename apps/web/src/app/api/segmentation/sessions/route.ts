import { proxyToApi } from "@/lib/proxy";

/** Cria sessão no serviço de segmentação (via API Nest). */
export async function POST(req: Request) {
  return proxyToApi(req, "/segmentation/sessions");
}
