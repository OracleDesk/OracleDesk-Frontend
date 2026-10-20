import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const typedCallRestriction = {
  selector: "CallExpression[callee.name=/^(read|submit|simulated)$/] > TSTypeParameterInstantiation",
  message: "Do not pass explicit type args to read/submit/simulated — the type is inferred from the binding.",
};

const moneyFormatMessage =
  "Format money with lib/format/money.ts. If this is not money, rename the variable or add // eslint-disable-next-line no-restricted-syntax -- not money: <reason>";

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
    // Submodule, generated code, and lint rule test fixtures are not linted directly.
    "contracts/**",
    "lib/stellar/generated/**",
    "lib/format/__tests__/lint-fixtures/**",
  ]),
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    ignores: ["lib/stellar/typed-call.ts"],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-restricted-syntax": ["error", typedCallRestriction],
    },
  },
  {
    files: ["app/**/*.tsx"],
    // Mock-only demo routes are excluded from the money formatting lint rule.
    ignores: [
      "app/market/**",
      "app/buy-yes-demo/**",
      "app/buy-no-demo/**",
      "app/execution-terminal/**",
      "app/dev/**",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        typedCallRestriction,
        {
          selector:
            "CallExpression[callee.property.name=/^(toFixed|toLocaleString)$/][callee.object.name=/(?:usdc|amount|size|volume|liquidity|pnl|capital|balance|fee|price|total)/i]",
          message: moneyFormatMessage,
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(toFixed|toLocaleString)$/][callee.object.property.name=/(?:usdc|amount|size|volume|liquidity|pnl|capital|balance|fee|price|total)/i]",
          message: moneyFormatMessage,
        },
        {
          selector:
            'TemplateLiteral:has(TemplateElement[value.raw=/\\$\\s*$/]) > CallExpression[callee.property.name="toFixed"]',
          message: moneyFormatMessage,
        },
      ],
    },
  },
]);

export default eslintConfig;
