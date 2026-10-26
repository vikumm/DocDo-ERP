// Testes de ponta a ponta das correções de segurança do DocDo v5.
// Uso: com o banco recém-semeado (npm run db:seed) e o servidor em BASE_URL (padrão http://localhost:3005):
//   npm run test:security
// Usa o Chrome instalado na máquina (playwright-core, canal "chrome").
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { createHmac, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
// arquivos e caixa de saída de e-mails de desenvolvimento ficam com a API
const STORAGE = path.join(APP, "apps/api/storage");
const B = process.env.BASE_URL ?? "http://localhost:3005";
const OUTBOX = path.join(STORAGE, "dev-outbox.jsonl");
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
};
const sql = (q) => execSync(`docker exec docdo-v5-db psql -U docdo -d docdo -tAc ${JSON.stringify(q)}`).toString().trim();

function mailFor(to, subjectPart) {
  if (!fs.existsSync(OUTBOX)) return null;
  const rows = fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return rows.filter((r) => r.to === to && r.subject.includes(subjectPart)).at(-1) ?? null;
}
const linkPath = (m) => (m?.link ? new URL(m.link).pathname + new URL(m.link).search : null);

// TOTP igual ao do app (RFC 6238)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32dec(s) {
  let bits = 0, v = 0; const out = [];
  for (const ch of s.replace(/\s/g, "")) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", b32dec(secret)).update(m).digest(); const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const pageErrors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => pageErrors.push(`${p.url()}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) pageErrors.push(`CSP ${p.url()}: ${m.text().slice(0, 200)}`); });
  return p;
}
async function login(p, email, password = "docdo123") {
  await p.goto(B + "/entrar");
  await p.fill("#email", email);
  await p.fill("#password", password);
  // espera o resultado real da ação: mudou de página ou apareceu a mensagem do formulário
  await Promise.all([
    Promise.race([p.waitForURL((u) => !u.pathname.startsWith("/entrar") || u.search.includes("senha"), { timeout: 20000 }), p.waitForSelector("form p.rounded-xl", { timeout: 20000 })]).catch(() => {}),
    p.click("button[type=submit]"),
  ]);
  await p.waitForLoadState("networkidle");
}
const msgText = async (p) => (await p.locator("p.rounded-xl").allTextContents()).join(" | ");

// ───── 1. CSP com nonce + 3D com arquivos cifrados ─────
{
  const p = await newPage();
  const r = await p.goto(B + "/", { waitUntil: "networkidle" });
  const csp = r.headers()["content-security-policy"] ?? "";
  check("CSP com nonce e sem unsafe-inline em script-src", /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp));
  const id = sql(`select id from "Case" where "isPublic" limit 1`);
  await p.goto(`${B}/visualizador/${id}`);
  await p.waitForSelector("text=Estruturas (5/5)", { timeout: 30000 });
  check("Visualizador 3D carrega os modelos cifrados", true);
  const f = sql(`select "storageKey" from "Model3D" limit 1`);
  check("Modelo gravado cifrado no disco (assinatura DDE1)", fs.readFileSync(path.join(STORAGE, f)).subarray(0, 4).toString() === "DDE1");
}

// ───── 2. Cadastro com verificação de e-mail, sem enumeração ─────
const novo = `novo.${Date.now()}@exemplo.com`;
{
  const p = await newPage();
  await p.goto(B + "/cadastro");
  await p.fill("#name", "Paciente Novo Teste"); await p.fill("#email", novo);
  await p.fill("#password", "senhaforte123"); await p.fill("#password2", "senhaforte123");
  await p.check("input[name=consent]");
  await p.click("button[type=submit]"); await p.waitForSelector("text=Confira seu e-mail");
  const okNovo = await p.locator("text=Enviamos um link").textContent();

  await p.goto(B + "/cadastro");
  await p.fill("#name", "Outra Pessoa"); await p.fill("#email", "paciente@docdo.com.br");
  await p.fill("#password", "qualquer12345"); await p.fill("#password2", "qualquer12345");
  await p.check("input[name=consent]");
  await p.click("button[type=submit]"); await p.waitForSelector("text=Confira seu e-mail");
  const okExistente = await p.locator("text=Enviamos um link").textContent();
  check("Cadastro responde igual para e-mail novo e existente", okNovo.replace(novo, "X") === okExistente.replace("paciente@docdo.com.br", "X"));
  check("Dono do e-mail existente é avisado da tentativa", !!mailFor("paciente@docdo.com.br", "Tentativa de cadastro"));
  check("Senha da conta existente NÃO mudou", (await (async () => { const q = await newPage(); await login(q, "paciente@docdo.com.br"); return q.url().includes("/painel"); })()));

  const q = await newPage();
  await login(q, novo, "senhaforte123");
  check("Login bloqueado antes de confirmar o e-mail", q.url().includes("/entrar") && (await msgText(q)).includes("Confirme seu e-mail"));
  const link = linkPath(mailFor(novo, "Confirme seu e-mail"));
  check("E-mail de confirmação foi enviado com link", !!link);
  await q.goto(B + link);
  await q.click("button:has-text('Confirmar e entrar')"); await q.waitForURL(/\/painel/);
  check("Link de confirmação ativa a conta e entra no painel", true);
  check("Consentimento registrado no cadastro", sql(`select "consentVersion" from "User" where email='${novo}'`) === "2026-10");
  const q2 = await newPage(); await q2.goto(B + link);
  check("Link de confirmação não pode ser reutilizado", (await q2.textContent("h1")).includes("inválido"));
}

// ───── 3. Impostor: cadastra-se como médico com o e-mail da vítima ─────
const vitima = `vitima.${Date.now()}@exemplo.com`;
{
  const p = await newPage();
  await p.goto(B + "/cadastro?perfil=medico");
  await p.fill("#name", "Dr. Impostor"); await p.fill("#email", vitima); await p.fill("#crm", "CRM-XX 0000");
  await p.fill("#password", "impostor123"); await p.fill("#password2", "impostor123");
  await p.check("input[name=consent]"); await p.click("button[type=submit]"); await p.waitForSelector("text=Confira seu e-mail");

  const d = await newPage(); await login(d, "medico@docdo.com.br");
  await d.goto(B + "/painel/casos/novo");
  await d.fill("#title", "Caso da vítima"); await d.fill("#counterpartEmail", vitima); await d.fill("#counterpartName", "Vítima Real");
  await Promise.all([d.waitForURL(/\/painel\/casos\/(?!novo)/), d.click("button[type=submit]")]);
  check("Médico cria caso mesmo com impostor não confirmado no e-mail", true);
  check("Conta não reivindicada virou paciente", sql(`select role from "User" where email='${vitima}'`) === "PATIENT");

  const imp = await newPage(); await login(imp, vitima, "impostor123");
  check("Impostor não consegue entrar (e-mail nunca confirmado)", imp.url().includes("/entrar"));

  const invite = linkPath(mailFor(vitima, "enviou seu exame"));
  check("Dono real recebeu convite por e-mail", !!invite);
  const v = await newPage(); await v.goto(B + invite);
  check("Convite chama o dono real pelo nome dado pelo médico (não o do impostor)", (await v.locator("text=Olá, Vítima Real").count()) === 1);
  check("Dono real precisa dar o próprio consentimento", (await v.locator("input[name=consent]").count()) === 1);
  await v.fill("#password", "vitima-real-123"); await v.fill("#password2", "vitima-real-123");
  await v.check("input[name=consent]"); await v.click("button:has-text('Salvar senha')"); await v.waitForURL(/\/entrar\?senha=1/);
  await login(v, vitima, "vitima-real-123");
  await v.goto(B + "/painel");
  check("Dono real entra e vê o caso", (await v.locator("tbody tr:has-text('Caso da vítima')").count()) === 1);
}

// ───── 4. Recuperação de senha + revogação de sessões ─────
{
  const old = await newPage(); await login(old, "mariana@exemplo.com");
  const p = await newPage();
  await p.goto(B + "/recuperar"); await p.fill("#email", "mariana@exemplo.com"); await p.click("button[type=submit]");
  await p.waitForSelector("text=Se houver uma conta");
  await p.goto(B + "/recuperar"); await p.fill("#email", "naoexiste@exemplo.com"); await p.click("button[type=submit]");
  check("Recuperação responde igual para e-mail inexistente", (await p.locator("text=Se houver uma conta").count()) === 1);
  const link = linkPath(mailFor("mariana@exemplo.com", "Redefinição de senha"));
  await p.goto(B + link);
  await p.fill("#password", "nova-senha-456"); await p.fill("#password2", "nova-senha-456");
  await p.click("button:has-text('Salvar senha')"); await p.waitForURL(/senha=1/);
  await old.goto(B + "/painel");
  check("Sessão antiga encerrada após redefinir a senha", old.url().includes("/entrar"));
  await login(p, "mariana@exemplo.com", "nova-senha-456");
  check("Login com a nova senha", p.url().includes("/painel"));
  const again = await newPage(); await again.goto(B + link);
  check("Link de redefinição é de uso único", (await again.textContent("h1")).includes("inválido"));
}

// ───── 5. Admin: 2FA obrigatório ─────
let recovery = [];
let secret = "";
{
  const a = await newPage(); await login(a, "admin@docdo.com.br");
  await a.waitForURL(/seguranca\/2fa/, { timeout: 15000 }).catch(() => {});
  check("Admin sem 2FA é levado à configuração", a.url().includes("/seguranca/2fa"));
  const api = await a.request.get(B + "/api/admin/users?q=a");
  check("API de admin recusada antes de ativar o 2FA", api.status() === 403);
  await a.goto(B + "/admin/medicos");
  check("Telas de admin bloqueadas antes do 2FA", a.url().includes("/seguranca/2fa"));
  await a.click("button:has-text('Gerar QR code')"); await a.waitForSelector("text=Escaneie o QR code");
  secret = (await a.locator(".select-all").first().textContent()).replace(/\s/g, "");
  await a.fill("input[name=code]", "000000"); await a.click("button:has-text('Ativar 2FA')");
  await a.waitForSelector("text=Código inválido");
  const setupCode = totp(secret);
  await a.fill("input[name=code]", setupCode); await a.click("button:has-text('Ativar 2FA')");
  await a.waitForSelector("text=Guarde estes códigos");
  recovery = await a.locator("li.select-all").allTextContents();
  check("2FA ativado e 8 códigos de recuperação exibidos", recovery.length === 8);
  check("Segredo TOTP cifrado no banco", sql(`select left("totpSecret", 6) from "User" where email='admin@docdo.com.br'`) !== secret.slice(0, 6));

  const b = await newPage(); await login(b, "admin@docdo.com.br");
  check("Login de admin pede o segundo fator", b.url().includes("/entrar/2fa"));
  // reutiliza exatamente o código já aceito na ativação: tem que ser recusado mesmo dentro da janela de 30 s
  await b.fill("#code", setupCode); await b.click("button[type=submit]"); await b.waitForSelector("form p.rounded-xl");
  check("Código já usado (replay) é recusado", (await msgText(b)).includes("inválido"));
  await b.fill("#code", recovery[0]); await b.click("button[type=submit]"); await b.waitForURL(/\/admin/);
  check("Código de recuperação entra no admin", true);
  const c = await newPage(); await login(c, "admin@docdo.com.br");
  await c.fill("#code", recovery[0]); await c.click("button[type=submit]"); await c.waitForSelector("form p.rounded-xl");
  check("Código de recuperação é de uso único", (await msgText(c)).includes("inválido"));
}

// sessão de admin já autenticada com 2FA (usa outro código de recuperação)
const admin = await newPage();
await login(admin, "admin@docdo.com.br");
await admin.fill("#code", recovery[1]); await admin.click("button[type=submit]"); await admin.waitForURL(/\/admin/);

// ───── 6. Médico pendente de aprovação ─────
const medNovo = `dr.novo.${Date.now()}@exemplo.com`;
{
  const p = await newPage();
  await p.goto(B + "/cadastro?perfil=medico");
  await p.fill("#name", "Dr. Novo Pendente"); await p.fill("#email", medNovo); await p.fill("#crm", "CRM-SP 999999");
  await p.fill("#password", "medico-novo-1"); await p.fill("#password2", "medico-novo-1");
  await p.check("input[name=consent]"); await p.click("button[type=submit]"); await p.waitForSelector("text=Confira seu e-mail");
  await p.goto(B + linkPath(mailFor(medNovo, "Confirme seu e-mail")));
  await p.click("button:has-text('Confirmar e entrar')"); await p.waitForURL(/\/painel/);
  check("Médico novo vê aviso de cadastro em análise", (await p.locator("text=em análise").count()) > 0);
  await p.goto(B + "/painel/casos/novo");
  check("Médico pendente não acessa o formulário de caso", (await p.locator("#title").count()) === 0);

  const pt = await newPage(); await login(pt, "paciente@docdo.com.br");
  await pt.goto(B + "/painel/casos/novo");
  await pt.fill("#title", "Vincular pendente"); await pt.fill("#counterpartEmail", medNovo);
  await pt.click("button[type=submit]"); await pt.waitForSelector("form p.rounded-xl");
  check("Paciente não consegue vincular médico não aprovado", (await msgText(pt)).includes("aprovado"));

  const uid = sql(`select id from "User" where email='${medNovo}'`);
  await admin.goto(`${B}/admin/usuarios/${uid}`);
  await admin.click("button:has-text('Aprovar médico')");
  await admin.waitForTimeout(1500);
  check("Admin aprova o médico", !!sql(`select "approvedAt" from "User" where id='${uid}'`));
  check("Médico recebe e-mail de aprovação", !!mailFor(medNovo, "aprovado"));
  await p.goto(B + "/painel/casos/novo");
  check("Médico aprovado acessa o formulário de caso", (await p.locator("#title").count()) === 1);
}

// ───── 7. Upload DICOM em streaming + cifrado, download íntegro, log de acesso ─────
{
  const pt = await newPage(); await login(pt, "paciente@docdo.com.br");
  await pt.goto(B + "/painel/casos/novo");
  await pt.fill("#title", "Upload grande e2e");
  await Promise.all([pt.waitForURL(/\/painel\/casos\/(?!novo)/), pt.click("button[type=submit]")]);
  const caseId = new URL(pt.url()).pathname.split("/").pop();
  const big = randomBytes(40 * 1024 * 1024); big.fill(0, 0, 128); big.write("DICM", 128);
  const sha = createHash("sha256").update(big).digest("hex");
  await pt.locator("input[type=file]").first().setInputFiles([
    { name: "SERIE001.dcm", mimeType: "text/html", buffer: big },
    { name: "leiame.txt", mimeType: "text/plain", buffer: Buffer.from("não é DICOM") },
  ]);
  await pt.waitForSelector("text=enviados com sucesso", { timeout: 60000 });
  const row = sql(`select id || '|' || "storageKey" || '|' || "mimeType" || '|' || size from "DicomFile" where "caseId"='${caseId}'`).split("\n");
  check("Só o arquivo DICOM foi aceito (o .txt foi descartado)", row.length === 1, row.join(" ; "));
  const [fid, key, mime, size] = row[0].split("|");
  check("Tipo gravado pelo conteúdo, não pelo navegador (text/html ignorado)", mime === "application/dicom");
  check("Arquivo DICOM cifrado no disco", fs.readFileSync(path.join(STORAGE, key)).subarray(0, 4).toString() === "DDE1" && Number(size) === big.length);
  const dl = await pt.request.get(`${B}/api/files/dicom/${fid}`);
  const body = Buffer.from(await dl.body());
  check("Download devolve o arquivo original, byte a byte", createHash("sha256").update(body).digest("hex") === sha);
  check("Download com tipo fixo, nosniff e attachment", dl.headers()["content-type"] === "application/dicom" && dl.headers()["x-content-type-options"] === "nosniff" && dl.headers()["content-disposition"].startsWith("attachment"));

  await admin.goto(`${B}/admin/casos/${caseId}`);
  await pt.goto(`${B}/painel/casos/${caseId}`);
  const acessos = await pt.locator("section:has-text('Quem acessou este exame')").textContent();
  check("Paciente vê no caso que o admin acessou e que houve download", acessos.includes("Equipe DocDo") && acessos.includes("baixou um arquivo DICOM"));
}

// ───── 8. LGPD: exportar e pedir exclusão ─────
{
  const p = await newPage(); await login(p, "ana@exemplo.com");
  const exp = await p.request.get(B + "/api/me/export");
  const json = await exp.json();
  check("Exportação de dados em JSON sem hash de senha nem segredo 2FA", exp.ok() && json.profile.email === "ana@exemplo.com" && !("passwordHash" in json.profile) && !("totpSecret" in json.profile));
  const casosAntes = Number(sql(`select count(*) from "Case" c join "User" u on u.id=c."patientId" where u.email='ana@exemplo.com'`));
  await p.goto(B + "/painel/perfil");
  await p.click("button:has-text('Excluir minha conta')");
  await p.fill("#del-password", "docdo123"); await p.click("button:has-text('Confirmar exclusão')");
  await p.waitForURL(/conta-excluida/);
  const q = await newPage(); await login(q, "ana@exemplo.com");
  check("Após pedir exclusão a conta não entra mais", q.url().includes("/entrar") && (await msgText(q)).includes("desativada"));
  await admin.goto(B + "/admin");
  check("Pedido de exclusão aparece no dashboard do admin", (await admin.locator("text=Pedidos de exclusão de dados").count()) === 1);
  const uid = sql(`select id from "User" where email='ana@exemplo.com'`);
  await admin.goto(`${B}/admin/usuarios/${uid}`);
  admin.once("dialog", (d) => d.accept());
  await admin.click("button:has-text('Concluir pedido de exclusão')");
  await admin.waitForURL(/\/admin\/pacientes/);
  check("Titular anonimizado (sem e-mail nem nome)", sql(`select name || '|' || email from "User" where id='${uid}'`).startsWith("Titular removido|removido-"));
  check(`Casos do titular eliminados (${casosAntes} antes)`, Number(sql(`select count(*) from "Case" where "patientId"='${uid}'`)) === 0);
}

// ───── 9. Força bruta: limite no Postgres ─────
{
  const p = await newPage();
  for (let i = 0; i < 6; i++) await login(p, "joao@exemplo.com", "errada" + i);
  check("6ª tentativa errada bloqueada", (await msgText(p)).includes("Muitas tentativas"));
  check("Contador guardado no Postgres (vale para várias instâncias)", Number(sql(`select count from "RateLimit" where key='login:email:joao@exemplo.com'`)) >= 6);
}

check("Nenhum erro de página nem violação de CSP no navegador", pageErrors.length === 0, pageErrors.slice(0, 3).join(" || "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
