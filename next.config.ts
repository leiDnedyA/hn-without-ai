import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
