import { proxyToApi } from "@/lib/proxy";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyToApi(req, `/segmentation/sessions/${encodeURIComponent((await params).id)}/feedback`);
}
