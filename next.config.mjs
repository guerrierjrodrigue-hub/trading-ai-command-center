/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a minimal standalone server for small Docker images.
  output: "standalone",
  eslint: {
    // Do not fail the production build on lint warnings; lint runs separately in CI.
    ignoreDuringBuilds: true,
  },
  // Enables src/instrumentation.ts (starts the autonomous bot scheduler on boot).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
