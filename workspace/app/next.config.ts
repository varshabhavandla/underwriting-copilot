import type { NextConfig } from "next";

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // not no-referrer: browsers then send Origin: null on form posts and Next rejects every server action
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // API responses are data only: nothing may be loaded or framed from them
      { source: "/api/(.*)", headers: [...common, { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }, { key: "Cache-Control", value: "no-store" }] },
      // Pages: a nonce-based script policy needs a request proxy (B-133); until then restrict what does not need inline scripts
      { source: "/((?!api/).*)", headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default config;
