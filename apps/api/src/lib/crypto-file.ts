import { createCipheriv, createDecipheriv, randomBytes, type CipherGCM, type DecipherGCM } from "node:crypto";

/**
 * Arquivos cifrados com AES-256-GCM: [MAGIC 4][IV 12][conteúdo cifrado][TAG 16].
 * A tag fica no fim para permitir cifrar em streaming; na leitura ela é lida primeiro (o arquivo está em disco).
 * Sem "server-only" de propósito: o seed (tsx) também usa.
 */
export const MAGIC = Buffer.from("DDE1");
export const HEADER_BYTES = MAGIC.length + 12;
export const TAG_BYTES = 16;

export function storageKey(): Buffer {
  const hex = process.env.STORAGE_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("STORAGE_KEY ausente ou inválida: gere com `openssl rand -hex 32`.");
  return Buffer.from(hex, "hex");
}

export function newCipher(): { header: Buffer; cipher: CipherGCM } {
  const iv = randomBytes(12);
  return { header: Buffer.concat([MAGIC, iv]), cipher: createCipheriv("aes-256-gcm", storageKey(), iv) };
}

export function decipherFor(header: Buffer, tag: Buffer): DecipherGCM {
  const d = createDecipheriv("aes-256-gcm", storageKey(), header.subarray(MAGIC.length, HEADER_BYTES));
  d.setAuthTag(tag);
  return d;
}

export const isEncrypted = (head: Buffer) => head.length >= MAGIC.length && head.subarray(0, MAGIC.length).equals(MAGIC);

export function encryptBuffer(plain: Buffer) {
  const { header, cipher } = newCipher();
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

export function decryptBuffer(buf: Buffer) {
  if (!isEncrypted(buf)) return buf; // arquivos anteriores à criptografia
  const d = decipherFor(buf.subarray(0, HEADER_BYTES), buf.subarray(buf.length - TAG_BYTES));
  return Buffer.concat([d.update(buf.subarray(HEADER_BYTES, buf.length - TAG_BYTES)), d.final()]);
}

/** Segredos curtos (ex.: TOTP) guardados no banco. */
export const encryptString = (s: string) => encryptBuffer(Buffer.from(s, "utf8")).toString("base64");
export const decryptString = (s: string) => decryptBuffer(Buffer.from(s, "base64")).toString("utf8");
