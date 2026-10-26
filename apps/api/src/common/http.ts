import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { ZodType } from "zod";

/** Erro de negócio: vira { error } com o status dado. */
export class Fail extends HttpException {
  constructor(message: string, status: number = HttpStatus.BAD_REQUEST) {
    super({ error: message }, status);
  }
}

export const fail = (message: string, status?: number): never => {
  throw new Fail(message, status);
};

/** Valida a entrada com Zod; a primeira mensagem vira o erro 400. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new Fail(r.error.issues[0]?.message ?? "Dados inválidos");
  return r.data;
}

export const tooMany = (retryAfter: number): never =>
  fail(`Muitas tentativas. Tente novamente em ${Math.max(1, Math.ceil(retryAfter / 60))} min.`, HttpStatus.TOO_MANY_REQUESTS);

/** Toda resposta de erro sai como { error: string }; erros inesperados não expõem detalhes. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger("API");
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return void res.end();
    if (err instanceof HttpException) {
      const body = err.getResponse();
      const error = typeof body === "object" && body && "error" in body ? (body as { error: string }).error : err.message;
      res.status(err.getStatus()).json({ error: typeof error === "string" ? error : "Erro" });
      return;
    }
    this.log.error(err instanceof Error ? err.stack : String(err));
    res.status(500).json({ error: "Erro interno" });
  }
}
