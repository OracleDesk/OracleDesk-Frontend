import { createRequire } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noAriaInvalidWithoutDescribedbyRule from "./eslint-rules/no-aria-invalid-without-describedby.mjs";
// React Compiler lint plugin (issue #152). Install with:
//   npm install --save-dev eslint-plugin-react-compiler
// When the package is not present the import resolves to null and the rules
// block below is skipped, so the build does not break before the package is
// added. Remove the null-check once the package is in package.json.
const require = createRequire(import.meta.url);
/** @type {import("eslint").ESLint.Plugin | null} */
let reactCompilerPlugin = null;
try {
  reactCompilerPlugin = require("eslint-plugin-react-compiler");
} catch {
  // package not yet installed — skip
}

const typedCallRestriction = {
  selector: "CallExpression[callee.name=/^(read|submit|simulated)$/] > TSTypeParameterInstantiation",
  message: "Do not pass explicit type args to read/submit/simulated — the type is inferred from the binding.",
};

const moneyFormatMessage =
  "Format money with lib/format/money.ts. If this is not money, rename the variable or add // eslint-disable-next-line no-restricted-syntax -- not money: <reason>";

const PHYSICAL_TW_RE = /\b(?:ml|mr|pl|pr|left|right)-\d|\btext-(?:left|right)\b/;

const rtlPlugin = {
  rules: {
    "no-physical-classes": {
      meta: { type: "problem", schema: [] },
      create(context) {
        const sourceCode = context.sourceCode;
        const checkText = (node, text) => {
          if (!PHYSICAL_TW_RE.test(text)) return;
          const comments = [
            ...sourceCode.getCommentsBefore(node),
            ...sourceCode.getCommentsAfter(node),
          ];
          const line = node.loc?.start.line;
          const lineText = line ? sourceCode.lines[line - 1] ?? "" : "";
          if (
            lineText.includes("rtl-physical-ok") ||
            comments.some((c) => c.value.includes("rtl-physical-ok"))
          ) {
            return;
          }
          context.report({
            node,
            message:
              "Use logical Tailwind utilities (ms-, me-, ps-, pe-, start-, end-, text-start, text-end) instead of physical directions. Annotate justified exceptions with // rtl-physical-ok.",
          });
        };
        return {
          Literal(node) {
            if (typeof node.value === "string") checkText(node, node.value);
          },
          TemplateElement(node) {
            checkText(node, node.value.raw);
          },
        };
      },
    },
  },
};

/** Words that are product, asset or key names and are never translated. */
const UNTRANSLATED_TEXT = /^(?:OracleDesk|USDC|XLM|⌘K)$/;
const TRANSLATABLE_ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt"]);

const i18nPlugin = {
  rules: {
    "no-literal-text": {
      meta: { type: "problem", schema: [] },
      create(context) {
        const message =
          "User-facing text in migrated files must come from t() (lib/i18n). Asset codes and the product name are exempt; see docs/i18n.md.";
        const hasWords = (text) => /[A-Za-z]{2,}/.test(text) && !UNTRANSLATED_TEXT.test(text.trim());
        return {
          JSXText(node) {
            if (hasWords(node.value)) context.report({ node, message });
          },
          JSXAttribute(node) {
            if (
              node.name.type === "JSXIdentifier" &&
              TRANSLATABLE_ATTRIBUTES.has(node.name.name) &&
              node.value?.type === "Literal" &&
              typeof node.value.value === "string" &&
              hasWords(node.value.value)
            ) {
              context.report({ node, message });
            }
          },
        };
      },
    },
  },
};

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
        {
          selector:
            'CallExpression[callee.object.name="StrKey"][callee.property.name="isValidEd25519PublicKey"]',
          message: "Use <AddressInput> (components/ui/address-input.tsx) instead of raw StrKey.isValidEd25519PublicKey in app/.",
        },
      ],
    },
  },
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    plugins: {
      "rtl-logical": rtlPlugin,
      "a11y-forms": {
        rules: {
          "no-aria-invalid-without-describedby": noAriaInvalidWithoutDescribedbyRule,
        },
      },
    },
    rules: {
      "rtl-logical/no-physical-classes": "error",
      "a11y-forms/no-aria-invalid-without-describedby": "error",
    },
  },
  {
    // Surfaces migrated to the i18n catalog: new English literals fail lint.
    files: ["components/layout/Navbar.tsx", "components/layout/WalletDropdown.tsx"],
    plugins: { i18n: i18nPlugin },
    rules: { "i18n/no-literal-text": "error" },
  },
]);

export default eslintConfig;
