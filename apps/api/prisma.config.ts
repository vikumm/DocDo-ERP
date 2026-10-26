import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Migrações e seed rodam com o papel dono das tabelas (MIGRATE_DATABASE_URL).
// A API em execução usa DATABASE_URL, com o papel docdo_app, sujeito a Row-Level Security.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file=.env prisma/seed.ts",
  },
  datasource: { url: env("MIGRATE_DATABASE_URL") },
});
