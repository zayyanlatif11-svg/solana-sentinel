import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@sat/shared",
    "@sat/database",
    "@sat/pipeline",
    "@sat/market-data",
    "@sat/solana",
    "@sat/discovery",
    "@sat/signals",
    "@sat/token-risk",
    "@sat/policy-engine",
    "@sat/research-agent",
    "@sat/risk-engine",
    "@sat/portfolio",
    "@sat/execution",
    "@sat/paper-trading",
    "@sat/analytics",
    "@sat/experiments",
  ],
  serverExternalPackages: [],
};

export default nextConfig;
