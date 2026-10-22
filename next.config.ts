import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pacotes nativos/binários que não devem ser empacotados pelo bundler.
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
  experimental: {
    serverActions: {
      // Importações do Bizagi enviam JSON (até 20 MB) + SVG (até 10 MB) numa única Server Action.
      bodySizeLimit: "30mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
