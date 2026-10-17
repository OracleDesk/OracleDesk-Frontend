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
    // Submodule and generated code are not ours to lint.
    "contracts/**",
    "lib/stellar/generated/**",
  ]),
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: ["lib/stellar/typed-call.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^(read|submit|simulated)$/] > TSTypeParameterInstantiation",
          message:
            "Do not pass manual type arguments to read(), submit(), or simulated(). Result types are inferred automatically from contract bindings.",
        },
      ],
    },
  },
]);

export default eslintConfig;
