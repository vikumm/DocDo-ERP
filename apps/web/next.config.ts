import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // o CSP (com nonce por requisição) é definido no middleware
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // o front não acessa banco nem arquivos: só fala com a API
  transpilePackages: ["@docdo/contracts"],
  // dev: permite HMR quando o app é acessado via IP/LAN (QA, celulares na rede local)
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.8.202"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    optimizePackageImports: ["@cornerstonejs/core", "@cornerstonejs/tools", "@cornerstonejs/nifti-volume-loader"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;