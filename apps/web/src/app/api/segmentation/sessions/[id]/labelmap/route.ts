import { proxyToApi } from "@/lib/proxy";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyToApi(req, `/segmentation/sessions/${encodeURIComponent((await params).id)}/labelmap`);
}
