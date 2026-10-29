import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Auth, type AuthInfo, Roles } from "../../common/auth";
import { SegmentationService } from "./segmentation.service";

/**
 * Proxy para o serviço de segmentação (rede interna, sem autenticação própria).
 * O navegador nunca fala com o serviço: passa pelo BFF do web e por aqui.
 */
@ApiTags("segmentation")
@Roles("DOCTOR", "PATIENT", "SECRETARY", "ADMIN")
@Controller("segmentation")
export class SegmentationController {
  constructor(private readonly seg: SegmentationService) {}

  @Post("sessions") @HttpCode(201)
  create(@Auth() a: AuthInfo, @Body() body: { caseId?: string }) {
    return this.seg.createSession(a, body?.caseId);
  }

  /** NIfTI em multipart: o fluxo segue direto ao serviço, sem buffering. */
  @Post("sessions/:id/volume") @HttpCode(200)
  async volume(@Auth() a: AuthInfo, @Param("id") id: string, @Req() req: Request) {
    await this.seg.requireSession(a, id);
    await this.seg.uploadVolume(id, req);
    return { ok: true };
  }

  @Get("sessions/:id/jobs")
  jobs(@Auth() a: AuthInfo, @Param("id") id: string) {
    return this.seg.listJobs(a, id);
  }

  @Post("sessions/:id/jobs") @HttpCode(201)
  createJob(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: unknown) {
    return this.seg.createJob(a, id, body);
  }

  @Post("sessions/:id/feedback") @HttpCode(200)
  async feedback(@Auth() a: AuthInfo, @Param("id") id: string, @Req() req: Request) {
    await this.seg.requireSession(a, id);
    return this.seg.feedback(id, req);
  }

  @Get("sessions/:id/volume")
  volumeDownload(@Auth() a: AuthInfo, @Param("id") id: string, @Res() res: Response) {
    return this.seg.download(a, id, "volume", res);
  }

  @Get("sessions/:id/labelmap")
  labelmap(@Auth() a: AuthInfo, @Param("id") id: string, @Res() res: Response) {
    return this.seg.download(a, id, "labelmap", res);
  }

  @Post("sessions/:id/save-to-case") @HttpCode(200)
  saveToCase(@Auth() a: AuthInfo, @Param("id") id: string, @Body() body: { caseId?: string }) {
    return this.seg.saveToCase(a, id, body?.caseId);
  }
}
