import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

// Layout follows https://github.com/isamu/zenn-docs/blob/master/guides/typescript-eslint-setup.md
// Every deviation below carries its reason, so the next reader doesn't redo the
// investigation.
export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/*.d.ts", "src/*.ts~"],
  },
  eslint.configs.recommended,
  // `strict` bans `any` and `!`; `stylistic` is the ONLY preset carrying
  // `consistent-type-assertions`, which is the rule that stops `as`. Taking
  // `strict` alone would silently leave assertions unchecked.
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      globals: {
        ...globals.es2021,
        ...globals.node,
        ...globals.browser,
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      indent: "off",
      // This package's whole job is to describe types a host can honour. An
      // `as` here is the package failing its own contract — see #30.
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      // `ignoreRestArgs` for `ToolContextApp`'s index signature: a host exposes
      // backend functions of arbitrary arity, and `never[]` there would make
      // them uncallable by plugins. Return types stay `unknown`.
      "@typescript-eslint/no-explicit-any": ["error", { ignoreRestArgs: true }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^__",
          varsIgnorePattern: "^__",
        },
      ],
      "linebreak-style": ["error", "unix"],
      quotes: ["error", "double", { avoidEscape: true }],
      semi: ["error", "always"],
    },
  },
  {
    // Type-information rules. One tsconfig here, so `projectService` is enough
    // — but it only covers files that tsconfig includes, which is `src/**` plus
    // `test/types/**`. The `node:test` files are deliberately outside it.
    files: ["src/**/*.ts", "test/types/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-base-to-string": "error",
    },
  },
  {
    // Allowlist — one entry, one reason (never an inline `// eslint-disable`).
    //
    // `useRuntime<E>()` and `pickMessages<M>()` are the same unsound-generic
    // family this package just fixed in `dispatch` / `subscribe` / `getConfig`
    // / `publish` (#30): the CALLER names the type and nothing verifies it, so
    // the implementation has no way to produce it except by asserting.
    // Unlike those four, fixing these two changes an API plugins call directly,
    // so they are tracked separately rather than silently asserted.
    // upstream (ours): https://github.com/receptron/gui-chat-protocol/issues/31
    files: ["src/vue.ts"],
    rules: { "@typescript-eslint/consistent-type-assertions": "off" },
  },
  {
    // `no-invalid-void-type` does not recognise a call expression's explicit
    // type argument (`defer<void>()`), only type references like
    // `Promise<void>`. The usage is valid; the rule can't see it.
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-invalid-void-type": "off" },
  },
  eslintConfigPrettier,
];
