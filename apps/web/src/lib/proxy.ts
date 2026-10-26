import "server-only";
import { apiFetch } from "./api";

const PASS_RESPONSE = ["content-type", "content-length", "content-disposition", "cache-control"];

/**
 * Repassa uma requisição do navegador para a API sem ler o corpo (uploads e downloads em streaming).
 * Só cabeçalhos conhecidos passam adiante; a resposta ganha nosniff.
 */
export async function proxyToApi(req: Request, apiPath: string) {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const headers: Record<string, string> = {};
  if (hasBody) {
    const ct = req.headers.get("content-type");
    const len = req.headers.get("content-length");
    if (ct) headers["content-type"] = ct;
    if (len) headers["content-length"] = len;
  }
  const res = await apiFetch(apiPath, { method: req.method, headers, ...(hasBody ? { body: req.body, duplex: "half" } : {}) });
  const out = new Headers({ "X-Content-Type-Options": "nosniff" });
  for (const h of PASS_RESPONSE) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers: out });
}
