import { Controller, Get, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { BffKeyGuard, Public, SessionGuard, SkipBff } from "./common/auth";
import { ContextMiddleware } from "./common/context.middleware";
import { ErrorFilter } from "./common/http";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { MeController } from "./modules/me/me.controller";
import { PublicController } from "./modules/public/public.controller";
import { CasesController, DicomController } from "./modules/cases/cases.controller";
import { CasesService } from "./modules/cases/cases.service";
import { OrgController } from "./modules/org/org.controller";
import { SegmentationController } from "./modules/segmentation/segmentation.controller";
import { SegmentationService } from "./modules/segmentation/segmentation.service";
import { AdminCasesController, AdminController, AdminModelsController, AdminOrdersController, AdminUsersController } from "./modules/admin/admin.controller";

@Controller("health")
class HealthController {
  @Public() @SkipBff() @Get()
  health() {
    return { status: "ok" };
  }
}

@Module({
  controllers: [
    HealthController,
    AuthController,
    MeController,
    PublicController,
    CasesController,
    DicomController,
    OrgController,
    AdminController,
    AdminCasesController,
    AdminModelsController,
    AdminUsersController,
    SegmentationController,
    AdminOrdersController,
  ],
  providers: [
    AuthService,
    CasesService,
    SegmentationService,
    // ordem: chave do front → sessão e perfis
    { provide: APP_GUARD, useClass: BffKeyGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ContextMiddleware).forRoutes("*");
  }
}
