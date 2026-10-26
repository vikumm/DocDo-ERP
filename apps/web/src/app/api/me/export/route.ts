import { proxyToApi } from "@/lib/proxy";

/** LGPD: cópia dos dados do titular (gerada pela API). */
export async function GET(req: Request) {
  return proxyToApi(req, "/me/export");
}
