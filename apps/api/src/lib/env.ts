/** Build de produção rodando na própria máquina (APP_URL em localhost), usado para testes locais. */
export const isLocalApp = () => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(process.env.APP_URL ?? "");

/** Falha cedo, na subida do servidor, se a configuração de produção estiver insegura ou incompleta. */
export function assertEnv() {
  const errors: string[] = [];
  const env = process.env;
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) errors.push("AUTH_SECRET precisa de 32+ caracteres.");
  if (!/^[0-9a-f]{64}$/i.test(env.STORAGE_KEY ?? "")) errors.push("STORAGE_KEY precisa ter 64 caracteres hex (openssl rand -hex 32).");
  if (!env.APP_URL) errors.push("APP_URL é obrigatória (usada nos links dos e-mails).");
  if (!env.API_BFF_KEY || env.API_BFF_KEY.length < 32) errors.push("API_BFF_KEY precisa de 32+ caracteres (chave compartilhada só com o front).");
  if (!env.DATABASE_URL) errors.push("DATABASE_URL é obrigatória (papel docdo_app).");

  // build de produção rodando na própria máquina (APP_URL em localhost): só avisa, para permitir testes locais
  const local = isLocalApp();
  const prodErrors: string[] = [];
  if (env.NODE_ENV === "production") {
    if (!env.APP_URL?.startsWith("https://")) prodErrors.push("APP_URL precisa ser https:// em produção.");
    if (!env.SMTP_URL) prodErrors.push("SMTP_URL é obrigatória em produção (verificação de e-mail e recuperação de senha).");
    if (/docdo:docdo@/.test(env.DATABASE_URL ?? "")) prodErrors.push("DATABASE_URL usa a senha de desenvolvimento (docdo/docdo).");
    if (!/\/\/docdo_app:/.test(env.DATABASE_URL ?? "")) prodErrors.push("DATABASE_URL precisa usar o papel docdo_app (o RLS não vale para o dono das tabelas).");
    if (env.HOST && env.HOST !== "127.0.0.1" && env.HOST !== "::1" && env.ALLOW_PRIVATE_BIND !== "1") prodErrors.push("A API deve escutar só na rede interna (HOST=127.0.0.1, ou ALLOW_PRIVATE_BIND=1 numa rede privada).");
    if (/troque|example|changeme/i.test(env.AUTH_SECRET ?? "")) prodErrors.push("AUTH_SECRET ainda é o valor de exemplo.");
  }
  if (local && prodErrors.length) console.warn(`[env] build de produção em localhost, ignorando:\n- ${prodErrors.join("\n- ")}`);
  else errors.push(...prodErrors);
  if (errors.length) throw new Error(`Configuração inválida:\n- ${errors.join("\n- ")}`);
}
