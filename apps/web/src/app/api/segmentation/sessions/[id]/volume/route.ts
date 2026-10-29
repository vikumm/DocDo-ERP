import { proxyToApi } from "@/lib/proxy";

/** Upload do NIfTI em fluxo. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyToApi(req, `/segmentation/sessions/${encodeURIComponent((await params).id)}/volume`);
}

/** Download do volume em fluxo. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return proxyToApi(req, `/segmentation/sessions/${encodeURIComponent((await params).id)}/volume`);
}
