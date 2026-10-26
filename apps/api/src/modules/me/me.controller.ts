import { Body, Controller, Get, HttpCode, Patch, Post, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { CONSENT_VERSION, type MeDTO, type SessionDTO, type TotpResult, type TotpStatusDTO } from "@docdo/contracts";
import { AdminSetup, Auth, type AuthInfo, Roles } from "../../common/auth";
import { db } from "../../common/db";
import { asSystem } from "../../common/context";
import { fail, parse } from "../../common/http";
import { toUserDTO } from "../../common/dto";
import { revokeSessions } from "../../common/sessions";
import { hashPassword, verifyPassword } from "../../lib/password";
import { clear, limit } from "../../lib/rate-limit";
import { sendMail } from "../../lib/mail";
import { decryptString, encryptString } from "../../lib/crypto-file";
import { hashRecovery, newRecoveryCodes, newTotpSecret, otpauthUri, verifyTotp } from "../../lib/totp";

const profileSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto.").max(120),
  phone: z.string().trim().max(30).optional(),
  cpf: z.string().trim().max(20).optional(),
  crm: z.string().trim().max(30).optional(),
  specialty: z.string().trim().max(80).optional(),
  institution: z.string().trim().max(120).optional(),
});

const membershipDTO = (m: AuthInfo["memberships"][number]) => ({ organizationId: m.organizationId, organizationName: m.organization.name, role: m.role });

@ApiTags("me")
@Controller("me")
export class MeController {
  @Get()
  me(@Auth() a: AuthInfo): MeDTO {
    return {
      user: toUserDTO(a.user),
      memberships: a.memberships.map(membershipDTO),
      currentOrg: a.currentOrg ? membershipDTO(a.currentOrg) : null,
      adminReady: a.adminReady,
      pendingDoctor: a.pendingDoctor,
    };
  }

  @Patch("profile")
  async profile(@Auth() a: AuthInfo, @Body() body: unknown) {
    const d = parse(profileSchema, body);
    await db.user.update({
      where: { id: a.user.id },
      data: {
        name: d.name,
        phone: d.phone || null,
        cpf: d.cpf || null,
        ...(a.user.role === "DOCTOR" ? { crm: d.crm || null, specialty: d.specialty || null, institution: d.institution || null } : {}),
      },
    });
    return { ok: "Perfil atualizado com sucesso!" };
  }

  @Post("password") @HttpCode(200)
  async password(@Auth() a: AuthInfo, @Body() body: { current?: string; next?: string; next2?: string }) {
    await limit(`password:${a.user.id}`, 5, 15 * 60_000);
    if (!(await verifyPassword(String(body?.current ?? ""), a.user.passwordHash))) fail("Senha atual incorreta.");
    const next = String(body?.next ?? "");
    if (next.length < 8) fail("A nova senha precisa de 8+ caracteres.");
    if (next.length > 200) fail("Senha longa demais.");
    if (next !== body?.next2) fail("As senhas não conferem.");
    await db.user.update({ where: { id: a.user.id }, data: { passwordHash: await hashPassword(next) } });
    // encerra as outras sessões (ex.: um aparelho perdido) e mantém esta
    await revokeSessions(a.user.id, a.sessionId);
    return { ok: "Senha atualizada! As outras sessões abertas foram encerradas." };
  }

  @Get("sessions")
  async sessions(@Auth() a: AuthInfo): Promise<SessionDTO[]> {
    const rows = await db.session.findMany({ where: { userId: a.user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
    return rows.map((s) => ({ id: s.id, current: s.id === a.sessionId, createdAt: s.createdAt.toISOString(), ip: s.ip, userAgent: s.userAgent }));
  }

  @Post("sessions/revoke-others") @HttpCode(200)
  async revokeOthers(@Auth() a: AuthInfo) {
    await revokeSessions(a.user.id, a.sessionId);
    return { ok: "Sessões dos outros aparelhos encerradas." };
  }

  /** Aceite da política para contas anteriores ao registro de consentimento. */
  @Post("consent") @HttpCode(200)
  async consent(@Auth() a: AuthInfo, @Body() body: { consent?: string }) {
    if (body?.consent !== "on") fail("Para continuar, marque o aceite.");
    await db.user.update({ where: { id: a.user.id }, data: { consentAt: new Date(), consentVersion: CONSENT_VERSION } });
    return { ok: "Obrigado." };
  }

  /**
   * Pedido de exclusão (LGPD art. 18, VI). A conta é desativada na hora e a equipe conclui a eliminação no admin,
   * para tratar o que precisa ser guardado por obrigação legal antes de apagar.
   */
  @Roles("DOCTOR", "PATIENT", "SECRETARY")
  @Post("deletion") @HttpCode(200)
  async deletion(@Auth() a: AuthInfo, @Body() body: { password?: string }) {
    if (!(await verifyPassword(String(body?.password ?? ""), a.user.passwordHash))) fail("Senha incorreta.");
    await db.user.update({ where: { id: a.user.id }, data: { deletionRequestedAt: new Date(), active: false } });
    await revokeSessions(a.user.id);
    await sendMail(a.user.email, "Recebemos seu pedido de exclusão", [
      `Olá, ${a.user.name}.`,
      "Sua conta foi desativada e seus dados serão eliminados pela equipe DocDo em até 15 dias. Se não foi você, responda a este e-mail.",
    ]);
    return { ok: "Pedido registrado." };
  }

  /** LGPD (art. 18, II e V): cópia dos dados do titular. Só casos em que ele participa (não todos os da clínica). */
  @Get("export")
  async export(@Auth() a: AuthInfo, @Res() res: Response) {
    const id = a.user.id;
    const cases = await db.case.findMany({
      where: { OR: [{ patientId: id }, { doctorId: id }, { createdById: id }, { shares: { some: { userId: id } } }] },
      include: {
        dicomFiles: { select: { originalName: true, size: true, createdAt: true } },
        models: { select: { name: true, format: true, volumeMl: true, createdAt: true } },
        events: { select: { message: true, createdAt: true } },
        accessLogs: { select: { action: true, createdAt: true, user: { select: { name: true, role: true } } } },
      },
    });
    const orders = await db.order.findMany({ where: { userId: id } });
    const sessions = await db.session.findMany({ where: { userId: id }, select: { createdAt: true, expiresAt: true, ip: true, userAgent: true } });
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: toUserDTO(a.user),
      memberships: a.memberships.map(membershipDTO),
      sessions,
      cases,
      orders,
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="docdo-meus-dados.json"');
    res.send(JSON.stringify(payload, (_, v) => (typeof v === "bigint" ? Number(v) : v), 2));
  }

  // ───── 2FA (obrigatório para admin) ─────

  @Roles("ADMIN") @AdminSetup()
  @Get("2fa")
  async totpStatus(@Auth() a: AuthInfo): Promise<TotpStatusDTO> {
    const u = a.user;
    if (u.totpEnabledAt) return { enabled: true, enabledAt: u.totpEnabledAt.toISOString(), recoveryCodesLeft: u.recoveryCodes.length };
    if (!u.totpSecret) return { enabled: false, pending: false };
    const secret = decryptString(u.totpSecret);
    return { enabled: false, pending: true, secret, qrDataUrl: await QRCode.toDataURL(otpauthUri(secret, u.email), { margin: 1, width: 220 }) };
  }

  /** Gera um segredo novo (cifrado no banco) enquanto o 2FA não está ativo. */
  @Roles("ADMIN") @AdminSetup()
  @Post("2fa/start") @HttpCode(200)
  async totpStart(@Auth() a: AuthInfo) {
    if (a.user.totpEnabledAt) return { ok: "O 2FA já está ativo." };
    await db.user.update({ where: { id: a.user.id }, data: { totpSecret: encryptString(newTotpSecret()) } });
    return { ok: "QR code gerado." };
  }

  @Roles("ADMIN") @AdminSetup()
  @Post("2fa/confirm") @HttpCode(200)
  async totpConfirm(@Auth() a: AuthInfo, @Body() body: { code?: string }): Promise<TotpResult> {
    const u = a.user;
    if (u.totpEnabledAt) fail("O 2FA já está ativo.");
    if (!u.totpSecret) fail("Gere o QR code primeiro.");
    await limit(`2fa-setup:${u.id}`, 10, 15 * 60_000);
    const code = String(body?.code ?? "").replace(/\s/g, "");
    if (!(await verifyTotp(u.id, decryptString(u.totpSecret!), code))) fail("Código inválido. Confira o horário do celular e tente de novo.");
    const codes = newRecoveryCodes();
    await db.user.update({ where: { id: u.id }, data: { totpEnabledAt: new Date(), recoveryCodes: codes.map(hashRecovery) } });
    // sessões abertas antes do 2FA (em outros aparelhos) são encerradas; a atual continua
    await revokeSessions(u.id, a.sessionId);
    await clear(`2fa-setup:${u.id}`);
    return { ok: "2FA ativado.", recoveryCodes: codes };
  }

  @Roles("ADMIN") @AdminSetup()
  @Post("2fa/recovery") @HttpCode(200)
  async totpRecovery(@Auth() a: AuthInfo, @Body() body: { code?: string }): Promise<TotpResult> {
    const u = a.user;
    if (!u.totpEnabledAt || !u.totpSecret) fail("Ative o 2FA primeiro.");
    await limit(`2fa-setup:${u.id}`, 10, 15 * 60_000);
    if (!(await verifyTotp(u.id, decryptString(u.totpSecret!), String(body?.code ?? "").trim()))) fail("Código inválido.");
    const codes = newRecoveryCodes();
    await db.user.update({ where: { id: u.id }, data: { recoveryCodes: codes.map(hashRecovery) } });
    return { ok: "Novos códigos gerados. Os anteriores deixaram de valer.", recoveryCodes: codes };
  }

  /** Trocar de celular: exige o código atual e volta para a configuração com um segredo novo. */
  @Roles("ADMIN") @AdminSetup()
  @Post("2fa/reset") @HttpCode(200)
  async totpReset(@Auth() a: AuthInfo, @Body() body: { code?: string }): Promise<TotpResult> {
    const u = a.user;
    if (!u.totpEnabledAt || !u.totpSecret) fail("O 2FA não está ativo.");
    await limit(`2fa-setup:${u.id}`, 10, 15 * 60_000);
    if (!(await verifyTotp(u.id, decryptString(u.totpSecret!), String(body?.code ?? "").trim()))) fail("Código inválido.");
    await asSystem(() => db.user.update({ where: { id: u.id }, data: { totpEnabledAt: null, recoveryCodes: [], totpSecret: encryptString(newTotpSecret()) } }));
    return { ok: "Escaneie o novo QR code no aparelho novo." };
  }
}
