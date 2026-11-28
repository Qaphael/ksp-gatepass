import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client — do not lint generated code.
    "src/generated/**",
    // Installed ReUI / shadcn registry primitives — do not modify or lint upstream code.
    "src/components/reui/**",
    "src/hooks/use-mobile.ts",
  ]),
]);

export default eslintConfig;
