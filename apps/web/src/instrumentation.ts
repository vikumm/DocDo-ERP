export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("./lib/env");
    try {
      assertEnv();
    } catch (e) {
      // configuração insegura: não sobe o servidor
      console.error((e as Error).message);
      process.exit(1);
    }
  }
}
