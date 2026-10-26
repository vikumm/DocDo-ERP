import path from "node:path";
import fs from "node:fs/promises";
import nodemailer, { type Transporter } from "nodemailer";
import { isLocalApp } from "./env";

let transporter: Transporter | null = null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const appUrl = (p = "") => `${(process.env.APP_URL ?? "http://localhost:3005").replace(/\/$/, "")}${p}`;

/** Layout simples e seguro para clientes de e-mail. Todo texto variável passa por escape. */
function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55;color:#36423c">${esc(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#12cc85;color:#04130d;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">${esc(cta.label)}</a></p><p style="font-size:12px;color:#66756e;word-break:break-all">Se o botão não funcionar, copie este endereço: ${esc(cta.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;padding:32px 24px"><p style="font-size:22px;font-weight:700;color:#0b110e;margin:0 0 24px">doc<span style="color:#0aa86c">do</span></p><div style="background:#fff;border-radius:16px;padding:28px"><h1 style="font-size:18px;color:#0b110e;margin:0 0 16px">${esc(title)}</h1>${body}${button}</div><p style="font-size:11px;color:#66756e;margin-top:16px">Você recebeu este e-mail porque seu endereço foi usado no DocDo. Se não reconhece esta ação, ignore a mensagem.</p></div></body></html>`;
}

export async function sendMail(to: string, title: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const text = [title, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : [])].join("\n");
  const html = layout(title, paragraphs, cta);
  const from = process.env.MAIL_FROM || "DocDo <nao-responda@docdo.com.br>";

  if (process.env.SMTP_URL) {
    transporter ??= nodemailer.createTransport(process.env.SMTP_URL);
    await transporter.sendMail({ from, to, subject: title, text, html });
    return;
  }
  if (process.env.NODE_ENV === "production" && !isLocalApp()) throw new Error("SMTP_URL não configurada");
  // desenvolvimento: caixa de saída em arquivo (storage/dev-outbox.jsonl) + aviso no console
  const outbox = path.resolve(process.env.STORAGE_DIR ?? "./storage", "dev-outbox.jsonl");
  await fs.appendFile(outbox, JSON.stringify({ at: new Date().toISOString(), to, subject: title, text, link: cta?.url ?? null }) + "\n");
  console.info(`[mail:dev] para ${to}: ${title}${cta ? ` → ${cta.url}` : ""}`);
}
