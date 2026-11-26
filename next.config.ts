import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const appDir = import.meta.dirname;
const monorepoRoot = path.join(appDir, "..");
const projectRoot = existsSync(path.join(monorepoRoot, "node_modules"))
  ? monorepoRoot
  : appDir;

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  transpilePackages: [
    "@SAURETMathieu/ui",
    "@SAURETMathieu/icons",
    "@SAURETMathieu/context",
    "@SAURETMathieu/utils",
    "@SAURETMathieu/hooks",
  ],
};

export default nextConfig;
