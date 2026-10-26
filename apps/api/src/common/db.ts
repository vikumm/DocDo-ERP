import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { als, ctx, type ReqCtx } from "./context";

/** Conexão com o papel docdo_app: sem superusuário, sujeito a Row-Level Security. */
export const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// set_config(..., true) vale só até o fim da transação: nada vaza entre requisições no pool
const setContext = (c: ReqCtx, client: Pick<PrismaClient, "$executeRaw"> = base) =>
  client.$executeRaw`SELECT
    set_config('app.user_id', ${c.userId ?? ""}, true),
    set_config('app.org_ids', ${c.orgIds.join(",")}, true),
    set_config('app.owner_org_ids', ${c.ownerOrgIds.join(",")}, true),
    set_config('app.bypass', ${c.bypass ? "on" : ""}, true)`;

/**
 * Cliente usado pela aplicação: cada operação roda numa transação que primeiro define o contexto.
 * Dentro de rlsTx o contexto já está definido e a operação passa direto.
 */
export const db = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const c = ctx();
        if (c.inTx) return query(args);
        const [, result] = await base.$transaction([setContext(c), query(args)]);
        return result;
      },
    },
  },
});

/**
 * Transação com várias operações sob o mesmo contexto. Use o `tx` recebido: o `db` dentro dela
 * roda fora da transação e, sem contexto, o banco nega (falha fechada).
 */
export function rlsTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const c = ctx();
  return base.$transaction(async (tx) => {
    await setContext(c, tx);
    return als.run({ ...c, inTx: true }, async () => await fn(tx));
  });
}
