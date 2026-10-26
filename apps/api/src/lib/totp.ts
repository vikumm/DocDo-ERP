import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "../common/db";

// TOTP (RFC 6238): HMAC-SHA1, 6 dígitos, passo de 30 s — compatível com Google Authenticator, 1Password, Authy etc.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string) {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("base32 inválido");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, "0");
}

export const otpauthUri = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`DocDo:${email}`)}?secret=${secret}&issuer=DocDo&algorithm=SHA1&digits=6&period=30`;

/**
 * Aceita o passo atual e o vizinho (relógio desalinhado em até 30 s) e recusa reutilizar um código já aceito.
 * O último passo aceito fica na tabela RateLimit (chave totp:last:<usuário>).
 */
export async function verifyTotp(userId: string, secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Math.floor(Date.now() / 30_000);
  const key = `totp:last:${userId}`;
  const last = (await db.rateLimit.findUnique({ where: { key } }))?.count ?? 0;
  for (const step of [now - 1, now, now + 1]) {
    if (step <= last) continue;
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(code))) {
      await db.rateLimit.upsert({ where: { key }, create: { key, count: step, resetAt: new Date("2100-01-01") }, update: { count: step } });
      return true;
    }
  }
  return false;
}

// códigos de recuperação: 8 códigos de uso único, guardados em SHA-256
export const hashRecovery = (c: string) => createHash("sha256").update(c.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
export function newRecoveryCodes() {
  return Array.from({ length: 8 }, () => {
    const raw = base32Encode(randomBytes(6)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
