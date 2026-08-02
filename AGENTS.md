# Repository Guidelines

## Project Structure & Module Organization
- Core protocol contracts live in `src/types.ts`, `src/schema.ts`, and `src/inputHandlers.ts`; treat `src/index.ts` as the framework-agnostic entry point that re-exports everything.
- Framework adapters stay isolated: `src/react.ts` only depends on React type helpers, while `src/vue.ts` wraps the same contracts with Vue-centric components. Keep new adapters beside these files so consumers can tree-shake.
- Human-readable protocol details belong in `spec/GUI_CHAT_PROTOCOL.md`. Update that spec whenever you touch the schema or handler semantics so downstream agents stay in sync.
- Generated bundles are emitted to `dist/` by Vite; do not edit them manually. Build tooling sits in `tsconfig.json` and `vite.config.ts`.

## Build, Test, and Development Commands
- `yarn install` — install dependencies; run after cloning or whenever `package.json` changes.
- `yarn build` — runs `vite build` to emit ESM, CJS, and declaration bundles under `dist/`. Use this before publishing.
- `yarn typecheck` — executes `tsc --noEmit` with the strict settings in `tsconfig.json`. Treat failures here as blockers because types are our primary safety net. Coverage is `src/**` plus `test/types/**` (type-conformance fixtures); the `node:test` files are outside it.
- `yarn lint` — ESLint over `src` and `test`. `consistent-type-assertions` is set to `assertionStyle: "never"`, so an `as` is an error; exceptions live in `eslint.config.mjs` with a reason, never as an inline disable.
- `yarn test` — runs `test/test_*.ts` with `tsx --test` (`node:test` + `node:assert`).
- `yarn format` — Prettier over `src` and `test`.

## Coding Style & Naming Conventions
- Use TypeScript with 2-space indentation, named exports, and doc blocks for public APIs (see `src/vue.ts`).
- Types/interfaces are `PascalCase` (`ToolPlugin`, `InputHandler`), functions and variables are `camelCase`, and constants that truly do not change can be `UPPER_SNAKE_CASE`.
- Keep modules side-effect free so bundlers can treeshake; prefer pure data helpers over runtime operations.

## Testing Guidelines
- Runtime behaviour is tested with `node:test` under `test/`; type-level guarantees are tested by files under `test/types/` that `yarn typecheck` compiles. A signature change needs both — a reference implementation that compiles proves the shape is *implementable*, not that the shape is *right* (TypeScript relates overloaded sources leniently), so exact-type pins carry the second half.
- When adding new handlers or schema fields, mirror the change in `spec/GUI_CHAT_PROTOCOL.md` and include an example configuration in the doc so reviewers can reason about compatibility.

## Commit & Pull Request Guidelines
- Follow the conventional commit style already in history (`feat: add isAudioPlaying prop`, `fix: …`, `docs: …`). Release bumps use `gui-chat-protocol@x.y.z`.
- PRs should describe schema impacts, link to any downstream issues, and include testing notes (`yarn typecheck`, `yarn build`). Attach screenshots or code excerpts when changing adapter-facing APIs.
- Keep PRs focused: update docs/spec alongside code, note any breaking changes early, and wait to publish until `dist/` is rebuilt and reviewed.
