import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import busboy from "busboy";
import { Auth, type AuthInfo, Roles } from "../../common/auth";
import { db } from "../../common/db";
import { fail } from "../../common/http";
import { canOperate, findCase, hasClinicalAccess } from "../../common/access";
import { logAccess } from "../../lib/access-log";
import { deleteFile, openFile, saveStream } from "../../lib/storage";
import { CasesService } from "./cases.service";

const MAX_FILE = 2 * 1024 * 1024 * 1024; // 2 GB por arquivo: o envio é em streaming, não ocupa memória
const MAX_FILES = 500;

/** DICOM tem "DICM" no byte 128; também aceitamos .zip (pasta exportada do PACS). */
const kindOf = (head: Buffer, name: string) => {
  if (head.length >= 132 && head.subarray(128, 132).toString("latin1") === "DICM") return "application/dicom";
  if (head[0] === 0x50 && head[1] === 0x4b) return "application/zip";
  return /\.(dcm|dicom|ima)$/i.test(name) ? "application/dicom" : null;
};

@ApiTags("cases")
@Roles("DOCTOR", "PATIENT", "SECRETARY")
@Controller("cases")
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  list(@Auth() a: AuthInfo, @Query("status") status?: string, @Query("q") q?: string) {
    return this.cases.list(a, status, q);
  }

  @Post() @HttpCode(200)
  create(@Auth() a: AuthInfo, @Body() body: unknown) {
    return this.cases.create(a, body);
  }

  @Get(":id")
  detail(@Auth() a: AuthInfo, @Param("id") id: string) {
    return this.cases.detail(a, id);
  }

  @Post(":id/shares") @HttpCode(200)
  share(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: { email?: string }) {
    return this.cases.share(a, id, body);
  }

  @Delete(":id/shares/:userId")
  unshare(@Auth() a: AuthInfo, @Param("id") id: string, @Param("userId") userId: string) {
    return this.cases.unshare(a, id, userId);
  }

  @Post(":id/checkout") @HttpCode(200)
  checkout(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: { plan?: string; method?: string }) {
    return this.cases.checkout(a, id, body);
  }

  @Delete(":id/dicom/:fileId")
  deleteDicom(@Auth() a: AuthInfo, @Param("id") id: string, @Param("fileId") fileId: string) {
    return this.cases.deleteDicom(a, id, fileId);
  }
}

/** Upload e download de DICOM: fluxos de arquivo, fora do JSON. Também usado pelo admin. */
@ApiTags("files")
@Roles("DOCTOR", "PATIENT", "SECRETARY", "ADMIN")
@Controller()
export class DicomController {
  @Post("cases/:id/dicom") @HttpCode(200)
  async upload(@Auth() a: AuthInfo, @Param("id") id: string, @Req() req: Request) {
    const c = await findCase(a, id);
    if (!c || !(await canOperate(a, c))) fail("Caso não encontrado", 404);
    if (!a.adminReady && !["CREATED", "UPLOADED"].includes(c!.status)) fail("Este caso já está em processamento e não aceita novos arquivos.", 409);
    if (!String(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) fail("Envio inválido");

    const saved: { key: string; name: string; size: number; mime: string }[] = [];
    const skipped: string[] = [];
    let tooBig: string | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_FILE, files: MAX_FILES, fields: 0 } });
        const pending: Promise<void>[] = [];
        bb.on("file", (field, stream, info) => {
          if (field !== "files") return void stream.resume();
          const name = (info.filename || "arquivo").slice(0, 255);
          pending.push(
            (async () => {
              const r = await saveStream(`cases/${c!.id}/dicom`, name, stream);
              const mime = kindOf(r.head, name);
              // estourou o limite ou não é DICOM/ZIP (pastas de CD trazem visualizadores, DICOMDIR etc.): descarta
              if ((stream as unknown as { truncated?: boolean }).truncated) {
                tooBig = name;
                await deleteFile(r.key);
              } else if (!mime || r.size === 0) {
                skipped.push(name);
                await deleteFile(r.key);
              } else saved.push({ key: r.key, name, size: r.size, mime });
            })(),
          );
        });
        bb.on("filesLimit", () => reject(new Error(`Máximo de ${MAX_FILES} arquivos por envio.`)));
        bb.on("error", reject);
        bb.on("close", () => Promise.all(pending).then(() => resolve(), reject));
        req.pipe(bb);
      });
    } catch (e) {
      await Promise.all(saved.map((s) => deleteFile(s.key)));
      fail((e as Error).message || "Falha no envio");
    }
    if (tooBig) {
      await Promise.all(saved.map((s) => deleteFile(s.key)));
      fail(`${tooBig}: excede 2 GB`, 413);
    }

    const files = [];
    for (const s of saved) {
      files.push(
        await db.dicomFile.create({
          data: { caseId: c!.id, originalName: s.name, storageKey: s.key, size: s.size, mimeType: s.mime, uploadedById: a.user.id },
          select: { id: true, originalName: true },
        }),
      );
    }
    if (files.length && c!.status === "CREATED") {
      await db.case.update({ where: { id: c!.id }, data: { status: "UPLOADED" } });
      await db.caseEvent.create({ data: { caseId: c!.id, userId: a.user.id, message: "DICOM enviado" } });
    }
    return { files, skipped };
  }

  /** Download: só acesso clínico (a secretária não baixa exames). Sempre registrado no log de acessos. */
  @Get("files/dicom/:id")
  async download(@Auth() a: AuthInfo, @Param("id") id: string, @Res() res: Response) {
    const file = await db.dicomFile.findUnique({ where: { id }, include: { case: true } });
    if (!file || !(await hasClinicalAccess(a, file.case))) fail("Não encontrado", 404);
    await logAccess(a.user.id, file!.caseId, "DOWNLOAD_DICOM", file!.originalName);
    const { stream, size } = await openFile(file!.storageKey);
    const zip = file!.mimeType === "application/zip";
    // tipo fixo (nunca o declarado no upload) + nosniff: o navegador baixa, nunca renderiza
    res.setHeader("Content-Type", zip ? "application/zip" : "application/dicom");
    res.setHeader("Content-Length", String(size));
    res.setHeader("Content-Disposition", `attachment; filename="exame.${zip ? "zip" : "dcm"}"; filename*=UTF-8''${encodeURIComponent(file!.originalName)}`);
    res.setHeader("Cache-Control", "private, no-store");
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }
}
