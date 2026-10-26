import bcrypt from "bcryptjs";

const COST = 12;
// hash descartável: comparar contra ele quando o e-mail não existe iguala o tempo de resposta
const DUMMY_HASH = bcrypt.hashSync("docdo-timing-equalizer", COST);

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

/** Sempre executa um bcrypt.compare, exista ou não o usuário, para não revelar e-mails cadastrados pelo tempo. */
export async function verifyPassword(plain: string, hash: string | null | undefined) {
  const ok = await bcrypt.compare(plain, hash || DUMMY_HASH);
  return ok && !!hash;
}
