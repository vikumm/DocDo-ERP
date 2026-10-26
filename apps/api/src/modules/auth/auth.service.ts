import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { Prisma, User } from "@prisma/client";
import { CONSENT_VERSION, type LoginResult, type SessionResult, type TokenInfo } from "@docdo/contracts";
import { db } from "../../common/db";
import { asSystem } from "../../common/context";
import { fail, parse } from "../../common/http";
import { createSession, revokeSessions, sign2faChallenge, verify2faChallenge } from "../../common/sessions";
import { hashPassword, verifyPassword } from "../../lib/password";
import { clear, hit, limit, limitIp, limitIpOrGlobal } from "../../lib/rate-limit";
import { appUrl, sendMail } from "../../lib/mail";
import { consumeToken, issueToken, peekToken } from "../../lib/email-tokens";
import { hashRecovery, verifyTotp } from "../../lib/totp";
import { decryptString } from "../../lib/crypto-file";

const MIN = 60_000;

const registerSchema = z
  .object({
    role: z.enum(["PATIENT", "DOCTOR"]),
    name: z.string().trim().min(3, "Informe seu nome completo.").max(120),
    email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
    phone: z.string().trim().max(30).optional(),
    crm: z.string().trim().max(30).optional(),
    specialty: z.string().trim().max(80).optional(),
    password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(200, "Senha longa demais."),
    password2: z.string(),
    consent: z.literal("on", { message: "Para continuar, aceite a Política de Privacidade." }),
  })
  .refine((d) => d.password === d.password2, { message: "As senhas não conferem.", path: ["password2"] })
  .refine((d) => d.role !== "DOCTOR" || (d.crm && d.crm.length >= 4), { message: "Informe seu CRM.", path: ["crm"] });

type PendingRegistration = { name: string; role: "PATIENT" | "DOCTOR"; phone: string | null; crm: string | null; specialty: string | null; passwordHash: string };
/** Dados do convite de secretária, guardados no token. */
type InviteData = { organizationId?: string };

/** Médico confirmado ganha o próprio consultório (tenant) como titular. */
export async function ensureDoctorOrganization(user: Pick<User, "id" | "name" | "role">) {
  if (user.role !== "DOCTOR") return;
  await asSystem(async () => {
    const has = await db.membership.findFirst({ where: { userId: user.id, role: "OWNER" } });
    if (has) return;
    await db.organization.create({ data: { name: `Consultório de ${user.name}`, memberships: { create: { userId: user.id, role: "OWNER" } } } });
  });
}

@Injectable()
export class AuthService {
  private async sendVerification(user: { id: string; email: string; name: string }, data?: Prisma.InputJsonValue) {
    const token = await issueToken(user.id, "VERIFY", data);
    await sendMail(user.email, "Confirme seu e-mail no DocDo", [`Olá, ${user.name}.`, "Para ativar sua conta, confirme seu e-mail. O link vale por 24 horas."], {
      label: "Confirmar e-mail",
      url: appUrl(`/verificar?token=${token}`),
    });
  }

  // ───── login ─────

  async login(body: unknown, userAgent?: string): Promise<LoginResult> {
    const b = (body ?? {}) as Record<string, unknown>;
    const email = String(b.email ?? "").trim().toLowerCase().slice(0, 254);
    const password = String(b.password ?? "").slice(0, 200);
    // por conta (não burlável trocando de IP) e por IP (força bruta em várias contas)
    await limit(`login:email:${email}`, 5, 15 * MIN);
    await limitIp("login", 30, 15 * MIN);

    return asSystem(async () => {
      const user = await db.user.findUnique({ where: { email } });
      const valid = await verifyPassword(password, user?.passwordHash);
      if (!user || !valid) return fail("E-mail ou senha incorretos.");
      if (!user.active) return fail("Sua conta está desativada. Fale com o suporte.");
      if (!user.emailVerifiedAt) {
        const resend = await hit(`verify-resend:${user.id}`, 3, 60 * MIN);
        if (resend.ok) await this.sendVerification(user);
        return fail("Confirme seu e-mail para entrar. Enviamos um novo link para a sua caixa de entrada.");
      }
      await clear(`login:email:${email}`);
      // segundo fator: a senha só abre a etapa do código
      if (user.totpEnabledAt) return { status: "2fa", challenge: sign2faChallenge(user.id) } as const;
      return { status: "ok", token: await createSession(user.id, userAgent), role: user.role } as const;
    });
  }

  async secondFactor(body: unknown, userAgent?: string): Promise<SessionResult> {
    const b = (body ?? {}) as Record<string, unknown>;
    const userId = verify2faChallenge(String(b.challenge ?? ""));
    if (!userId) fail("A etapa expirou. Entre com e-mail e senha de novo.");
    await limit(`2fa:${userId}`, 5, 15 * MIN);

    return asSystem(async () => {
      const user = await db.user.findUnique({ where: { id: userId! } });
      if (!user?.active || !user.totpSecret || !user.totpEnabledAt) return fail("A etapa expirou. Entre com e-mail e senha de novo.");
      const code = String(b.code ?? "").replace(/\s/g, "");
      let ok = false;
      if (/^\d{6}$/.test(code)) ok = await verifyTotp(user.id, decryptString(user.totpSecret), code);
      else if (code.length >= 10) {
        // código de recuperação: uso único, sai da lista ao ser usado
        const h = hashRecovery(code);
        if (user.recoveryCodes.includes(h)) {
          await db.user.update({ where: { id: user.id }, data: { recoveryCodes: user.recoveryCodes.filter((c) => c !== h) } });
          ok = true;
        }
      }
      if (!ok) return fail("Código inválido.");
      await clear(`2fa:${user.id}`);
      return { token: await createSession(user.id, userAgent), role: user.role };
    });
  }

  // ───── cadastro ─────

  /**
   * A resposta é a mesma exista ou não a conta (não revela e-mails cadastrados).
   * Sobre uma conta não verificada, os dados novos ficam no token e só valem quando o dono do e-mail confirmar.
   */
  async register(body: unknown) {
    await limitIpOrGlobal("register", 5, 200, 60 * MIN);
    const d = parse(registerSchema, body);
    const done = { ok: `Enviamos um link de confirmação para ${d.email}. Abra o e-mail para ativar sua conta.` };
    const perEmail = await hit(`register:email:${d.email}`, 3, 60 * MIN);
    if (!perEmail.ok) return done;

    const pending: PendingRegistration = {
      name: d.name,
      role: d.role,
      phone: d.phone || null,
      crm: d.role === "DOCTOR" ? (d.crm ?? null) : null,
      specialty: d.role === "DOCTOR" ? d.specialty || null : null,
      passwordHash: await hashPassword(d.password),
    };
    await asSystem(async () => {
      const existing = await db.user.findUnique({ where: { email: d.email } });
      if (!existing) {
        // o aceite só é registrado quando o dono do e-mail confirmar
        const user = await db.user.create({ data: { ...pending, email: d.email } });
        await this.sendVerification(user);
      } else if (!existing.emailVerifiedAt) {
        await this.sendVerification(existing, pending);
      } else {
        await sendMail(
          existing.email,
          "Tentativa de cadastro no DocDo",
          [`Olá, ${existing.name}.`, "Alguém tentou criar uma conta com este e-mail, que já está cadastrado. Se foi você, entre normalmente ou redefina a senha."],
          { label: "Redefinir senha", url: appUrl("/recuperar") },
        );
      }
    });
    return done;
  }

  /** Página do link: consulta sem consumir. */
  async peek(kind: "verify" | "password", token: string): Promise<TokenInfo> {
    return asSystem(async () => {
      const row = await peekToken(token, kind === "verify" ? ["VERIFY"] : ["RESET", "INVITE"]);
      if (!row) return fail("Link inválido ou expirado.", 404);
      const orgId = (row.data as InviteData | null)?.organizationId;
      const org = orgId ? await db.organization.findUnique({ where: { id: orgId } }) : null;
      return {
        purpose: row.purpose,
        name: row.user.name,
        email: row.user.email,
        role: row.user.role,
        needsConsent: !row.user.consentAt && row.user.role !== "ADMIN",
        organizationName: org?.name ?? null,
      };
    });
  }

  /** Confirmação por POST (um GET seria consumido por antivírus de e-mail que abrem links). */
  async confirmEmail(body: unknown, userAgent?: string): Promise<SessionResult> {
    return asSystem(async () => {
      const row = await consumeToken(String((body as { token?: string })?.token ?? ""), ["VERIFY"]);
      if (!row) return fail("Link inválido ou expirado. Entre com seu e-mail e senha para receber um novo.");
      const p = (row.data ?? null) as PendingRegistration | null;

      // o cadastro exige o aceite da política; ele passa a valer agora, com o e-mail comprovado
      let data: Prisma.UserUpdateInput = { emailVerifiedAt: new Date(), consentAt: new Date(), consentVersion: CONSENT_VERSION };
      if (p) {
        // o perfil só muda se a conta ainda não tem casos nem clínica (ex.: paciente cadastrado pelo médico continua paciente)
        const linked =
          (await db.case.count({ where: { OR: [{ patientId: row.userId }, { doctorId: row.userId }, { shares: { some: { userId: row.userId } } }] } })) +
          (await db.membership.count({ where: { userId: row.userId } }));
        data = { ...data, name: p.name, phone: p.phone, passwordHash: p.passwordHash, ...(linked ? {} : { role: p.role, crm: p.crm, specialty: p.specialty }) };
      }
      const user = await db.user.update({ where: { id: row.userId }, data });
      await ensureDoctorOrganization(user);
      await revokeSessions(user.id);
      return { token: await createSession(user.id, userAgent), role: user.role };
    });
  }

  // ───── senha ─────

  async forgot(body: unknown) {
    const email = String((body as { email?: string })?.email ?? "").trim().toLowerCase().slice(0, 254);
    const done = { ok: "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale por 1 hora." };
    await limitIpOrGlobal("reset", 10, 300, 60 * MIN);
    if (!z.string().email().safeParse(email).success) fail("E-mail inválido.");
    const perEmail = await hit(`reset:email:${email}`, 3, 60 * MIN);
    if (!perEmail.ok) return done;
    await asSystem(async () => {
      const user = await db.user.findUnique({ where: { email } });
      if (!user?.active) return;
      const token = await issueToken(user.id, "RESET");
      await sendMail(user.email, "Redefinição de senha do DocDo", [`Olá, ${user.name}.`, "Recebemos um pedido para redefinir sua senha. O link vale por 1 hora e só pode ser usado uma vez."], {
        label: "Definir nova senha",
        url: appUrl(`/redefinir?token=${token}`),
      });
    });
    return done;
  }

  /** Serve para redefinição e para convites (paciente criado pelo médico, secretária, conta criada pelo admin). */
  async resetPassword(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const password = String(b.password ?? "");
    if (password.length < 8) fail("A senha precisa de pelo menos 8 caracteres.");
    if (password.length > 200) fail("Senha longa demais.");
    if (password !== b.password2) fail("As senhas não conferem.");

    return asSystem(async () => {
      const row = await consumeToken(String(b.token ?? ""), ["RESET", "INVITE"]);
      if (!row) return fail("Link inválido ou expirado. Peça um novo em “Esqueci minha senha”.");
      const needsConsent = !row.user.consentAt && row.user.role !== "ADMIN";
      if (needsConsent && b.consent !== "on") {
        // devolve o token: o usuário só esqueceu de marcar o aceite
        await db.emailToken.update({ where: { id: row.id }, data: { usedAt: null } });
        return fail("Para continuar, aceite a Política de Privacidade.");
      }
      const user = await db.user.update({
        where: { id: row.userId },
        data: {
          passwordHash: await hashPassword(password),
          emailVerifiedAt: row.user.emailVerifiedAt ?? new Date(), // quem abriu o link provou ter acesso ao e-mail
          ...(needsConsent ? { consentAt: new Date(), consentVersion: CONSENT_VERSION } : {}),
        },
      });
      await ensureDoctorOrganization(user);
      await revokeSessions(row.userId);
      await clear(`login:email:${row.user.email}`);
      return { ok: "Senha definida." };
    });
  }

  async logout(sessionId: string) {
    await asSystem(() => db.session.deleteMany({ where: { id: sessionId } }));
    return { ok: "Até logo." };
  }
}
