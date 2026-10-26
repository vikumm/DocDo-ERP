import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { decipherFor, decryptBuffer, encryptBuffer, HEADER_BYTES, isEncrypted, newCipher, TAG_BYTES } from "./crypto-file";

const ROOT = path.resolve(process.env.STORAGE_DIR ?? "./storage");

function resolveKey(key: string) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Chave de armazenamento inválida");
  return full;
}

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120) || "arquivo";
}

async function newKey(folder: string, name: string) {
  const key = path.posix.join(folder, `${randomUUID()}-${safeName(name)}`);
  await fs.mkdir(path.dirname(resolveKey(key)), { recursive: true });
  return key;
}

/** Grava um buffer cifrado. */
export async function saveBuffer(folder: string, name: string, data: Buffer) {
  const key = await newKey(folder, name);
  await fs.writeFile(resolveKey(key), encryptBuffer(data));
  return key;
}

/**
 * Grava um stream cifrando em fluxo, sem segurar o arquivo em memória.
 * `onHead` recebe os primeiros bytes em claro (para checar a assinatura do arquivo).
 */
export async function saveStream(folder: string, name: string, input: Readable, headBytes = 132) {
  const key = await newKey(folder, name);
  const { header, cipher } = newCipher();
  const out = createWriteStream(resolveKey(key));
  out.write(header);
  let size = 0;
  let head = Buffer.alloc(0);
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (head.length < headBytes) head = Buffer.concat([head, chunk.subarray(0, headBytes - head.length)]);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(input, tap, cipher, out, { end: false });
    await new Promise<void>((res, rej) => out.end(cipher.getAuthTag(), (e?: Error | null) => (e ? rej(e) : res())));
  } catch (e) {
    out.destroy();
    await fs.rm(resolveKey(key), { force: true });
    throw e;
  }
  return { key, size, head };
}

export async function readFileBuffer(key: string) {
  return decryptBuffer(await fs.readFile(resolveKey(key)));
}

/** Stream (Node) decifrado + tamanho em claro. Arquivos antigos, não cifrados, são servidos como estão. */
export async function openFile(key: string): Promise<{ stream: Readable; size: number }> {
  const full = resolveKey(key);
  const stat = await fs.stat(full);
  const fh = await fs.open(full, "r");
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await fh.read(header, 0, HEADER_BYTES, 0);
    if (!isEncrypted(header)) return { stream: createReadStream(full), size: stat.size };
    await fh.read(tag, 0, TAG_BYTES, stat.size - TAG_BYTES);
  } finally {
    await fh.close();
  }
  const body = createReadStream(full, { start: HEADER_BYTES, end: stat.size - TAG_BYTES - 1 });
  const plain = body.pipe(decipherFor(header, tag));
  body.on("error", (e) => plain.destroy(e));
  return { stream: plain, size: stat.size - HEADER_BYTES - TAG_BYTES };
}

export async function deleteFile(key: string) {
  await fs.rm(resolveKey(key), { force: true });
}
