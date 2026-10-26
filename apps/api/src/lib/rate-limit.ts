import { db } from "../common/db";
import { ctx } from "../common/context";
import { tooMany } from "../common/http";

/**
 * Janela fixa guardada no Postgres: vale para todas as instâncias da API.
 * Uma única instrução atômica incrementa (ou reinicia a janela vencida) e devolve a contagem.
 */
export async function hit(key: string, limit: number, windowMs: number): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const resetAt = new Date(Date.now() + windowMs);
  const [row] = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" < NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < NOW() THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  if (Math.random() < 0.01) await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
  return row.count > limit ? { ok: false, retryAfter: Math.ceil((new Date(row.resetAt).getTime() - Date.now()) / 1000) } : { ok: true };
}

/** Como hit, mas já responde 429 quando estoura. */
export async function limit(key: string, max: number, windowMs: number) {
  const r = await hit(key, max, windowMs);
  if (!r.ok) tooMany(r.retryAfter);
}

export async function clear(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}

/** IP repassado pelo front (só aceito com a chave interna válida); null quando não há proxy confiável. */
export const clientIp = () => ctx().clientIp;

/** Limite por IP quando ele é conhecido. */
export async function limitIp(scope: string, max: number, windowMs: number) {
  const ip = clientIp();
  if (ip) await limit(`${scope}:ip:${ip}`, max, windowMs);
}

/** Teto global generoso (protege mesmo sem IP) + limite por IP. */
export async function limitIpOrGlobal(scope: string, perIp: number, global: number, windowMs: number) {
  await limit(`${scope}:global`, global, windowMs);
  await limitIp(scope, perIp, windowMs);
}
