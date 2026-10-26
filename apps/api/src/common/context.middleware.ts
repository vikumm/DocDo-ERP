import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { als, newCtx } from "./context";

/** Abre o contexto da requisição; os guards o preenchem e ele acompanha toda a chamada. */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    als.run(newCtx(), () => next());
  }
}
