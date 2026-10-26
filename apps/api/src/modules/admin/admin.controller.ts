import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import busboy from "busboy";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { CaseStatus, OrderStatus, Prisma, Role } from "@prisma/client";
import {
  CASE_STATUSES,
  MODEL_FORMATS,
  ORDER_LABEL,
  ORDER_STATUSES,
  STATUS_LABEL,
  defaultColorFor,
  type AdminCaseDTO,
  type AdminDashboardDTO,
  type AdminUserRowDTO,
  type OrganizationRowDTO,
  type UserSearchDTO,
} from "@docdo/contracts";
import { Auth, type AuthInfo, Roles } from "../../common/auth";
import { db } from "../../common/db";
import { fail, parse } from "../../common/http";
import { revokeSessions } from "../../common/sessions";
import {
  caseListInclude,
  countsByStatus,
  toAccessDTO,
  toCaseListItem,
  toDicomDTO,
  toEventDTO,
  toOrderDTO,
  toUserDTO,
  toViewerModels,
} from "../../common/dto";
import { hashPassword } from "../../lib/password";
import { appUrl, sendMail } from "../../lib/mail";
import { issueToken } from "../../lib/email-tokens";
import { deleteFile, saveBuffer } from "../../lib/storage";
import { sanitizeStl, stlVolumeMl } from "../../lib/stl";
import { logAccess } from "../../lib/access-log";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Clínica do médico titular: um caso com médico pertence ao consultório dele. */
async function orgOfDoctor(doctorId: string | null | undefined) {
  if (!doctorId) return null;
  const m = await db.membership.findFirst({ where: { userId: doctorId, role: "OWNER" } });
  return m?.organizationId ?? null;
}

// ───────────────────── painel, mensagens, clínicas ─────────────────────

@ApiTags("admin")
@Roles("ADMIN")
@Controller("admin")
export class AdminController {
  @Get("dashboard")
  async dashboard(): Promise<AdminDashboardDTO> {
    const since = new Date();
    since.setMonth(since.getMonth() - 5, 1);
    since.setHours(0, 0, 0, 0);
    const [doctors, patients, secretaries, organizations, byStatus, paidAll, paidOrders, queue, pending, messages, pendingDoctors, deletionRequests] = await Promise.all([
      db.user.count({ where: { role: "DOCTOR" } }),
      db.user.count({ where: { role: "PATIENT" } }),
      db.user.count({ where: { role: "SECRETARY" } }),
      db.organization.count(),
      db.case.groupBy({ by: ["status"], _count: true }),
      db.order.aggregate({ where: { status: "PAID" }, _sum: { amount: true }, _count: true }),
      db.order.findMany({ where: { status: "PAID", paidAt: { gte: since } }, select: { amount: true, paidAt: true } }),
      db.case.findMany({ where: { status: { in: ["PAID", "PROCESSING"] } }, include: caseListInclude, orderBy: { createdAt: "asc" }, take: 8 }),
      db.order.findMany({
        where: { status: "PENDING" },
        include: { user: { select: { name: true, role: true } }, case: { select: { id: true, title: true, code: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.contactMessage.findMany({ where: { read: false }, orderBy: { createdAt: "desc" }, take: 5 }),
      db.user.findMany({ where: { role: "DOCTOR", approvedAt: null, emailVerifiedAt: { not: null }, active: true }, select: { id: true, name: true, crm: true, createdAt: true }, take: 5 }),
      db.user.findMany({ where: { deletionRequestedAt: { not: null } }, select: { id: true, name: true, deletionRequestedAt: true }, take: 5 }),
    ]);
    const revenue = Array.from({ length: 6 }, (_, i) => {
      const m = new Date(since);
      m.setMonth(since.getMonth() + i);
      const inMonth = paidOrders.filter((o) => o.paidAt && o.paidAt.getMonth() === m.getMonth() && o.paidAt.getFullYear() === m.getFullYear());
      return { label: MONTHS[m.getMonth()], value: inMonth.reduce((s, o) => s + Number(o.amount), 0), count: inMonth.length };
    });
    return {
      doctors,
      patients,
      secretaries,
      organizations,
      byStatus: countsByStatus(byStatus),
      paidTotal: Number(paidAll._sum.amount ?? 0),
      paidCount: paidAll._count,
      revenue,
      queue: queue.map(toCaseListItem),
      pendingOrders: pending.map(toOrderDTO),
      messages: messages.map((m) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone, message: m.message, createdAt: m.createdAt.toISOString() })),
      pendingDoctors: pendingDoctors.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
      deletionRequests: deletionRequests.map((d) => ({ ...d, deletionRequestedAt: d.deletionRequestedAt!.toISOString() })),
    };
  }

  @Post("messages/:id/read") @HttpCode(200)
  async read(@Param("id") id: string) {
    await db.contactMessage.update({ where: { id }, data: { read: true } });
    return { ok: "Mensagem marcada como lida." };
  }

  @Get("organizations")
  async organizations(): Promise<OrganizationRowDTO[]> {
    const orgs = await db.organization.findMany({
      include: {
        memberships: { include: { user: { select: { id: true, name: true, email: true, emailVerifiedAt: true } } }, orderBy: { createdAt: "asc" } },
        _count: { select: { cases: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      cases: o._count.cases,
      members: o.memberships.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        pending: !m.user.emailVerifiedAt,
        createdAt: m.createdAt.toISOString(),
      })),
    }));
  }
}

// ───────────────────── casos, modelos 3D, acesso ─────────────────────

const caseSchema = z.object({
  title: z.string().trim().min(3, "Título muito curto.").max(160),
  description: z.string().trim().max(5000).optional(),
  examType: z.enum(["CT", "MRI", "US", "OTHER"]),
  bodyRegion: z.string().trim().max(80).optional(),
  plan: z.enum(["UNILATERAL", "BILATERAL"]),
  status: z.enum(CASE_STATUSES),
  patientId: z.string().max(40).optional(),
  doctorId: z.string().max(40).optional(),
  adminNotes: z.string().trim().max(5000).optional(),
});

@ApiTags("admin")
@Roles("ADMIN")
@Controller("admin/cases")
export class AdminCasesController {
  @Get()
  async list(@Query("q") q = "", @Query("status") status?: string, @Query("galeria") galeria?: string) {
    const term = q.trim();
    const code = Number(term.replace(/^DD-/i, ""));
    const where: Prisma.CaseWhereInput = {
      ...(status && (CASE_STATUSES as readonly string[]).includes(status) ? { status: status as CaseStatus } : {}),
      ...(galeria ? { isPublic: true } : {}),
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: "insensitive" } },
              { bodyRegion: { contains: term, mode: "insensitive" } },
              { patient: { name: { contains: term, mode: "insensitive" } } },
              { doctor: { name: { contains: term, mode: "insensitive" } } },
              { organization: { name: { contains: term, mode: "insensitive" } } },
              ...(Number.isInteger(code) && code > 0 ? [{ code }] : []),
            ],
          }
        : {}),
    };
    const [cases, counts] = await Promise.all([
      db.case.findMany({ where, include: caseListInclude, orderBy: { createdAt: "desc" }, take: 200 }),
      db.case.groupBy({ by: ["status"], _count: true }),
    ]);
    return { cases: cases.map(toCaseListItem), counts: countsByStatus(counts) };
  }

  @Post() @HttpCode(200)
  async create(@Auth() a: AuthInfo, @Body() body: unknown) {
    const d = parse(caseSchema, { status: "CREATED", ...(body as object) });
    const c = await db.case.create({
      data: {
        title: d.title,
        description: d.description || null,
        examType: d.examType,
        bodyRegion: d.bodyRegion || null,
        plan: d.plan,
        status: d.status,
        patientId: d.patientId || null,
        doctorId: d.doctorId || null,
        organizationId: await orgOfDoctor(d.doctorId),
        createdById: a.user.id,
        events: { create: { userId: a.user.id, message: "Caso criado pela equipe DocDo" } },
      },
    });
    return { id: c.id };
  }

  @Get(":id")
  async detail(@Auth() a: AuthInfo, @Param("id") id: string): Promise<AdminCaseDTO> {
    const c = await db.case.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
        patient: { select: { id: true, name: true, email: true, role: true } },
        doctor: { select: { id: true, name: true, email: true, role: true } },
        dicomFiles: { orderBy: { createdAt: "desc" } },
        models: { orderBy: { sortOrder: "asc" } },
        orders: { include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" } },
        events: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 },
        accessLogs: { include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 30 },
        shares: { include: { user: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!c) fail("Caso não encontrado", 404);
    await logAccess(a.user.id, id, "VIEW_CASE");
    const viewer = toViewerModels(c!.models);
    return {
      id: c!.id,
      code: c!.code,
      title: c!.title,
      description: c!.description,
      examType: c!.examType,
      bodyRegion: c!.bodyRegion,
      status: c!.status,
      plan: c!.plan,
      isPublic: c!.isPublic,
      publicTitle: c!.publicTitle,
      publicDescription: c!.publicDescription,
      views: c!.views,
      adminNotes: c!.adminNotes,
      createdAt: c!.createdAt.toISOString(),
      organization: c!.organization,
      patient: c!.patient,
      doctor: c!.doctor,
      dicomFiles: c!.dicomFiles.map(toDicomDTO),
      models: c!.models.map((m, i) => ({ ...viewer[i], sortOrder: m.sortOrder, size: Number(m.size) })),
      orders: c!.orders.map(toOrderDTO),
      events: c!.events.map(toEventDTO),
      accessLogs: c!.accessLogs.map(toAccessDTO),
      shares: c!.shares.map((s) => ({ userId: s.userId, name: s.user.name, email: s.user.email, role: s.user.role })),
    };
  }

  @Patch(":id")
  async update(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: unknown) {
    const d = parse(caseSchema, body);
    const before = await db.case.findUnique({ where: { id } });
    if (!before) fail("Caso não encontrado.", 404);
    const doctorChanged = (d.doctorId || null) !== before!.doctorId;
    await db.case.update({
      where: { id },
      data: {
        title: d.title,
        description: d.description || null,
        examType: d.examType,
        bodyRegion: d.bodyRegion || null,
        plan: d.plan,
        status: d.status,
        patientId: d.patientId || null,
        doctorId: d.doctorId || null,
        // trocar o médico leva o caso para o consultório dele
        ...(doctorChanged ? { organizationId: await orgOfDoctor(d.doctorId) } : {}),
        adminNotes: d.adminNotes || null,
        readyAt: d.status === "READY" && before!.status !== "READY" ? new Date() : before!.readyAt,
      },
    });
    if (before!.status !== d.status) await db.caseEvent.create({ data: { caseId: id, userId: a.user.id, message: `Status: ${STATUS_LABEL[d.status]}` } });
    // quem virou responsável não precisa continuar na lista de acesso extra
    const responsible = [d.patientId, d.doctorId].filter(Boolean) as string[];
    if (responsible.length) await db.caseShare.deleteMany({ where: { caseId: id, userId: { in: responsible } } });
    return { ok: "Caso salvo." };
  }

  @Post(":id/status") @HttpCode(200)
  async status(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: { status?: string }) {
    if (!(CASE_STATUSES as readonly string[]).includes(String(body?.status))) fail("Status inválido.");
    const status = body.status as CaseStatus;
    await db.case.update({ where: { id }, data: { status, ...(status === "READY" ? { readyAt: new Date() } : {}) } });
    await db.caseEvent.create({ data: { caseId: id, userId: a.user.id, message: `Status: ${STATUS_LABEL[status]}` } });
    return { ok: "Status atualizado." };
  }

  @Patch(":id/gallery")
  async gallery(@Param("id") id: string, @Body() body: { isPublic?: string | boolean; publicTitle?: string; publicDescription?: string }) {
    const isPublic = body?.isPublic === true || body?.isPublic === "on";
    const publicTitle = String(body?.publicTitle ?? "").trim().slice(0, 160);
    if (isPublic) {
      if (publicTitle.length < 3) fail("Defina um título público (sem dados do paciente).");
      if (!(await db.model3D.count({ where: { caseId: id } }))) fail("Envie ao menos um modelo 3D antes de publicar.");
    }
    await db.case.update({
      where: { id },
      data: { isPublic, publicTitle: publicTitle || null, publicDescription: String(body?.publicDescription ?? "").trim().slice(0, 2000) || null },
    });
    return { ok: isPublic ? "Caso publicado na galeria." : "Configuração da galeria salva." };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const c = await db.case.findUnique({ where: { id }, include: { dicomFiles: true, models: true } });
    if (!c) fail("Caso não encontrado.", 404);
    await Promise.all([...c!.dicomFiles, ...c!.models].map((f) => deleteFile(f.storageKey)));
    await db.case.delete({ where: { id } });
    return { ok: "Caso excluído." };
  }

  /** Modelos 3D reconstruídos: um arquivo por estrutura. Bufferizado (precisa do arquivo inteiro para limpar e medir). */
  @Post(":id/models") @HttpCode(200)
  async models(@Auth() a: AuthInfo, @Param("id") id: string, @Req() req: Request) {
    const c = await db.case.findUnique({ where: { id }, include: { _count: { select: { models: true } } } });
    if (!c) fail("Caso não encontrado", 404);
    const MAX = 300 * 1024 * 1024;
    const files = await new Promise<{ name: string; data: Buffer }[]>((resolve, reject) => {
      const out: { name: string; data: Buffer }[] = [];
      let total = 0;
      const bb = busboy({ headers: req.headers, limits: { fileSize: MAX, files: 50, fields: 0 } });
      bb.on("file", (_field, stream, info) => {
        const chunks: Buffer[] = [];
        stream.on("data", (ch: Buffer) => {
          total += ch.length;
          if (total > MAX) return void reject(new Error("Envio maior que 300 MB. Envie as estruturas em partes."));
          chunks.push(ch);
        });
        stream.on("end", () => out.push({ name: (info.filename || "modelo").slice(0, 200), data: Buffer.concat(chunks) }));
      });
      bb.on("error", reject);
      bb.on("close", () => resolve(out));
      req.pipe(bb);
    }).catch((e: Error) => fail(e.message, 413));
    const valid = files.filter((f) => f.data.length > 0);
    if (!valid.length) fail("Nenhum arquivo recebido");

    const created = [];
    let order = c!._count.models;
    for (const file of valid) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!(MODEL_FORMATS as readonly string[]).includes(ext)) fail(`${file.name}: formato não suportado (use ${MODEL_FORMATS.join(", ")})`, 415);
      // o cabeçalho do STL é texto livre do software de origem; é limpo antes de qualquer publicação
      const buf = ext === "stl" ? sanitizeStl(file.data) : file.data;
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      const storageKey = await saveBuffer(`cases/${c!.id}/models`, file.name, buf);
      created.push(
        await db.model3D.create({
          data: {
            caseId: c!.id,
            name,
            format: ext,
            storageKey,
            size: buf.length,
            color: defaultColorFor(name),
            opacity: /pele|skin|f[ií]gado|liver|rim|kidney/i.test(name) ? 0.85 : 1,
            sortOrder: order++,
            volumeMl: ext === "stl" ? stlVolumeMl(buf) : null,
          },
          select: { id: true, name: true },
        }),
      );
    }
    await db.caseEvent.create({ data: { caseId: c!.id, userId: a.user.id, message: `${valid.length} modelo(s) 3D adicionado(s)` } });
    return { models: created };
  }

  @Post(":id/access") @HttpCode(200)
  async grant(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: { userId?: string }) {
    const userId = String(body?.userId ?? "");
    const [c, u] = await Promise.all([db.case.findUnique({ where: { id } }), db.user.findUnique({ where: { id: userId } })]);
    if (!c || !u) fail("Caso ou usuário não encontrado.", 404);
    if (u!.role === "ADMIN") fail("Administradores já têm acesso a todos os casos.");
    if (!u!.active || !u!.emailVerifiedAt) fail(`${u!.name} ainda não confirmou o e-mail ou está inativo.`);
    if (c!.patientId === userId || c!.doctorId === userId) fail(`${u!.name} já é responsável por este caso.`);
    await db.caseShare.upsert({ where: { caseId_userId: { caseId: id, userId } }, create: { caseId: id, userId }, update: {} });
    await db.caseEvent.create({ data: { caseId: id, userId: a.user.id, message: `Acesso liberado para ${u!.name}` } });
    return { ok: `Acesso liberado para ${u!.name}.` };
  }

  @Delete(":id/access/:userId")
  async revoke(@Auth() a: AuthInfo, @Param("id") id: string, @Param("userId") userId: string) {
    const share = await db.caseShare.findUnique({ where: { caseId_userId: { caseId: id, userId } }, include: { user: { select: { name: true } } } });
    if (!share) return { ok: "Nada a remover." };
    await db.caseShare.delete({ where: { caseId_userId: { caseId: id, userId } } });
    await db.caseEvent.create({ data: { caseId: id, userId: a.user.id, message: `Acesso removido de ${share.user.name}` } });
    return { ok: `Acesso removido de ${share.user.name}.` };
  }
}

@ApiTags("admin")
@Roles("ADMIN")
@Controller("admin/models")
export class AdminModelsController {
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: { name?: string; color?: string; opacity?: number | string; sortOrder?: number | string }) {
    await db.model3D.update({
      where: { id },
      data: {
        name: String(body?.name ?? "").trim().slice(0, 120) || undefined,
        color: /^#[0-9a-f]{6}$/i.test(String(body?.color)) ? String(body.color) : undefined,
        opacity: Math.min(1, Math.max(0.05, Number(body?.opacity ?? 1) || 1)),
        sortOrder: Number(body?.sortOrder ?? 0) || 0,
      },
    });
    return { ok: "Estrutura salva." };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const m = await db.model3D.findUnique({ where: { id } });
    if (!m) fail("Estrutura não encontrada.", 404);
    await deleteFile(m!.storageKey);
    await db.model3D.delete({ where: { id } });
    return { ok: "Estrutura removida." };
  }
}

// ───────────────────── usuários ─────────────────────

const userSchema = z.object({
  role: z.enum(["PATIENT", "DOCTOR", "ADMIN", "SECRETARY"]),
  name: z.string().trim().min(3, "Nome muito curto.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
  phone: z.string().trim().max(30).optional(),
  cpf: z.string().trim().max(20).optional(),
  crm: z.string().trim().max(30).optional(),
  specialty: z.string().trim().max(80).optional(),
  institution: z.string().trim().max(120).optional(),
  active: z.union([z.literal("on"), z.boolean()]).optional(),
});

async function sendInvite(userId: string, byName: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await issueToken(u.id, "INVITE");
  await sendMail(u.email, "Seu acesso ao DocDo", [`Olá, ${u.name}.`, `${byName} criou seu acesso ao DocDo. Defina sua senha para entrar. O link vale por 7 dias.`], {
    label: "Definir minha senha",
    url: appUrl(`/redefinir?token=${token}`),
  });
}

@ApiTags("admin")
@Roles("ADMIN")
@Controller("admin/users")
export class AdminUsersController {
  @Get()
  async list(@Query("role") role: string, @Query("q") q = ""): Promise<AdminUserRowDTO[]> {
    const r = (["DOCTOR", "PATIENT", "SECRETARY", "ADMIN"].includes(role) ? role : "PATIENT") as Role;
    const term = q.trim();
    const users = await db.user.findMany({
      where: {
        role: r,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { email: { contains: term, mode: "insensitive" } },
                { crm: { contains: term, mode: "insensitive" } },
                { cpf: { contains: term } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { casesAsDoctor: true, casesAsPatient: true, memberships: true } } },
      // pendências (pedidos de exclusão, aprovação de médico) primeiro
      orderBy: [{ deletionRequestedAt: { sort: "desc", nulls: "last" } }, ...(r === "DOCTOR" ? [{ approvedAt: { sort: "desc" as const, nulls: "first" as const } }] : []), { createdAt: "desc" }],
      take: 500,
    });
    const paid = await db.order.groupBy({ by: ["userId"], where: { status: "PAID", userId: { in: users.map((u) => u.id) } }, _sum: { amount: true } });
    return users.map((u) => ({
      ...toUserDTO(u),
      cases: r === "DOCTOR" ? u._count.casesAsDoctor : r === "PATIENT" ? u._count.casesAsPatient : u._count.memberships,
      paid: Number(paid.find((p) => p.userId === u.id)?._sum.amount ?? 0),
    }));
  }

  /** Autocomplete: médicos e pacientes ativos por nome, e-mail, CRM ou CPF. */
  @Get("search")
  async search(@Query("q") q = "", @Query("role") role?: string, @Query("exclude") exclude = ""): Promise<{ users: UserSearchDTO[] }> {
    const term = q.trim().slice(0, 100);
    const ex = exclude.split(",").filter(Boolean).slice(0, 200);
    const users = await db.user.findMany({
      where: {
        role: role === "DOCTOR" || role === "PATIENT" ? role : { in: ["DOCTOR", "PATIENT"] },
        active: true,
        ...(ex.length ? { id: { notIn: ex } } : {}),
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { email: { contains: term, mode: "insensitive" } },
                { crm: { contains: term, mode: "insensitive" } },
                { cpf: { contains: term } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true, crm: true, specialty: true },
      orderBy: { name: "asc" },
      take: 8,
    });
    return { users: users as UserSearchDTO[] };
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const u = await db.user.findUnique({ where: { id }, include: { memberships: { include: { organization: true } } } });
    if (!u) fail("Usuário não encontrado", 404);
    const cases = await db.case.findMany({
      where: { OR: [{ patientId: id }, { doctorId: id }] },
      include: caseListInclude,
      orderBy: { createdAt: "desc" },
    });
    return {
      user: toUserDTO(u!),
      memberships: u!.memberships.map((m) => ({ organizationId: m.organizationId, organizationName: m.organization.name, role: m.role })),
      cases: cases.map(toCaseListItem),
    };
  }

  /** O admin não define a senha de ninguém: a conta nasce com senha aleatória e o titular recebe um convite. */
  @Post() @HttpCode(200)
  async create(@Auth() a: AuthInfo, @Body() body: unknown) {
    const d = parse(userSchema, body);
    if (d.role === "SECRETARY") fail("Secretárias são convidadas pelo médico titular, na equipe da clínica.");
    if (await db.user.findUnique({ where: { email: d.email } })) fail("Já existe um usuário com esse e-mail.");
    const created = await db.user.create({
      data: {
        role: d.role,
        name: d.name,
        email: d.email,
        phone: d.phone || null,
        cpf: d.cpf || null,
        crm: d.crm || null,
        specialty: d.specialty || null,
        institution: d.institution || null,
        active: d.active === "on" || d.active === true,
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
        approvedAt: d.role === "DOCTOR" ? new Date() : null,
      },
    });
    await sendInvite(created.id, a.user.name);
    return { id: created.id, ok: "Usuário criado. Enviamos um convite para definir a senha." };
  }

  @Patch(":id")
  async update(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: unknown) {
    const d = parse(userSchema, body);
    const active = d.active === "on" || d.active === true;
    if (id === a.user.id && (d.role !== "ADMIN" || !active)) fail("Você não pode remover o próprio acesso de admin.");
    const before = await db.user.findUnique({ where: { id } });
    if (!before) fail("Usuário não encontrado.", 404);
    if (await db.user.findFirst({ where: { email: d.email, NOT: { id } } })) fail("Já existe um usuário com esse e-mail.");
    // trocar o e-mail exige nova confirmação pelo titular
    const emailChanged = before!.email !== d.email;
    await db.user.update({
      where: { id },
      data: {
        role: d.role,
        name: d.name,
        email: d.email,
        phone: d.phone || null,
        cpf: d.cpf || null,
        crm: d.crm || null,
        specialty: d.specialty || null,
        institution: d.institution || null,
        active,
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      },
    });
    // conta desativada, perfil ou e-mail alterado: derruba as sessões abertas
    if (!active || before!.role !== d.role || emailChanged) await revokeSessions(id);
    if (emailChanged) await sendInvite(id, a.user.name);
    return { ok: emailChanged ? "Usuário atualizado. Enviamos um link para o novo e-mail confirmar a conta." : "Usuário atualizado." };
  }

  @Post(":id/toggle") @HttpCode(200)
  async toggle(@Auth() a: AuthInfo, @Param("id") id: string) {
    if (id === a.user.id) fail("Você não pode desativar a própria conta.");
    const u = await db.user.findUnique({ where: { id } });
    if (!u) fail("Usuário não encontrado.", 404);
    await db.user.update({ where: { id }, data: { active: !u!.active } });
    if (u!.active) await revokeSessions(id);
    return { ok: u!.active ? "Conta desativada." : "Conta ativada." };
  }

  @Post(":id/approve") @HttpCode(200)
  async approve(@Auth() a: AuthInfo, @Param("id") id: string) {
    const u = await db.user.findUnique({ where: { id } });
    if (!u || u.role !== "DOCTOR") fail("Médico não encontrado.", 404);
    if (u!.approvedAt) return { ok: "Médico já aprovado." };
    await db.user.update({ where: { id }, data: { approvedAt: new Date() } });
    await sendMail(u!.email, "Seu cadastro de médico foi aprovado", [`Olá, ${u!.name}.`, `Seu cadastro foi aprovado por ${a.user.name}. Você já pode criar casos e receber exames de pacientes no DocDo.`], {
      label: "Acessar o painel",
      url: appUrl("/painel"),
    });
    return { ok: "Médico aprovado." };
  }

  /** Envia ao titular um link para ele mesmo redefinir a senha. */
  @Post(":id/reset-password") @HttpCode(200)
  async resetPassword(@Param("id") id: string) {
    const u = await db.user.findUnique({ where: { id } });
    if (!u) fail("Usuário não encontrado.", 404);
    const token = await issueToken(u!.id, "RESET");
    await sendMail(u!.email, "Redefinição de senha do DocDo", [`Olá, ${u!.name}.`, "A equipe DocDo enviou um link para você definir uma nova senha. Ele vale por 1 hora."], {
      label: "Definir nova senha",
      url: appUrl(`/redefinir?token=${token}`),
    });
    return { ok: `Link de redefinição enviado para ${u!.email}.` };
  }

  /**
   * LGPD (art. 18, VI): elimina os dados do titular. Os casos em que ele é o paciente são apagados com os arquivos;
   * a conta é anonimizada (mantém o id para o histórico dos casos de outras pessoas, sem nenhum dado pessoal).
   */
  @Post(":id/anonymize") @HttpCode(200)
  async anonymize(@Auth() a: AuthInfo, @Param("id") id: string) {
    if (id === a.user.id) fail("Você não pode excluir a própria conta por aqui.");
    const u = await db.user.findUnique({ where: { id }, include: { casesAsPatient: { include: { dicomFiles: true, models: true } } } });
    if (!u) fail("Usuário não encontrado.", 404);
    if (u!.role === "ADMIN") fail("Contas de administrador não são eliminadas por aqui.");
    for (const c of u!.casesAsPatient) {
      await Promise.all([...c.dicomFiles, ...c.models].map((f) => deleteFile(f.storageKey)));
      await db.case.delete({ where: { id: c.id } });
    }
    await db.session.deleteMany({ where: { userId: id } });
    await db.emailToken.deleteMany({ where: { userId: id } });
    await db.caseShare.deleteMany({ where: { userId: id } });
    await db.membership.deleteMany({ where: { userId: id, role: { not: "OWNER" } } });
    await db.user.update({
      where: { id },
      data: {
        name: "Titular removido",
        email: `removido-${u!.id}@docdo.invalid`,
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
        phone: null,
        cpf: null,
        crm: null,
        specialty: null,
        institution: null,
        birthDate: null,
        active: false,
        emailVerifiedAt: null,
        totpSecret: null,
        totpEnabledAt: null,
        recoveryCodes: [],
        deletionRequestedAt: null,
      },
    });
    return { ok: "Dados eliminados.", role: u!.role };
  }
}

// ───────────────────── compras ─────────────────────

@ApiTags("admin")
@Roles("ADMIN")
@Controller("admin/orders")
export class AdminOrdersController {
  @Get()
  async list(@Query("status") status?: string) {
    const filter = (ORDER_STATUSES as readonly string[]).includes(String(status)) ? (status as OrderStatus) : undefined;
    const [orders, sums] = await Promise.all([
      db.order.findMany({
        where: filter ? { status: filter } : {},
        include: { user: { select: { name: true, role: true } }, case: { select: { id: true, title: true, code: true } } },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      db.order.groupBy({ by: ["status"], _sum: { amount: true }, _count: true }),
    ]);
    return {
      orders: orders.map(toOrderDTO),
      sums: Object.fromEntries(sums.map((s) => [s.status, { amount: Number(s._sum.amount ?? 0), count: s._count }])),
    };
  }

  @Post(":id/status") @HttpCode(200)
  async status(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: { status?: string }) {
    if (!(ORDER_STATUSES as readonly string[]).includes(String(body?.status))) fail("Status inválido.");
    const status = body.status as OrderStatus;
    const o = await db.order.update({ where: { id }, data: { status, paidAt: status === "PAID" ? new Date() : null }, include: { case: true } });
    await db.caseEvent.create({ data: { caseId: o.caseId, userId: a.user.id, message: `Pagamento: ${ORDER_LABEL[status]}` } });
    // pagamento confirmado libera o caso para reconstrução (antigo payexam)
    if (status === "PAID" && (o.case.status === "UPLOADED" || o.case.status === "CREATED")) {
      await db.case.update({ where: { id: o.caseId }, data: { status: "PAID", plan: o.plan } });
    }
    return { ok: "Pedido atualizado." };
  }
}
