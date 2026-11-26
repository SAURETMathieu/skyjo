import path from "node:path";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier/flat";
import tailwindcss from "eslint-plugin-tailwindcss";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "dist/**",
    "**/.cache/**",
    "**/public/**",
    "**/node_modules/**",
    "**/*.esm.js",
    "**/templates/**",
    "**/.next/**",
    "**/.env*",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
  ...nextCoreWebVitals,
  ...tailwindcss.configs["flat/recommended"],
  prettier,
  {
    linterOptions: {
      // Keep intentional eslint-disable comments on files with no current violation
      reportUnusedDisableDirectives: "off",
    },
    settings: {
      tailwindcss: {
        callees: ["cn"],
        config: path.join(import.meta.dirname, "src/app/globals.css"),
      },
      next: {
        rootDir: ["./"],
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "react/jsx-key": "off",
      "tailwindcss/no-custom-classname": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/immutability": "off",
      "react-hooks/globals": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/config": "off",
      "react-hooks/gating": "off",
    },
  },
  {
    files: ["src/hooks/useComponentDebug.tsx"],
    rules: {
      "no-console": "warn",
    },
  },
]);
