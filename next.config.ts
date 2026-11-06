import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Son datos privados que cambian seguido: todo se renderiza por pedido, sin caché.
  cacheComponents: false,
  partialPrefetching: false,
  // Las migraciones se leen al crear el espacio de cada invitado.
  outputFileTracingIncludes: { "/**": ["./drizzle/*.sql"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
