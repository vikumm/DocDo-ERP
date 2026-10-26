import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { User } from "@prisma/client";
import { PLANS, type CaseDetailDTO, type CaseListDTO } from "@docdo/contracts";
import type { AuthInfo } from "../../common/auth";
import { db } from "../../common/db";
import { asSystem } from "../../common/context";
import { fail, parse } from "../../common/http";
import { caseAccessWhere, canOperate, findCase, hasClinicalAccess } from "../../common/access";
import { caseListInclude, countsByStatus, toAccessDTO, toCaseListItem, toDicomDTO, toEventDTO, toOrderDTO, toViewerModels } from "../../common/dto";
import { hashPassword } from "../../lib/password";
import { limit } from "../../lib/rate-limit";
import { appUrl, sendMail } from "../../lib/mail";
import { issueToken } from "../../lib/email-tokens";
import { logAccess } from "../../lib/access-log";
import { deleteFile } from "../../lib/storage";

const createSchema = z.object({
  title: z.string().trim().min(3, "Dê um título ao caso (ex.: TC de abdome).").max(160),
  examType: z.enum(["CT", "MRI", "US", "OTHER"]),
  bodyRegion: z.string().trim().max(80).optional(),
  description: z.string().trim().max(5000).optional(),
  plan: z.enum(["UNILATERAL", "BILATERAL"]),
  counterpartEmail: z.string().trim().toLowerCase().max(254).optional(),
  counterpartName: z.string().trim().max(120).optional(),
});

/** Convite: o paciente define a senha (e aceita a política) pelo link enviado ao próprio e-mail. */
async function invitePatient(patient: { id: string; name: string; email: string }, byName: string) {
  const token = await issueToken(patient.id, "INVITE");
  await sendMail(
    patient.email,
    `${byName} enviou seu exame para o DocDo`,
    [
      `Olá, ${patient.name}.`,
      `${byName} criou um caso no DocDo para reconstruir seu exame em 3D. Defina sua senha para acompanhar o caso e ver o modelo quando ficar pronto. O link vale por 7 dias.`,
    ],
    { label: "Definir minha senha", url: appUrl(`/redefinir?token=${token}`) },
  );
}

@Injectable()
export class CasesService {
  /** Busca por paciente (nome ou e-mail), título, médico ou código DD-00000 — sempre dentro do que o usuário pode ver. */
  async list(a: AuthInfo, status?: string, q?: string): Promise<CaseListDTO> {
    const where = caseAccessWhere(a);
    const extra = status === "prontos" ? { status: "READY" as const } : status === "andamento" ? { status: { in: ["CREATED", "UPLOADED", "PAID", "PROCESSING"] as const } } : {};
    const term = (q ?? "").trim().slice(0, 100);
    const code = Number(term.replace(/^DD-?/i, ""));
    const search = term
      ? {
          OR: [
            { patient: { name: { contains: term, mode: "insensitive" as const } } },
            { patient: { email: { contains: term, mode: "insensitive" as const } } },
            { title: { contains: term, mode: "insensitive" as const } },
            { doctor: { name: { contains: term, mode: "insensitive" as const } } },
            ...(Number.isInteger(code) && code > 0 ? [{ code }] : []),
          ],
        }
      : {};
    const [cases, counts] = await Promise.all([
      db.case.findMany({ where: { AND: [where, extra as object, search] }, include: caseListInclude, orderBy: { createdAt: "desc" }, take: 500 }),
      db.case.groupBy({ by: ["status"], where, _count: true }),
    ]);
    return { cases: cases.map(toCaseListItem), counts: countsByStatus(counts) };
  }

  /**
   * Paciente cria para si (vinculando um médico aprovado, opcional). Médico cria para um paciente (existente ou novo),
   * na clínica atual. Secretária cria em nome do médico titular da clínica atual.
   */
  async create(a: AuthInfo, body: unknown) {
    const user = a.user;
    if (a.pendingDoctor) fail("Seu cadastro de médico ainda está em análise. Você poderá criar casos assim que for aprovado.");
    await limit(`create-case:${user.id}`, 30, 24 * 3600_000);
    const d = parse(createSchema, body);

    let patientId: string | null = user.role === "PATIENT" ? user.id : null;
    let doctorId: string | null = user.role === "DOCTOR" ? user.id : null;
    let organizationId: string | null = user.role === "PATIENT" ? null : (a.currentOrg?.organizationId ?? null);

    if (user.role === "SECRETARY") {
      if (!a.currentOrg || a.currentOrg.role !== "SECRETARY") fail("Selecione a clínica em que você trabalha.");
      const owner = await asSystem(() => db.membership.findFirst({ where: { organizationId: organizationId!, role: "OWNER" } }));
      if (!owner) fail("A clínica não tem médico titular.");
      doctorId = owner!.userId;
    }
    const byName = user.role === "SECRETARY" ? (a.currentOrg?.organization.name ?? user.name) : user.name;

    if (d.counterpartEmail) {
      // a busca por outras contas precisa enxergar além do usuário: roda como sistema, com as regras abaixo
      const other = await asSystem(() => db.user.findUnique({ where: { email: d.counterpartEmail! } }));
      if (user.role === "PATIENT") {
        // só médicos com e-mail confirmado e cadastro aprovado: evita entregar o exame a quem se passa por médico
        if (!other || other.role !== "DOCTOR" || !other.emailVerifiedAt || !other.approvedAt || !other.active)
          fail("Não encontramos um médico cadastrado e aprovado com esse e-mail.");
        doctorId = other!.id;
        const ownerOrg = await asSystem(() => db.membership.findFirst({ where: { userId: other!.id, role: "OWNER" } }));
        organizationId = ownerOrg?.organizationId ?? null;
      } else if (other?.emailVerifiedAt) {
        if (other.role !== "PATIENT") fail("Esse e-mail pertence a uma conta que não é de paciente.");
        patientId = other.id;
      } else if (other) {
        patientId = (await this.claimUnverified(other, d.counterpartName, byName)).id;
      } else {
        if (!d.counterpartName || d.counterpartName.length < 3) fail("Informe o nome do paciente para cadastrá-lo.");
        const created = await asSystem(async () =>
          db.user.create({ data: { role: "PATIENT", name: d.counterpartName!, email: d.counterpartEmail!, passwordHash: await hashPassword(randomBytes(24).toString("hex")) } }),
        );
        patientId = created.id;
        await invitePatient(created, byName);
      }
    } else if (user.role !== "PATIENT") {
      fail("Informe o e-mail do paciente.");
    }

    const c = await db.case.create({
      data: {
        title: d.title,
        examType: d.examType,
        bodyRegion: d.bodyRegion || null,
        description: d.description || null,
        plan: d.plan,
        organizationId,
        patientId,
        doctorId,
        createdById: user.id,
        events: { create: { userId: user.id, message: "Caso criado" } },
      },
    });
    return { id: c.id };
  }

  /** Conta nunca confirmada = não reivindicada (pode ser de um impostor): vira paciente e o dono real do e-mail recebe o convite. */
  private claimUnverified(other: User, counterpartName: string | undefined, byName: string) {
    return asSystem(async () => {
      const linked =
        (await db.case.count({ where: { OR: [{ patientId: other.id }, { doctorId: other.id }] } })) + (await db.membership.count({ where: { userId: other.id } }));
      if (other.role !== "PATIENT" && linked) fail("Esse e-mail pertence a uma conta que não é de paciente.");
      // apaga tudo o que quem criou a conta digitou: nome, senha e aceite passam a ser do dono real do e-mail
      const claimed = await db.user.update({
        where: { id: other.id },
        data: {
          role: "PATIENT",
          name: counterpartName && counterpartName.length >= 3 ? counterpartName : other.name,
          passwordHash: await hashPassword(randomBytes(24).toString("hex")),
          phone: null,
          crm: null,
          specialty: null,
          approvedAt: null,
          consentAt: null,
          consentVersion: null,
        },
      });
      await db.emailToken.deleteMany({ where: { userId: other.id } });
      await db.session.deleteMany({ where: { userId: other.id } });
      await invitePatient(claimed, byName);
      return claimed;
    });
  }

  async detail(a: AuthInfo, id: string): Promise<CaseDetailDTO> {
    const base = await findCase(a, id);
    if (!base) fail("Caso não encontrado", 404);
    await logAccess(a.user.id, id, "VIEW_CASE");
    const clinical = await hasClinicalAccess(a, base!);
    const c = await db.case.findUniqueOrThrow({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
        patient: { select: { name: true, email: true } },
        doctor: { select: { name: true, email: true, crm: true, specialty: true } },
        dicomFiles: { orderBy: { createdAt: "desc" } },
        models: { orderBy: { sortOrder: "asc" } },
        orders: { orderBy: { createdAt: "desc" } },
        shares: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        events: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
        accessLogs: { include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 15 },
      },
    });
    const operate = await canOperate(a, c);
    return {
      id: c.id,
      code: c.code,
      title: c.title,
      // a secretária opera o caso, mas não lê conteúdo clínico
      description: clinical ? c.description : null,
      examType: c.examType,
      bodyRegion: c.bodyRegion,
      status: c.status,
      plan: c.plan,
      createdAt: c.createdAt.toISOString(),
      organization: c.organization,
      patient: c.patient,
      doctor: c.doctor,
      createdById: c.createdById,
      restricted: !clinical,
      canUpload: operate && (c.status === "CREATED" || c.status === "UPLOADED"),
      canShare: clinical && [c.patientId, c.doctorId, c.createdById].includes(a.user.id),
      dicomFiles: c.dicomFiles.map(toDicomDTO),
      models: clinical ? toViewerModels(c.models) : [],
      orders: c.orders.map((o) => toOrderDTO(o)),
      shares: clinical ? c.shares.map((s) => ({ userId: s.userId, name: s.user.name, email: s.user.email, role: s.user.role })) : [],
      events: c.events.map(toEventDTO),
      accessLogs: clinical ? c.accessLogs.map(toAccessDTO) : [],
    };
  }

  async share(a: AuthInfo, caseId: string, body: { email?: string }) {
    const c = await findCase(a, caseId);
    if (!c) fail("Caso não encontrado.", 404);
    if (![c!.patientId, c!.doctorId, c!.createdById].includes(a.user.id)) fail("Só o paciente ou o médico responsável podem compartilhar este caso.");
    await limit(`share:${a.user.id}`, 20, 3600_000);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const other = await asSystem(() => db.user.findUnique({ where: { email } }));
    if (!other || other.role === "ADMIN" || !other.emailVerifiedAt || !other.active || (other.role === "DOCTOR" && !other.approvedAt))
      fail("Nenhum usuário DocDo ativo com esse e-mail.");
    if (other!.id === a.user.id) fail("Você já tem acesso a este caso.");
    await db.caseShare.upsert({ where: { caseId_userId: { caseId, userId: other!.id } }, create: { caseId, userId: other!.id }, update: {} });
    await db.caseEvent.create({ data: { caseId, userId: a.user.id, message: `Compartilhado com ${other!.name}` } });
    return { ok: `Caso compartilhado com ${other!.name}.` };
  }

  async unshare(a: AuthInfo, caseId: string, userId: string) {
    const c = await findCase(a, caseId);
    if (!c || c.createdById !== a.user.id) fail("Só quem criou o caso pode remover acessos.", 403);
    await db.caseShare.deleteMany({ where: { caseId, userId } });
    return { ok: "Acesso removido." };
  }

  /** Checkout: cria o pedido pendente. A confirmação é feita pelo gateway (webhook) ou pelo admin. */
  async checkout(a: AuthInfo, caseId: string, body: { plan?: string; method?: string }) {
    const c = await findCase(a, caseId);
    if (!c || !(await canOperate(a, c))) fail("Caso não encontrado.", 404);
    if (c!.status !== "UPLOADED") fail("O pagamento é liberado após o envio do DICOM.");
    const plan = body?.plan === "BILATERAL" ? "BILATERAL" : "UNILATERAL";
    const method = ["pix", "cartao", "boleto"].includes(String(body?.method)) ? String(body!.method) : "pix";
    const pending = await db.order.findFirst({ where: { caseId, status: "PENDING" } });
    if (pending) await db.order.update({ where: { id: pending.id }, data: { plan, method, amount: PLANS[plan].price } });
    else await db.order.create({ data: { caseId, userId: a.user.id, plan, method, amount: PLANS[plan].price } });
    await db.case.update({ where: { id: caseId }, data: { plan } });
    await db.caseEvent.create({ data: { caseId, userId: a.user.id, message: `Pedido ${PLANS[plan].name} gerado (${method})` } });
    return { ok: "Pedido gerado! Assim que o pagamento for confirmado, seu caso entra na fila de reconstrução." };
  }

  async deleteDicom(a: AuthInfo, caseId: string, fileId: string) {
    const c = await findCase(a, caseId);
    if (!c || !(await canOperate(a, c))) fail("Caso não encontrado.", 404);
    if (!a.adminReady && c!.status !== "CREATED" && c!.status !== "UPLOADED") fail("O caso já está em processamento.");
    const f = await db.dicomFile.findFirst({ where: { id: fileId, caseId } });
    if (!f) fail("Arquivo não encontrado.", 404);
    await deleteFile(f!.storageKey);
    await db.dicomFile.delete({ where: { id: f!.id } });
    const remaining = await db.dicomFile.count({ where: { caseId } });
    if (remaining === 0 && c!.status === "UPLOADED") await db.case.update({ where: { id: caseId }, data: { status: "CREATED" } });
    return { ok: "Arquivo removido." };
  }
}
