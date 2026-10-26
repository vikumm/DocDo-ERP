import { PrismaClient, type CaseStatus, type Plan } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sanitizeStl, stlVolumeMl } from "../src/lib/stl";
import { encryptBuffer } from "../src/lib/crypto-file";
import { defaultColorFor, PLANS } from "@docdo/contracts";

// roda com o papel dono das tabelas (MIGRATE_DATABASE_URL): o seed não passa pelo RLS
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });
const STORAGE = path.resolve(process.env.STORAGE_DIR ?? "./storage");
const SAMPLE_DIR = path.resolve(process.env.SAMPLE_3D_DIR ?? "../../../3d-teste");

const NAMES: Record<string, string> = { Kidney: "Rim direito", Tumor: "Tumor renal", Artery: "Artéria renal", Vein: "Veia renal", Ureter: "Ureter" };
const ORDER = ["Kidney", "Tumor", "Artery", "Vein", "Ureter"];

async function attachSampleModels(caseId: string) {
  const files = (await fs.readdir(SAMPLE_DIR).catch(() => [])).filter((f) => f.toLowerCase().endsWith(".stl"));
  files.sort((a, b) => ORDER.indexOf(a.replace(/\.stl$/i, "")) - ORDER.indexOf(b.replace(/\.stl$/i, "")));
  for (const [i, file] of files.entries()) {
    const buf = sanitizeStl(await fs.readFile(path.join(SAMPLE_DIR, file)));
    const key = `cases/${caseId}/models/${randomUUID()}-${file}`;
    await fs.mkdir(path.dirname(path.join(STORAGE, key)), { recursive: true });
    await fs.writeFile(path.join(STORAGE, key), encryptBuffer(buf));
    const base = file.replace(/\.stl$/i, "");
    const name = NAMES[base] ?? base;
    await db.model3D.create({
      data: {
        caseId,
        name,
        format: "stl",
        storageKey: key,
        size: buf.length,
        color: defaultColorFor(base),
        opacity: base === "Kidney" ? 0.55 : 1,
        sortOrder: i,
        volumeMl: stlVolumeMl(buf),
      },
    });
  }
  return files.length;
}

async function main() {
  // o seed APAGA o banco e cria contas com senha conhecida: nunca em produção
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_SEED !== "yes") {
    throw new Error("Seed bloqueado em produção (defina ALLOW_DESTRUCTIVE_SEED=yes se tiver certeza).");
  }
  console.log("→ limpando banco");
  await db.$transaction([
    db.session.deleteMany(),
    db.emailToken.deleteMany(),
    db.accessLog.deleteMany(),
    db.rateLimit.deleteMany(),
    db.caseEvent.deleteMany(),
    db.order.deleteMany(),
    db.model3D.deleteMany(),
    db.dicomFile.deleteMany(),
    db.caseShare.deleteMany(),
    db.case.deleteMany(),
    db.membership.deleteMany(),
    db.organization.deleteMany(),
    db.contactMessage.deleteMany(),
    db.user.deleteMany(),
  ]);
  await fs.rm(path.join(STORAGE, "cases"), { recursive: true, force: true });

  const hash = await bcrypt.hash("docdo123", 10);
  // contas de exemplo já nascem verificadas, com consentimento registrado (e médicos aprovados)
  const now = new Date();
  const ok = { emailVerifiedAt: now, consentAt: now, consentVersion: "2026-10" };
  const admin = await db.user.create({ data: { role: "ADMIN", name: "Equipe DocDo", email: "admin@docdo.com.br", passwordHash: hash, emailVerifiedAt: now } });

  const doctors = await Promise.all(
    [
      ["Dra. Helena Prado", "medico@docdo.com.br", "CRM-SP 123456", "Urologia", "Hospital São Lucas"],
      ["Dr. Marcos Teixeira", "marcos@docdo.com.br", "CRM-RJ 654321", "Cirurgia Oncológica", "Instituto do Câncer"],
      ["Dra. Lívia Moura", "livia@docdo.com.br", "CRM-MG 112233", "Cirurgia Hepatobiliar", "Clínica Vida"],
      ["Joel Oliveira", "joel@docdo.com.br", "CRM-PE 445566", "Radiologia", "DocDo"],
    ].map(([name, email, crm, specialty, institution]) =>
      db.user.create({ data: { role: "DOCTOR", name, email, crm, specialty, institution, passwordHash: hash, phone: "(11) 99999-0000", ...ok, approvedAt: now } }),
    ),
  );

  // cada médico é titular do próprio consultório (tenant)
  const orgs = [];
  for (const d of doctors) {
    orgs.push(await db.organization.create({ data: { name: `Consultório de ${d.name}`, memberships: { create: { userId: d.id, role: "OWNER" } } } }));
  }
  // secretária de exemplo no consultório da Dra. Helena
  const secretary = await db.user.create({
    data: { role: "SECRETARY", name: "Bruna Lima", email: "secretaria@docdo.com.br", passwordHash: hash, phone: "(11) 98888-0000", ...ok },
  });
  await db.membership.create({ data: { organizationId: orgs[0].id, userId: secretary.id, role: "SECRETARY" } });

  const patients = await Promise.all(
    [
      ["Carlos Almeida", "paciente@docdo.com.br"],
      ["Mariana Souza", "mariana@exemplo.com"],
      ["João Pereira", "joao@exemplo.com"],
      ["Ana Ribeiro", "ana@exemplo.com"],
      ["Paulo Mendes", "paulo@exemplo.com"],
    ].map(([name, email]) => db.user.create({ data: { role: "PATIENT", name, email, passwordHash: hash, ...ok } })),
  );

  console.log("→ criando caso demo com os modelos de 3d-teste");
  const demo = await db.case.create({
    data: {
      title: "TC de abdome — tumor renal direito",
      description: "Planejamento de nefrectomia parcial robótica. Segmentação de rim, tumor, artéria, veia e ureter.",
      examType: "CT",
      bodyRegion: "Rim direito",
      status: "READY",
      plan: "UNILATERAL",
      organizationId: orgs[0].id,
      patientId: patients[0].id,
      doctorId: doctors[0].id,
      createdById: doctors[0].id,
      isPublic: true,
      publicTitle: "Tumor renal — planejamento de nefrectomia parcial",
      publicDescription:
        "Lesão exofítica no polo médio do rim direito, em contato com ramos da artéria renal. Reconstrução usada para definir a margem de ressecção e o clampeamento seletivo.",
      views: 214,
      readyAt: new Date(),
    },
  });
  const n = await attachSampleModels(demo.id);
  console.log(`  ${n} modelos importados`);

  const day = 86_400_000;
  const extra: { title: string; status: CaseStatus; plan: Plan; p: number; d: number; ago: number; region: string; type?: "CT" | "MRI" }[] = [
    { title: "TC de abdome — controle pós-nefrectomia", status: "PROCESSING", plan: "UNILATERAL", p: 1, d: 0, ago: 3, region: "Rim direito" },
    { title: "Angio-TC renal — doador vivo", status: "PAID", plan: "BILATERAL", p: 2, d: 1, ago: 5, region: "Rins" },
    { title: "RM de rins — cistos complexos", status: "UPLOADED", plan: "BILATERAL", p: 3, d: 2, ago: 8, region: "Rins", type: "MRI" },
    { title: "TC de rim esquerdo — nódulo sólido", status: "CREATED", plan: "UNILATERAL", p: 4, d: 1, ago: 1, region: "Rim esquerdo" },
    { title: "TC de rim esquerdo — cálculo coraliforme", status: "READY", plan: "UNILATERAL", p: 1, d: 0, ago: 21, region: "Rim esquerdo" },
    { title: "Uro-TC — tumores renais bilaterais", status: "READY", plan: "BILATERAL", p: 2, d: 0, ago: 40, region: "Rins" },
    { title: "TC de rim direito — massa renal", status: "CANCELLED", plan: "UNILATERAL", p: 3, d: 1, ago: 60, region: "Rim direito" },
  ];
  for (const e of extra) {
    const createdAt = new Date(Date.now() - e.ago * day);
    const c = await db.case.create({
      data: {
        title: e.title,
        examType: e.type ?? "CT",
        bodyRegion: e.region,
        status: e.status,
        plan: e.plan,
        organizationId: orgs[e.d].id,
        patientId: patients[e.p].id,
        doctorId: doctors[e.d].id,
        createdById: doctors[e.d].id,
        createdAt,
        readyAt: e.status === "READY" ? new Date(createdAt.getTime() + 3 * day) : null,
        events: { create: { userId: doctors[e.d].id, message: "Caso criado", createdAt } },
      },
    });
    if (["UPLOADED", "PAID", "PROCESSING", "READY"].includes(e.status)) {
      const status = e.status === "UPLOADED" ? "PENDING" : "PAID";
      await db.order.create({
        data: {
          caseId: c.id,
          userId: doctors[e.d].id,
          plan: e.plan,
          amount: PLANS[e.plan].price,
          status,
          method: e.ago % 2 ? "pix" : "cartao",
          createdAt,
          paidAt: status === "PAID" ? new Date(createdAt.getTime() + day / 4) : null,
        },
      });
    }
  }
  await db.order.create({
    data: { caseId: demo.id, userId: doctors[0].id, plan: "UNILATERAL", amount: PLANS.UNILATERAL.price, status: "PAID", method: "pix", paidAt: new Date() },
  });
  await db.caseEvent.createMany({
    data: [
      { caseId: demo.id, userId: doctors[0].id, message: "Caso criado" },
      { caseId: demo.id, userId: doctors[0].id, message: "DICOM enviado" },
      { caseId: demo.id, userId: admin.id, message: "Pagamento: Pago" },
      { caseId: demo.id, userId: admin.id, message: `${n} modelo(s) 3D adicionado(s)` },
      { caseId: demo.id, userId: admin.id, message: "Status: 3D pronto" },
    ],
  });
  await db.contactMessage.create({
    data: { name: "Clínica Horizonte", email: "contato@horizonte.com", message: "Gostaríamos de saber sobre planos para volume mensal de casos." },
  });

  console.log("\n✓ Seed concluído. Logins (senha: docdo123):");
  console.log("  admin@docdo.com.br     (admin)");
  console.log("  medico@docdo.com.br    (médico)");
  console.log("  paciente@docdo.com.br  (paciente)");
  console.log("  secretaria@docdo.com.br (secretária do consultório da Dra. Helena)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
