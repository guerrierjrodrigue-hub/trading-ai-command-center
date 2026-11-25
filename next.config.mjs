/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // No next/image usage in the app. Disabling the optimizer removes the
  // /_next/image attack surface entirely (several known CVEs target it on
  // self-hosted Next). Safe: nothing relies on image optimization here.
  images: {
    unoptimized: true,
  },
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
