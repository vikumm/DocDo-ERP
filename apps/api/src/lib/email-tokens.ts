import { createHash, randomBytes } from "node:crypto";
import type { EmailTokenPurpose, Prisma } from "@prisma/client";
import { db } from "../common/db";

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

export const TTL = { VERIFY: 24 * 3600_000, RESET: 3600_000, INVITE: 7 * 24 * 3600_000 } as const;

/** Emite um token de uso único (só o hash vai para o banco) e invalida os anteriores do mesmo tipo. */
export async function issueToken(userId: string, purpose: EmailTokenPurpose, data?: Prisma.InputJsonValue) {
  const token = randomBytes(32).toString("base64url");
  await db.emailToken.deleteMany({ where: { userId, purpose, usedAt: null } });
  await db.emailToken.create({ data: { userId, purpose, tokenHash: sha256(token), data, expiresAt: new Date(Date.now() + TTL[purpose]) } });
  return token;
}

/** Consulta sem consumir (para montar a página do link). */
export async function peekToken(token: string, purposes: EmailTokenPurpose[]) {
  if (!token || token.length > 100) return null;
  const row = await db.emailToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !purposes.includes(row.purpose) || !row.user.active) return null;
  return row;
}

/** Consome de forma atômica: dois cliques simultâneos não usam o mesmo token duas vezes. */
export async function consumeToken(token: string, purposes: EmailTokenPurpose[]) {
  const row = await peekToken(token, purposes);
  if (!row) return null;
  const { count } = await db.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1 ? row : null;
}
