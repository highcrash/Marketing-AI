import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: emits .next/standalone/server.js with a minimal
  // subset of node_modules. We ship that directory to the production
  // droplet instead of the full repo + node_modules, which keeps the
  // deploy under 100 MB on a 512 MB / 10 GB box that's already busy
  // with apache + mysql + sms-gateway.
  output: 'standalone',
  // The standalone build traces dependencies starting from the route
  // files, so files outside web/ that we need at runtime (prisma's
  // .prisma/client schema, lib/*.ts that aren't statically imported,
  // etc.) need to be told about explicitly. The defaults handle the
  // /web/src tree.
  outputFileTracingRoot: undefined,
};

export default nextConfig;
