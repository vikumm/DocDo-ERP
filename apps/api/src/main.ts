import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { assertEnv } from "./lib/env";
import { base } from "./common/db";

/** O RLS não vale para superusuário nem para quem tem BYPASSRLS: nesse caso a API não sobe. */
async function assertRestrictedDbRole() {
  const [role] = await base.$queryRaw<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
    SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(`O papel do banco "${role?.rolname}" ignora o Row-Level Security. Use o papel docdo_app em DATABASE_URL.`);
  }
}

async function bootstrap() {
  const log = new Logger("API");
  try {
    assertEnv();
    await assertRestrictedDbRole();
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.useBodyParser("json", { limit: "1mb" });
  // tamanhos de arquivo vêm como BigInt do banco
  app.set("json replacer", (_: string, v: unknown) => (typeof v === "bigint" ? Number(v) : v));
  app.setGlobalPrefix("v1", { exclude: ["health"] });

  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder().setTitle("DocDo API").setVersion("1").addBearerAuth().addApiKey({ type: "apiKey", name: "x-bff-key", in: "header" }, "bff").build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 4005);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen(port, host);
  log.log(`API em http://${host}:${port}${process.env.NODE_ENV !== "production" ? " · OpenAPI em /docs" : ""}`);
}

void bootstrap();
