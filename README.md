# DocDo

SaaS para urologistas: exames de imagem (TC/RM) viram modelos 3D interativos para planejamento cirúrgico,
com clínicas (tenants), médicos, secretárias e pacientes.

Arquitetura e plano de migração: documento "DocDo SaaS — Arquitetura de backend e plano de migração".

## Estrutura

```
apps/web            Next.js 16 — front + BFF. Única peça pública. Não acessa banco nem arquivos.
apps/api            NestJS 11 — API REST /v1 (OpenAPI em /docs em dev). Prisma 7 + PostgreSQL com RLS.
packages/contracts  Tipos e constantes compartilhados (enums, planos, formatos das respostas).
tests/e2e           Testes de ponta a ponta (Chrome): segurança e multi-tenancy.
scripts             Papel restrito do banco, backup e restauração.
```

```
Navegador ──▶ web (Next, BFF) ──x-bff-key + token──▶ api (Nest) ──docdo_app + RLS──▶ PostgreSQL
                                                          └──▶ apps/api/storage (arquivos cifrados AES-256-GCM)
```

- O navegador só fala com o `web`. O token de sessão fica num cookie `httpOnly` e só o `web` o envia à API.
- A API exige a chave interna `x-bff-key` em toda chamada (exceto `/health`) e escuta só em `127.0.0.1`.
- A API conecta ao banco com o papel `docdo_app` (sem superusuário, sem `BYPASSRLS`). Cada consulta define o
  contexto (`app.user_id`, `app.org_ids`, `app.bypass`) e as políticas de Row-Level Security filtram as linhas.
  A API não sobe se o papel ignorar o RLS.

## Rodando localmente

```bash
npm install
cp .env.example .env                              # credenciais do docker-compose
cp apps/api/.env.example apps/api/.env            # gere AUTH_SECRET, STORAGE_KEY, API_BFF_KEY e APP_DB_PASSWORD (openssl rand -hex 32)
cp apps/web/.env.example apps/web/.env            # API_BFF_KEY igual ao da API
npm run setup                                     # Postgres, contratos, migrações, papel docdo_app, dados de exemplo
npm run dev:api                                   # http://127.0.0.1:4005 (OpenAPI em /docs)
npm run dev:web                                   # http://localhost:3005
```

Produção local: `npm run build`, depois `npm run start:api` e `npm run start:web`.

Sem `SMTP_URL`, os e-mails (confirmação, senha, convites) vão para `apps/api/storage/dev-outbox.jsonl`.

| Perfil | E-mail | Senha |
|---|---|---|
| Admin (configura 2FA no primeiro acesso) | admin@docdo.com.br | docdo123 |
| Médico titular | medico@docdo.com.br | docdo123 |
| Secretária (clínica da Dra. Helena) | secretaria@docdo.com.br | docdo123 |
| Paciente | paciente@docdo.com.br | docdo123 |

## Perfis e clínicas

- **Clínica (tenant):** criada quando o médico confirma o cadastro, com ele como titular (`OWNER`).
- **Secretária:** convidada pelo titular em *Equipe*. Vê os casos e pacientes da clínica, cria casos em nome do titular,
  envia DICOM e acompanha o status. **Não** abre o 3D, não lê a descrição clínica e não baixa exames.
- **Médico:** casos da(s) clínica(s) dele. Quem participa de mais de uma clínica troca a clínica atual no menu.
- **Paciente:** os próprios casos, em qualquer clínica.
- **Admin:** suporte, reconstrução 3D, aprovação de médicos, compras e lista de clínicas. 2FA obrigatório.

## Variáveis de ambiente

**apps/api/.env**

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Conexão da API com o papel `docdo_app` (sujeito a RLS) |
| `MIGRATE_DATABASE_URL` | Papel dono das tabelas: só migrações e seed |
| `APP_DB_PASSWORD` | Senha do `docdo_app` (aplicada por `npm run db:app-role`) |
| `API_BFF_KEY` | Chave compartilhada só com o front (32+ caracteres) |
| `AUTH_SECRET` | Assina o desafio do 2FA (32+ caracteres) |
| `STORAGE_KEY` | Chave AES-256 dos arquivos (64 hex). **Sem ela, arquivos e backups não podem ser lidos** |
| `STORAGE_DIR` | Pasta dos arquivos (padrão `./storage`) |
| `APP_URL` | Endereço público do front, usado nos links dos e-mails |
| `SMTP_URL`, `MAIL_FROM` | Envio de e-mail (obrigatório em produção) |
| `HOST`, `PORT` | Endereço da API (padrão `127.0.0.1:4005`) |

**apps/web/.env**: `API_URL`, `API_BFF_KEY` (a mesma da API), `APP_URL`, `TRUST_PROXY` (`1` atrás de proxy reverso confiável:
o IP do cliente é repassado à API para os limites de tentativa e o log de acessos).

Em produção, a API não sobe com SMTP ausente, URL sem https, senha de desenvolvimento no banco ou papel que ignore o RLS.

## Testes

```bash
npm run db:seed && npm run test:security   # 51 verificações: contas, 2FA, sessões, arquivos, LGPD, limites, CSP
npm run db:seed && npm run test:tenancy    # 31 verificações: API isolada, RLS, secretária, convites, isolamento entre clínicas
```

## Planos

| Plano | Valor |
|---|---|
| Rim unilateral | R$ 1.000,00 |
| Bilateral (os dois rins) | R$ 1.500,00 |

Definidos em `packages/contracts/src/constants.ts` (`PLANS`). O valor é gravado no pedido no checkout.

## Visualizador 3D

Camadas por estrutura (cor, opacidade, ocultar, isolar, focar), modo raio-X, corte axial/coronal/sagital, medição em mm,
vista explodida, vistas anatômicas (A/P/D/E/S/I), volume e dimensões por estrutura, captura PNG, tela cheia e atalhos
(`M` medir, `C` corte, `X` explodir, `R` restaurar, `F` tela cheia, `1–6` vistas).

## Backups

```bash
npm run backup                      # pg_dump + arquivos em ./backups/docdo-<data> (inclui papéis, funções e políticas de RLS)
scripts/restore.sh <pasta> teste    # restaura num banco separado para conferir
scripts/restore.sh <pasta>          # restaura por cima (pede confirmação)
```

## Pendências

- Etapas 3 a 6 do plano: agenda e sala de espera, prontuário, portal do paciente e mensagens, worker de imagens.
- Gateway de pagamento real (hoje a confirmação é manual pelo admin).
- Provedor de e-mail (`SMTP_URL`) e domínio remetente (SPF/DKIM).
- Revisão jurídica da Política de Privacidade (`/privacidade`).
- Trocar as credenciais expostas no código do v3/v4 e tirar o v3 do ar.
