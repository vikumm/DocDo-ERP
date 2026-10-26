import { Body, Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { EXAM_LABEL, type FeaturedDTO, type GalleryCaseDTO, type ViewerDTO } from "@docdo/contracts";
import { OptionalAuth, type AuthInfo, Public } from "../../common/auth";
import { db } from "../../common/db";
import { asSystem } from "../../common/context";
import { fail, parse } from "../../common/http";
import { toViewerModels } from "../../common/dto";
import { hasClinicalAccess } from "../../common/access";
import { logAccess } from "../../lib/access-log";
import { limitIpOrGlobal } from "../../lib/rate-limit";
import { openFile } from "../../lib/storage";

const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Preencha o campo do nome!").max(120),
    email: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(30).optional(),
    message: z.string().trim().min(5, "Preencha o campo da mensagem!").max(5000, "Mensagem longa demais."),
  })
  .refine((d) => d.email || d.phone, { message: "Preencha o campo do e-mail ou telefone!" });

const caseCode = (code: number) => `DD-${String(code).padStart(5, "0")}`;

const MODEL_TYPES: Record<string, string> = { stl: "model/stl", obj: "model/obj", ply: "application/octet-stream", glb: "model/gltf-binary" };

@ApiTags("public")
@Controller()
export class PublicController {
  /** Casos publicados pelo admin. Nunca expõe título/descrição internos (podem conter dados do paciente). */
  @Public() @Get("public/gallery")
  async gallery(): Promise<GalleryCaseDTO[]> {
    const cases = await db.case.findMany({
      where: { isPublic: true, models: { some: {} } },
      orderBy: [{ views: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        publicTitle: true,
        publicDescription: true,
        examType: true,
        bodyRegion: true,
        views: true,
        models: { select: { name: true, color: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    return cases.map((c) => ({ id: c.id, title: c.publicTitle ?? "Caso clínico", description: c.publicDescription, examType: c.examType, bodyRegion: c.bodyRegion, views: c.views, models: c.models }));
  }

  @Public() @Get("public/featured")
  async featured(): Promise<FeaturedDTO> {
    const c = await db.case.findFirst({ where: { isPublic: true, models: { some: {} } }, orderBy: { views: "desc" }, include: { models: { orderBy: { sortOrder: "asc" } } } });
    return c ? { id: c.id, title: c.publicTitle ?? "Caso clínico", models: toViewerModels(c.models) } : null;
  }

  @Public() @Post("public/contact") @HttpCode(200)
  async contact(@Body() body: unknown) {
    await limitIpOrGlobal("contact", 5, 100, 60 * 60_000);
    const d = parse(contactSchema, body);
    await db.contactMessage.create({ data: { ...d, email: d.email || null, phone: d.phone || null } });
    return { ok: "Mensagem enviada! Respondemos em até 24h úteis." };
  }

  /**
   * Visualizador: caso publicado (qualquer pessoa) ou acesso clínico. Sem sessão num caso privado → 401
   * (o front manda para o login); sessão sem acesso → 404.
   */
  @Public() @Get("viewer/:id")
  async viewer(@OptionalAuth() a: AuthInfo | null, @Param("id") id: string): Promise<ViewerDTO> {
    const c = await asSystem(() => db.case.findUnique({ where: { id }, include: { models: { orderBy: { sortOrder: "asc" } } } }));
    if (!c) fail("Não encontrado", 404);
    const access = a ? await hasClinicalAccess(a, c!) : false;
    if (!c!.isPublic && !access) fail(a ? "Não encontrado" : "Entre para ver este caso", a ? 404 : 401);
    if (c!.isPublic && !access) await asSystem(() => db.case.update({ where: { id }, data: { views: { increment: 1 } } }));
    // a galeria pública é anonimizada; registramos o acesso de quem participa do caso
    if (access && a) await logAccess(a.user.id, c!.id, "VIEW_3D");
    return {
      id: c!.id,
      // quem não participa do caso só vê os dados públicos
      title: access ? c!.title : (c!.publicTitle ?? "Caso clínico"),
      subtitle: access ? `${caseCode(c!.code)} · ${EXAM_LABEL[c!.examType]}` : `${EXAM_LABEL[c!.examType]}${c!.bodyRegion ? ` · ${c!.bodyRegion}` : ""}`,
      models: toViewerModels(c!.models),
      back: !access ? "/galeria" : a!.user.role === "ADMIN" ? `/admin/casos/${c!.id}` : `/painel/casos/${c!.id}`,
    };
  }

  /** Modelo 3D (decifrado em streaming): caso publicado ou acesso clínico. */
  @Public() @Get("files/models/:id")
  async model(@OptionalAuth() a: AuthInfo | null, @Param("id") id: string, @Res() res: Response) {
    const m = await asSystem(() => db.model3D.findUnique({ where: { id }, include: { case: true } }));
    if (!m) fail("Não encontrado", 404);
    if (!m!.case.isPublic && !(a && (await hasClinicalAccess(a, m!.case)))) fail("Não encontrado", 404);
    const { stream, size } = await openFile(m!.storageKey);
    res.setHeader("Content-Type", MODEL_TYPES[m!.format] ?? "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", m!.case.isPublic ? "public, max-age=3600" : "private, no-store");
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }
}
