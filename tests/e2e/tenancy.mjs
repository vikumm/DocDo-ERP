// Testes de ponta a ponta do multi-tenancy: clínicas, secretária, isolamento (aplicação + RLS) e a API isolada.
// Uso: banco recém-semeado (npm run db:seed), API e front no ar. npm run test:tenancy
import { chromium } from "playwright-core";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const B = process.env.BASE_URL ?? "http://localhost:3005";
const API = process.env.API_URL ?? "http://127.0.0.1:4005";
const OUTBOX = path.join(APP, "apps/api/storage/dev-outbox.jsonl");
const API_ENV = fs.readFileSync(path.join(APP, "apps/api/.env"), "utf8");
const envOf = (k) => API_ENV.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, "m"))?.[1] ?? "";

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
};
const sql = (q) => execSync(`docker exec docdo-v5-db psql -U docdo -d docdo -tAc ${JSON.stringify(q)}`).toString().trim();
const mailFor = (to, part) => {
  if (!fs.existsSync(OUTBOX)) return null;
  return fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.to === to && r.subject.includes(part)).at(-1) ?? null;
};
const linkPath = (m) => (m?.link ? new URL(m.link).pathname + new URL(m.link).search : null);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${p.url()}: ${e.message}`));
  return p;
}
async function login(p, email, password = "docdo123") {
  await p.goto(B + "/entrar");
  await p.fill("#email", email);
  await p.fill("#password", password);
  await Promise.all([
    Promise.race([p.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 20000 }), p.waitForSelector("form p.rounded-xl", { timeout: 20000 })]).catch(() => {}),
    p.click("button[type=submit]"),
  ]);
  await p.waitForLoadState("networkidle");
}
const status = async (p, url) => (await p.goto(B + url)).status();

const helena = sql(`select id from "User" where email='medico@docdo.com.br'`);
const marcos = sql(`select id from "User" where email='marcos@docdo.com.br'`);
const helenaOrg = sql(`select "organizationId" from "Membership" where "userId"='${helena}' and role='OWNER'`);
const marcosOrg = sql(`select "organizationId" from "Membership" where "userId"='${marcos}' and role='OWNER'`);
const helenaCase = sql(`select id from "Case" where "organizationId"='${helenaOrg}' and not "isPublic" limit 1`);
const marcosCase = sql(`select id from "Case" where "organizationId"='${marcosOrg}' limit 1`);
const publicCase = sql(`select id from "Case" where "isPublic" limit 1`);
const publicModel = sql(`select id from "Model3D" where "caseId"='${publicCase}' limit 1`);

// ───── 1. API isolada ─────
{
  const health = await fetch(`${API}/health`).then((r) => r.status);
  const noKey = await fetch(`${API}/v1/public/gallery`).then((r) => r.status);
  const wrongKey = await fetch(`${API}/v1/public/gallery`, { headers: { "x-bff-key": "x".repeat(64) } }).then((r) => r.status);
  check("API sem a chave interna responde 401 (health continua público)", health === 200 && noKey === 401 && wrongKey === 401);
  const browserCookie = await fetch(`${API}/v1/me`, { headers: { cookie: "docdo_session=qualquer" } }).then((r) => r.status);
  check("Cookie do navegador não autentica direto na API", browserCookie === 401);
}

// ───── 2. API se recusa a subir com papel que ignora o RLS ─────
{
  const out = await new Promise((resolve) => {
    const env = { ...process.env, ...Object.fromEntries(API_ENV.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])) };
    env.DATABASE_URL = envOf("MIGRATE_DATABASE_URL"); // dono das tabelas (superusuário)
    env.PORT = "4999";
    const child = spawn("node", ["dist/main.js"], { cwd: path.join(APP, "apps/api"), env });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    const t = setTimeout(() => child.kill(), 15000);
    child.on("exit", (code) => {
      clearTimeout(t);
      resolve({ code, log });
    });
  });
  check("API não sobe conectada com superusuário (RLS seria ignorado)", out.code === 1 && /ignora o Row-Level Security/.test(out.log));
}

// ───── 3. Banco: RLS direto com o papel da aplicação ─────
{
  const pw = envOf("APP_DB_PASSWORD");
  const q = (s) => execSync(`docker exec -e PGPASSWORD=${pw} docdo-v5-db psql -q -h 127.0.0.1 -U docdo_app -d docdo -tAc ${JSON.stringify(s)}`).toString().trim().split("\n").at(-1);
  check("RLS: sem contexto, só casos públicos", q(`select count(*) from "Case"`) === q(`select count(*) from "Case" where "isPublic"`));
  check("RLS: médico com contexto da clínica dele não vê casos de outra", q(`begin; select set_config('app.user_id','${helena}',true), set_config('app.org_ids','${helenaOrg}',true); select count(*) from "Case" where "organizationId"='${marcosOrg}'; commit;`).trim() === "0");
  check("RLS: sem contexto, nenhum pedido nem arquivo DICOM", q(`select count(*) from "Order"`) === "0" && q(`select count(*) from "DicomFile"`) === "0");
}

// ───── 4. Secretária ─────
const sec = await newPage();
await login(sec, "secretaria@docdo.com.br");
{
  check("Secretária entra no painel da clínica", sec.url().includes("/painel"));
  const nav = await sec.locator("nav").first().textContent();
  check("Menu da secretária tem Pacientes e Equipe", nav.includes("Pacientes") && nav.includes("Equipe"));
  const rows = await sec.locator("tbody tr").count();
  const orgCases = Number(sql(`select count(*) from "Case" where "organizationId"='${helenaOrg}'`));
  check("Secretária vê os casos da clínica dela", rows === orgCases, `${rows} de ${orgCases}`);

  await sec.goto(`${B}/painel/casos/${helenaCase}`);
  const body = await sec.textContent("main");
  check("Caso aberto pela secretária mostra o aviso de acesso restrito", body.includes("conteúdo clínico"));
  check("Secretária não vê o botão do visualizador 3D", (await sec.locator("text=Abrir visualizador 3D").count()) === 0);
  check("Secretária não abre o visualizador nem pela URL", (await status(sec, `/visualizador/${helenaCase}`)) === 404);

  const dicom = sql(`select id from "DicomFile" where "caseId"='${helenaCase}' limit 1`);
  if (dicom) check("Secretária não baixa DICOM", (await sec.request.get(`${B}/api/files/dicom/${dicom}`)).status() === 404);
  const model = sql(`select m.id from "Model3D" m join "Case" c on c.id=m."caseId" where c."organizationId"='${helenaOrg}' and not c."isPublic" limit 1`);
  if (model) check("Secretária não baixa modelo 3D de caso privado", (await sec.request.get(`${B}/api/files/model/${model}`)).status() === 404);
  check("Modelo 3D de caso publicado continua acessível", (await sec.request.get(`${B}/api/files/model/${publicModel}`)).status() === 200);

  check("Secretária não vê caso de outra clínica (404)", (await status(sec, `/painel/casos/${marcosCase}`)) === 404);

  // cria caso para paciente novo, em nome do titular
  const novo = `pac.sec.${Date.now()}@exemplo.com`;
  await sec.goto(B + "/painel/casos/novo");
  await sec.fill("#title", "Caso aberto pela secretária");
  await sec.fill("#counterpartEmail", novo);
  await sec.fill("#counterpartName", "Paciente da Secretária");
  await Promise.all([sec.waitForURL(/\/painel\/casos\/(?!novo)/), sec.click("button[type=submit]")]);
  const created = new URL(sec.url()).pathname.split("/").pop();
  const row = sql(`select "organizationId" || '|' || "doctorId" from "Case" where id='${created}'`);
  check("Caso criado pela secretária fica na clínica, em nome do titular", row === `${helenaOrg}|${helena}`);
  check("Paciente novo recebe convite citando a clínica", !!mailFor(novo, "enviou seu exame"));

  // a secretária envia o DICOM (operação permitida) mas não consegue baixá-lo (acesso clínico)
  const buf = Buffer.alloc(4096);
  buf.write("DICM", 128);
  await sec.locator("input[type=file]").first().setInputFiles([{ name: "SEC001.dcm", mimeType: "application/dicom", buffer: buf }]);
  await sec.waitForSelector("text=enviados com sucesso", { timeout: 30000 });
  const secFile = sql(`select id from "DicomFile" where "caseId"='${created}' limit 1`);
  check("Secretária envia o DICOM do paciente", !!secFile);
  check("Secretária não baixa o DICOM que ela mesma enviou", (await sec.request.get(`${B}/api/files/dicom/${secFile}`)).status() === 404);
  globalThis.__secFile = secFile;
  await sec.goto(B + "/painel/equipe");
  check("Secretária não vê o formulário de convite", (await sec.locator("text=Convidar secretária").count()) === 0);
}

// ───── 5. Titular: convidar e remover secretária ─────
{
  const doc = await newPage();
  await login(doc, "medico@docdo.com.br");
  await doc.goto(B + "/painel/equipe");
  const email = `nova.sec.${Date.now()}@exemplo.com`;
  await doc.fill("#inv-name", "Nova Secretária");
  await doc.fill("#inv-email", email);
  await doc.click("button:has-text('Enviar convite')");
  await doc.waitForSelector("text=Convite enviado");
  check("Titular convida secretária", true);
  check("Médico titular baixa o DICOM enviado pela secretária", (await doc.request.get(`${B}/api/files/dicom/${globalThis.__secFile}`)).status() === 200);

  const invite = linkPath(mailFor(email, "Convite para a equipe"));
  check("Convite chega por e-mail", !!invite);
  const ns = await newPage();
  await ns.goto(B + invite);
  check("Página do convite cita a clínica", (await ns.textContent("body")).includes("Consultório de Dra. Helena Prado"));
  await ns.fill("#password", "secretaria-nova-1");
  await ns.fill("#password2", "secretaria-nova-1");
  await ns.check("input[name=consent]");
  await ns.click("button:has-text('Salvar senha')");
  await ns.waitForURL(/senha=1/);
  await login(ns, email, "secretaria-nova-1");
  check("Secretária convidada entra no painel da clínica", ns.url().includes("/painel") && (await ns.locator("tbody tr").count()) > 0);

  await doc.goto(B + "/painel/equipe");
  doc.once("dialog", (d) => d.accept());
  await doc.click(`button[aria-label="Remover Nova Secretária"]`);
  await doc.waitForTimeout(1500);
  await ns.goto(B + "/painel");
  check("Removida da equipe, a secretária perde o acesso na hora", ns.url().includes("/entrar"));
}

// ───── 6. Médicos de clínicas diferentes ─────
{
  const mk = await newPage();
  await login(mk, "marcos@docdo.com.br");
  check("Médico não abre caso de outra clínica", (await status(mk, `/painel/casos/${helenaCase}`)) === 404);
  // forja a clínica atual com o id da clínica da Dra. Helena: a API confere o vínculo e ignora
  await mk.context().addCookies([{ name: "docdo_org", value: helenaOrg, url: B }]);
  await mk.goto(B + "/painel");
  const names = await mk.locator("tbody").textContent().catch(() => "");
  check("Clínica forjada no cookie é ignorada", (await status(mk, `/painel/casos/${helenaCase}`)) === 404 && !names.includes("Caso aberto pela secretária"));
  check("Equipe da outra clínica não aparece", (await mk.goto(B + "/painel/equipe"), !(await mk.textContent("main")).includes("Bruna Lima")));
}

// ───── 7. Paciente vê o nome da clínica do caso ─────
{
  const pt = await newPage();
  await login(pt, "paciente@docdo.com.br");
  await pt.goto(`${B}/painel/casos/${publicCase}`);
  check("Paciente vê a clínica do caso", (await pt.textContent("main")).includes("Consultório de Dra. Helena Prado"));
  check("Paciente não acessa Equipe", (await pt.goto(B + "/painel/equipe"), pt.url().includes("/painel") && !(await pt.textContent("main")).includes("Convidar")));
}

// ───── 8. Busca de pacientes e casos ─────
{
  const doc = await newPage();
  await login(doc, "medico@docdo.com.br");
  await doc.goto(B + "/painel/pacientes");
  const mine = Number(sql(`select count(distinct "patientId") from "Case" where "organizationId"='${helenaOrg}' and "doctorId"='${helena}' and "patientId" is not null`));
  const rows = await doc.locator("tbody tr").count();
  check("Médico vê só os próprios pacientes", rows === mine, `${rows} de ${mine}`);
  const marcosPatient = sql(`select u.name from "Case" c join "User" u on u.id=c."patientId" where c."doctorId"='${marcos}' and u.id not in (select "patientId" from "Case" where "doctorId"='${helena}' and "patientId" is not null) limit 1`);
  if (marcosPatient) {
    await doc.goto(`${B}/painel/pacientes?q=${encodeURIComponent(marcosPatient)}`);
    check("Busca não encontra paciente de outro médico", (await doc.locator("tbody tr").count()) === 0, marcosPatient);
    await doc.goto(`${B}/painel?q=${encodeURIComponent(marcosPatient)}`);
    check("Busca de casos não encontra paciente de outro médico", (await doc.locator("tbody tr").count()) === 0);
  }
  const helenaPatient = sql(`select u.name from "Case" c join "User" u on u.id=c."patientId" where c."doctorId"='${helena}' limit 1`);
  await doc.goto(`${B}/painel/pacientes?q=${encodeURIComponent(helenaPatient.split(" ")[0].toLowerCase())}`);
  check("Busca de pacientes por parte do nome (sem diferenciar maiúsculas)", (await doc.locator(`tbody tr:has-text("${helenaPatient}")`).count()) === 1);
  await doc.click(`tbody tr:has-text("${helenaPatient}") >> text=Ver casos`);
  await doc.waitForURL(/\/painel\?q=/);
  const expected = Number(sql(`select count(*) from "Case" c join "User" u on u.id=c."patientId" where u.name='${helenaPatient}' and (c."organizationId"='${helenaOrg}' or c."doctorId"='${helena}')`));
  const shown = await doc.locator("tbody tr").count();
  check("“Ver casos” filtra a lista de casos pelo paciente", shown === expected && shown > 0, `${shown} de ${expected}`);
  await doc.goto(`${B}/painel?status=prontos&q=${encodeURIComponent(helenaPatient)}`);
  check("Busca combina com o filtro de status", (await doc.locator("tbody tr").count()) <= expected);

  const sec2 = await newPage();
  await login(sec2, "secretaria@docdo.com.br");
  await sec2.goto(B + "/painel/pacientes");
  const clinic = Number(sql(`select count(distinct "patientId") from "Case" where "organizationId"='${helenaOrg}' and "patientId" is not null`));
  check("Secretária vê os pacientes da clínica inteira", (await sec2.locator("tbody tr").count()) === clinic);
}

check("Nenhum erro de página no navegador", errors.length === 0, errors.slice(0, 2).join(" || "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
