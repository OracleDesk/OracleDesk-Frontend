import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// React Compiler lint plugin (issue #152). Install with:
//   npm install --save-dev eslint-plugin-react-compiler
// When the package is not present the import resolves to null and the rules
// block below is skipped, so the build does not break before the package is
// added. Remove the null-check once the package is in package.json.
let reactCompilerPlugin: import("eslint").ESLint.Plugin | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  reactCompilerPlugin = require("eslint-plugin-react-compiler");
} catch {
  // package not yet installed — skip
}

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
    // Submodule and generated code are not ours to lint.
    "contracts/**",
    "lib/stellar/generated/**",
  ]),
  // React Compiler rules: fail on any new Rules-of-React violation.
  // Directories opted out of the compiler (see next.config.ts) are also
  // excluded here so the lint and compile exclusions stay in sync.
  ...(reactCompilerPlugin
    ? [
        {
          plugins: { "react-compiler": reactCompilerPlugin },
          files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
          ignores: [
            "app/page.tsx",
            "app/copy-trade/**",
            "lib/stellar/typed-call.ts",
          ],
          rules: {
            "react-compiler/react-compiler": "error",
          },
        },
      ]
    : []),
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    ignores: ["lib/stellar/typed-call.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name=/^(read|submit|simulated)$/] > TSTypeParameterInstantiation",
          message: "Do not pass explicit type args to read/submit/simulated — the type is inferred from the binding.",
        },
      ],
    },
  },
]);

export default eslintConfig;
