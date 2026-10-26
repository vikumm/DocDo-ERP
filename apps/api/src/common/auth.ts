import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { Membership, Organization, Role, User } from "@prisma/client";
import { db } from "./db";
import { asSystem, ctx } from "./context";
import { fail } from "./http";

export type AuthInfo = {
  user: User;
  sessionId: string;
  memberships: (Membership & { organization: Organization })[];
  currentOrg: (Membership & { organization: Organization }) | null;
  adminReady: boolean;
  pendingDoctor: boolean;
};
export type AuthedRequest = Request & { auth?: AuthInfo };

const PUBLIC = "docdo:public";
const ROLES = "docdo:roles";
const SKIP_BFF = "docdo:skip-bff";
const ADMIN_SETUP = "docdo:admin-setup";

/** Rota sem sessão obrigatória (se houver sessão, ela é carregada mesmo assim). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Perfis aceitos na rota. ADMIN exige 2FA ativo. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Rota de configuração do 2FA: o admin entra nela antes de ter o 2FA ativo. */
export const AdminSetup = () => SetMetadata(ADMIN_SETUP, true);
/** Só para o health check do orquestrador. */
export const SkipBff = () => SetMetadata(SKIP_BFF, true);

export const Auth = createParamDecorator((_: unknown, c: ExecutionContext) => (c.switchToHttp().getRequest() as AuthedRequest).auth!);
export const OptionalAuth = createParamDecorator((_: unknown, c: ExecutionContext) => (c.switchToHttp().getRequest() as AuthedRequest).auth ?? null);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Só o front (BFF) conhece a chave. Só com ela a API confia no IP repassado em x-client-ip. */
@Injectable()
export class BffKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(c: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(SKIP_BFF, [c.getHandler(), c.getClass()])) return true;
    const req = c.switchToHttp().getRequest<Request>();
    const got = Buffer.from(String(req.headers["x-bff-key"] ?? ""));
    const want = Buffer.from(process.env.API_BFF_KEY ?? "");
    if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) fail("Não autorizado", HttpStatus.UNAUTHORIZED);
    const ip = String(req.headers["x-client-ip"] ?? "").trim();
    ctx().clientIp = /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
    return true;
  }
}

/** Carrega a sessão (token opaco → hash → tabela Session), os vínculos e monta o contexto de RLS. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest<AuthedRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, [c.getHandler(), c.getClass()]);
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [c.getHandler(), c.getClass()]);
    const adminSetup = this.reflector.getAllAndOverride<boolean>(ADMIN_SETUP, [c.getHandler(), c.getClass()]);

    const header = String(req.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token && token.length <= 100) req.auth = (await resolveSession(token, String(req.headers["x-org-id"] ?? ""))) ?? undefined;

    if (!req.auth) {
      if (isPublic) return true;
      fail("Sessão expirada", HttpStatus.UNAUTHORIZED);
    }
    const a = req.auth!;
    const store = ctx();
    store.userId = a.user.id;
    store.orgIds = a.memberships.map((m) => m.organizationId);
    store.ownerOrgIds = a.memberships.filter((m) => m.role === "OWNER").map((m) => m.organizationId);
    store.bypass = a.adminReady;

    if (roles?.length) {
      if (!roles.includes(a.user.role)) fail("Sem permissão", HttpStatus.FORBIDDEN);
      if (a.user.role === "ADMIN" && !a.adminReady && !adminSetup) fail("Ative a verificação em duas etapas", HttpStatus.FORBIDDEN);
    }
    return true;
  }
}

async function resolveSession(token: string, wantedOrg: string): Promise<AuthInfo | null> {
  return asSystem(async () => {
    const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!s || s.expiresAt < new Date() || !s.user.active || !s.user.emailVerifiedAt) return null;
    const memberships = await db.membership.findMany({ where: { userId: s.userId }, include: { organization: true }, orderBy: { createdAt: "asc" } });
    const currentOrg = memberships.find((m) => m.organizationId === wantedOrg) ?? memberships[0] ?? null;
    return {
      user: s.user,
      sessionId: s.id,
      memberships,
      currentOrg,
      adminReady: s.user.role === "ADMIN" && !!s.user.totpEnabledAt,
      pendingDoctor: s.user.role === "DOCTOR" && !s.user.approvedAt,
    };
  });
}
