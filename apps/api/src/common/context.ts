import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto da requisição, visível em qualquer ponto da chamada (inclusive dentro do cliente do banco).
 * É o que vira o contexto de Row-Level Security de cada transação.
 */
export type ReqCtx = {
  userId: string | null;
  orgIds: string[];
  ownerOrgIds: string[];
  /** ignora o RLS: só admin com 2FA e tarefas internas */
  bypass: boolean;
  clientIp: string | null;
  /** dentro de uma transação que já definiu o contexto */
  inTx?: boolean;
};

export const als = new AsyncLocalStorage<ReqCtx>();

const anonymous = (): ReqCtx => ({ userId: null, orgIds: [], ownerOrgIds: [], bypass: false, clientIp: null });

export const ctx = (): ReqCtx => als.getStore() ?? anonymous();
export const newCtx = anonymous;

/**
 * Executa como sistema (sem RLS). Só para operações internas que precisam enxergar além do usuário.
 * O `await` dentro do run é obrigatório: consultas do Prisma só executam quando aguardadas, e fora
 * daqui rodariam com o contexto de quem chamou.
 */
export const asSystem = <T>(fn: () => Promise<T>): Promise<T> => als.run({ ...ctx(), bypass: true, inTx: false }, async () => await fn());
