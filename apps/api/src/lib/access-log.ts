import type { AccessAction } from "@prisma/client";
import { db } from "../common/db";
import { clientIp } from "./rate-limit";

/**
 * LGPD: registra quem abriu ou baixou cada exame. Visualizações repetidas da mesma pessoa
 * em 30 minutos contam uma vez só; downloads são sempre registrados.
 */
export async function logAccess(userId: string, caseId: string, action: AccessAction, detail?: string) {
  if (action !== "DOWNLOAD_DICOM") {
    const recent = await db.accessLog.findFirst({ where: { userId, caseId, action, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } }, select: { id: true } });
    if (recent) return;
  }
  await db.accessLog.create({ data: { userId, caseId, action, detail: detail?.slice(0, 255), ip: clientIp() } });
}
