import { proxyToApi } from "@/lib/proxy";

/** Autocomplete do admin (a API exige admin com 2FA). */
export async function GET(req: Request) {
  const qs = new URL(req.url).search;
  return proxyToApi(req, `/admin/users/search${qs}`);
}
