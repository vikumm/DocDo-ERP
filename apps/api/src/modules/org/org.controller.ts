import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { OrgPatientDTO, TeamMemberDTO } from "@docdo/contracts";
import { Auth, type AuthInfo, Roles } from "../../common/auth";
import { db } from "../../common/db";
import { asSystem } from "../../common/context";
import { fail, parse } from "../../common/http";
import { revokeSessions } from "../../common/sessions";
import { hashPassword } from "../../lib/password";
import { limit } from "../../lib/rate-limit";
import { appUrl, sendMail } from "../../lib/mail";
import { issueToken } from "../../lib/email-tokens";

const inviteSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome da secretária.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
});

/** Clínica atual: equipe e pacientes. Só médicos e secretárias com vínculo. */
@ApiTags("org")
@Roles("DOCTOR", "SECRETARY")
@Controller("org")
export class OrgController {
  private current(a: AuthInfo) {
    if (!a.currentOrg) fail("Você não está vinculado a nenhuma clínica.", 404);
    return a.currentOrg!;
  }

  private owner(a: AuthInfo) {
    const m = this.current(a);
    if (m.role !== "OWNER") fail("Só o médico titular gerencia a equipe.", 403);
    return m;
  }

  @Get("team")
  async team(@Auth() a: AuthInfo): Promise<{ name: string; role: string; members: TeamMemberDTO[] }> {
    const m = this.current(a);
    const members = await db.membership.findMany({
      where: { organizationId: m.organizationId },
      include: { user: { select: { id: true, name: true, email: true, emailVerifiedAt: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      name: m.organization.name,
      role: m.role,
      members: members.map((x) => ({
        userId: x.userId,
        name: x.user.name,
        email: x.user.email,
        role: x.role,
        pending: !x.user.emailVerifiedAt,
        createdAt: x.createdAt.toISOString(),
      })),
    };
  }

  @Patch()
  async rename(@Auth() a: AuthInfo, @Body() body: { name?: string }) {
    const m = this.owner(a);
    const name = String(body?.name ?? "").trim();
    if (name.length < 3 || name.length > 120) fail("Nome da clínica deve ter de 3 a 120 caracteres.");
    await db.organization.update({ where: { id: m.organizationId }, data: { name } });
    return { ok: "Nome da clínica atualizado." };
  }

  /**
   * Convite de secretária. Conta nova (ou nunca confirmada) recebe um link para definir a senha;
   * uma secretária já ativa em outra clínica só ganha o vínculo novo e um aviso.
   */
  @Post("secretaries") @HttpCode(200)
  async invite(@Auth() a: AuthInfo, @Body() body: unknown) {
    const m = this.owner(a);
    await limit(`invite:${a.user.id}`, 20, 24 * 3600_000);
    const d = parse(inviteSchema, body);
    const orgName = m.organization.name;

    const other = await asSystem(() => db.user.findUnique({ where: { email: d.email } }));
    if (other?.emailVerifiedAt && other.role !== "SECRETARY") fail("Esse e-mail pertence a uma conta de outro perfil.");

    let userId: string;
    if (other?.emailVerifiedAt) {
      userId = other.id;
    } else {
      // conta nova ou não reivindicada: o que estiver nela é descartado e o dono do e-mail define a senha pelo convite
      const user = await asSystem(async () => {
        const data = {
          role: "SECRETARY" as const,
          name: d.name,
          passwordHash: await hashPassword(randomBytes(24).toString("hex")),
          phone: null,
          crm: null,
          specialty: null,
          approvedAt: null,
          consentAt: null,
          consentVersion: null,
        };
        if (other) {
          const linked = await db.case.count({ where: { OR: [{ patientId: other.id }, { doctorId: other.id }] } });
          if (linked) fail("Esse e-mail já está em uso por outra conta.");
          await db.session.deleteMany({ where: { userId: other.id } });
          return db.user.update({ where: { id: other.id }, data });
        }
        return db.user.create({ data: { ...data, email: d.email } });
      });
      userId = user.id;
    }

    const exists = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: m.organizationId, userId } } });
    if (exists) fail("Essa pessoa já faz parte da equipe.");
    await db.membership.create({ data: { organizationId: m.organizationId, userId, role: "SECRETARY" } });

    if (other?.emailVerifiedAt) {
      await sendMail(d.email, `Você foi adicionada à equipe de ${orgName}`, [`Olá, ${other.name}.`, `${a.user.name} adicionou você à equipe de ${orgName} no DocDo.`], {
        label: "Acessar o DocDo",
        url: appUrl("/painel"),
      });
    } else {
      const token = await asSystem(() => issueToken(userId, "INVITE", { organizationId: m.organizationId }));
      await sendMail(
        d.email,
        `Convite para a equipe de ${orgName}`,
        [`Olá, ${d.name}.`, `${a.user.name} convidou você para trabalhar como secretária em ${orgName} no DocDo. Defina sua senha para entrar. O link vale por 7 dias.`],
        { label: "Aceitar convite", url: appUrl(`/redefinir?token=${token}`) },
      );
    }
    return { ok: `Convite enviado para ${d.email}.` };
  }

  @Delete("members/:userId")
  async remove(@Auth() a: AuthInfo, @Param("userId") userId: string) {
    const m = this.owner(a);
    if (userId === a.user.id) fail("O titular não pode sair da própria clínica.");
    const target = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: m.organizationId, userId } } });
    if (!target) fail("Membro não encontrado.", 404);
    if (target!.role === "OWNER") fail("O titular não pode ser removido.");
    await db.membership.delete({ where: { id: target!.id } });
    // sem nenhum outro vínculo, as sessões abertas caem na hora
    const left = await asSystem(() => db.membership.count({ where: { userId } }));
    if (!left) await revokeSessions(userId);
    return { ok: "Acesso à clínica removido." };
  }

  /** Pacientes da clínica atual (cadastro operacional, sem conteúdo clínico). Médico: só os dele. Busca por nome ou e-mail. */
  @Get("patients")
  async patients(@Auth() a: AuthInfo, @Query("q") q?: string): Promise<OrgPatientDTO[]> {
    const m = this.current(a);
    const term = (q ?? "").trim().slice(0, 100);
    const cases = await db.case.findMany({
      where: {
        organizationId: m.organizationId,
        patientId: { not: null },
        // o médico vê só os pacientes dele; a secretária, os da clínica inteira
        ...(a.user.role === "DOCTOR" ? { doctorId: a.user.id } : {}),
        ...(term
          ? { patient: { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } }
          : {}),
      },
      select: { createdAt: true, patient: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    const map = new Map<string, OrgPatientDTO>();
    for (const c of cases) {
      const p = c.patient!;
      const cur = map.get(p.id);
      if (cur) cur.cases++;
      else map.set(p.id, { id: p.id, name: p.name, email: p.email, cases: 1, lastCaseAt: c.createdAt.toISOString() });
    }
    return [...map.values()];
  }
}
