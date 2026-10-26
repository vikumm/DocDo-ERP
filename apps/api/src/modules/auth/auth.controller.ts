import { Body, Controller, Get, Headers, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth, type AuthInfo, Public } from "../../common/auth";
import { fail } from "../../common/http";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post("login") @HttpCode(200)
  login(@Body() body: unknown, @Headers("x-client-ua") ua?: string) {
    return this.auth.login(body, ua);
  }

  @Public() @Post("2fa") @HttpCode(200)
  secondFactor(@Body() body: unknown, @Headers("x-client-ua") ua?: string) {
    return this.auth.secondFactor(body, ua);
  }

  @Public() @Post("register") @HttpCode(200)
  register(@Body() body: unknown) {
    return this.auth.register(body);
  }

  @Public() @Get("tokens/:kind/:token")
  peek(@Param("kind") kind: string, @Param("token") token: string) {
    if (kind !== "verify" && kind !== "password") fail("Não encontrado", 404);
    return this.auth.peek(kind as "verify" | "password", token);
  }

  @Public() @Post("verify") @HttpCode(200)
  verify(@Body() body: unknown, @Headers("x-client-ua") ua?: string) {
    return this.auth.confirmEmail(body, ua);
  }

  @Public() @Post("password/forgot") @HttpCode(200)
  forgot(@Body() body: unknown) {
    return this.auth.forgot(body);
  }

  @Public() @Post("password/reset") @HttpCode(200)
  reset(@Body() body: unknown) {
    return this.auth.resetPassword(body);
  }

  @Post("logout") @HttpCode(200)
  logout(@Auth() a: AuthInfo) {
    return this.auth.logout(a.sessionId);
  }
}
