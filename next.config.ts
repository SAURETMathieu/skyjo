import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..");

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  transpilePackages: [
    "@SAURETMathieu/ui",
    "@SAURETMathieu/icons",
    "@SAURETMathieu/context",
    "@SAURETMathieu/utils",
    "@SAURETMathieu/hooks",
    "@SAURETMathieu/devtools",
    "@SAURETMathieu/stores",
    "@SAURETMathieu/csv-import",
    "@SAURETMathieu/fields",
    "@SAURETMathieu/rhf-fields",
    "@SAURETMathieu/rbac-admin",
    "@SAURETMathieu/tables",
    "@SAURETMathieu/advanced-tables",
  ],
};

export default nextConfig;
