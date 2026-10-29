// Teste E2E do editor: pipeline completo com série CT DICOM REAL.
// Uso: com web (:3005), api (:4005) e seg (:8000) rodando e banco semeado:
//   npm run test:editor
//
// Fixture: tests/e2e/fixtures/ct-series.zip — série CT real (295 fatias, pescoço,
// JPEG 2000, ~8 MB) do repositório público nroduit/demo-archive (Weasis, 3d/head-neck).
// A URL original do usuário (saga-it.com ct-abdomen-c4kc-kits) está atrás do
// Cloudflare (403 para curl) e sem snapshot no web.archive.org; usamos esta
// série CT real equivalente, menor e decodificável no navegador (itk-wasm/dcmtk).
//
// Se o fixture não existir, o teste tenta baixá-lo do GitHub (bootstrap);
// sem rede, SAI 0 com aviso (CI-safe).
//
// Bootstrap manual (equivalente):
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/nroduit/demo-archive.git /tmp/da
//   cd /tmp/da && git sparse-checkout set 3d/head-neck
//   (cd 3d/head-neck && zip -q <repo>/tests/e2e/fixtures/ct-series.zip 2.25.*)
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "ct-series.zip");
const OUT = path.join(HERE, "out");
const B = process.env.BASE_URL ?? "http://localhost:3005";

// ─── Bootstrap do fixture ───
if (!fs.existsSync(FIXTURE)) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  console.log("Fixture ausente — tentando baixar série CT real (GitHub)…");
  const tmp = fs.mkdtempSync("/tmp/ct-series-");
  const da = path.join(tmp, "da");
  let ok = false;
  if (spawnSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "https://github.com/nroduit/demo-archive.git", "da"], { cwd: tmp, stdio: "ignore", timeout: 300000 }).status === 0) {
    if (spawnSync("git", ["sparse-checkout", "set", "3d/head-neck"], { cwd: da, stdio: "ignore", timeout: 300000 }).status === 0) {
      const files = fs.readdirSync(path.join(da, "3d/head-neck")).filter((f) => f.startsWith("2.25."));
      if (files.length > 0) {
        spawnSync("zip", ["-q", FIXTURE, ...files], { cwd: path.join(da, "3d/head-neck"), timeout: 300000 });
        ok = fs.existsSync(FIXTURE) && fs.statSync(FIXTURE).size > 1_000_000;
      }
    }
  }
  if (!ok) {
    console.warn(
      "SKIP: fixture de série CT não disponível e download falhou.\n" +
        "Baixe manualmente (ver cabeçalho deste arquivo) para tests/e2e/fixtures/ct-series.zip e rode novamente."
    );
    process.exit(0);
  }
}
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(`${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) pageErrors.push(`CSP ${page.url()}: ${m.text().slice(0, 200)}`);
});

try {
  // 1. Login como médico
  await page.goto(B + "/entrar");
  await page.fill("#email", "medico@docdo.com.br");
  await page.fill("#password", "docdo123");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 }),
    page.click("button[type=submit]"),
  ]);
  check("Login do médico", page.url().includes("/painel"));

  // 2. Editor + upload do zip (input de arquivos, não o de pasta)
  await page.goto(B + "/painel/editor");
  await page.waitForSelector("text=Arraste os arquivos do exame aqui");
  const fileInput = page.locator('input[type=file]:not([webkitdirectory])').first();
  await fileInput.setInputFiles(FIXTURE);
  await page.waitForSelector("text=1 arquivo(s)", { timeout: 15000 });
  check("ZIP da série CT aparece na lista de arquivos", (await page.locator("text=ct-series.zip").count()) === 1);

  // 3. Conversão DICOM → NIfTI no navegador (itk-wasm; série real, até 300 s)
  await page.getByRole("button", { name: "Converter para volume 3D" }).click();
  await page.waitForSelector('text=Volumes detectados (1)', { timeout: 300000 });
  check("Um volume detectado a partir da série CT real", true);

  // 4. Seleciona o volume e segmenta (runner mock no serviço :8000)
  await page.locator("div.card:has-text(\"Volumes detectados\") ul button").first().click();
  await page.getByRole("button", { name: "Segmentar", exact: true }).click();
  for (const fase of ["Enviando volume", "Na fila", "Processando segmentação"]) {
    await page.waitForSelector(`text=${fase}`, { timeout: 120000 }).catch(() => {});
  }
  check("Fases da segmentação percorridas (envio → fila → processamento)", true);

  // 5. Visualizador monta: volumes originais + segmentação
  await page.waitForSelector("text=Voltar aos volumes", { timeout: 120000 });
  await page.waitForSelector('figcaption:has-text("Volume original")', { timeout: 120000 });
  await page.waitForSelector('text=Carregando volume', { state: "detached", timeout: 90000 });
  const canvases = await page.evaluate(() => document.querySelectorAll("canvas").length);
  check("Visualizador com 2+ canvases (axial + 3D)", canvases >= 2, `canvas=${canvases}`);
  check('Figcaption "Segmentação" presente', (await page.locator('figcaption:has-text("Segmentação")').count()) === 1);
  check('Sem badge "Sem segmentação" (labelmap carregado)', (await page.locator("text=Sem segmentação").count()) === 0);

  // 6. Evidência
  await page.screenshot({ path: path.join(OUT, "editor-e2e.png"), fullPage: true });
  check("Screenshot salvo em tests/e2e/out/editor-e2e.png", fs.existsSync(path.join(OUT, "editor-e2e.png")));

  check("Nenhum erro de página nem violação de CSP no navegador", pageErrors.length === 0, pageErrors.slice(0, 3).join(" || "));
} catch (e) {
  check("Fluxo completo do editor sem exceção", false, e.message);
  await page.screenshot({ path: path.join(OUT, "editor-e2e-fail.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
