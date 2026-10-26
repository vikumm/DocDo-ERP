/** Build de produção rodando na própria máquina (APP_URL em localhost), usado para testes locais. */
export const isLocalApp = () => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(process.env.APP_URL ?? "");

/** O front só precisa saber onde está a API e a chave para falar com ela. */
export function assertEnv() {
  const errors: string[] = [];
  const env = process.env;
  if (!env.API_URL) errors.push("API_URL é obrigatória.");
  if (!env.API_BFF_KEY || env.API_BFF_KEY.length < 32) errors.push("API_BFF_KEY precisa de 32+ caracteres (a mesma da API).");
  if (env.NODE_ENV === "production" && !isLocalApp() && !env.APP_URL?.startsWith("https://")) errors.push("APP_URL precisa ser https:// em produção.");
  if (errors.length) throw new Error(`Configuração inválida:\n- ${errors.join("\n- ")}`);
}
