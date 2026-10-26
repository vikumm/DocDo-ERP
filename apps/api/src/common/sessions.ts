import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { asSystem } from "./context";
import { sha256 } from "./auth";
import { clientIp } from "../lib/rate-limit";

export const SESSION_TTL_MS = 7 * 24 * 3600_000;

/** Token opaco de 32 bytes; só o SHA-256 vai para o banco. O front o guarda num cookie httpOnly. */
export function createSession(userId: string, userAgent?: string) {
  return asSystem(async () => {
    const token = randomBytes(32).toString("base64url");
    await db.session.create({
      data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS), ip: clientIp(), userAgent: userAgent?.slice(0, 300) || null },
    });
    return token;
  });
}

/** Derruba as sessões do usuário (opcionalmente mantendo uma). */
export const revokeSessions = (userId: string, keepSessionId?: string) =>
  asSystem(() => db.session.deleteMany({ where: { userId, ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}) } }));

// ───── desafio do 2FA: senha conferida, falta o código. Assinado com AUTH_SECRET, vale 5 minutos ─────

const secret = () => {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 32) throw new Error("AUTH_SECRET ausente");
  return s;
};

export function sign2faChallenge(userId: string) {
  const body = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 5 * 60_000, p: "2fa" })).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

export function verify2faChallenge(token: string): string | null {
  const [body, mac] = String(token).split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(createHmac("sha256", secret()).update(body).digest("base64url"));
  const got = Buffer.from(mac);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p.p === "2fa" && typeof p.sub === "string" && p.exp > Date.now() ? p.sub : null;
  } catch {
    return null;
  }
}
