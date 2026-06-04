/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // @clickhouse/client is a server-only Node dependency; keep it external so the
    // bundler never tries to pull it into the client bundle (Next 14.2 key).
    serverComponentsExternalPackages: ['@clickhouse/client'],
  },
};

export default nextConfig;
