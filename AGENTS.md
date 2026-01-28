# Repository Guidelines

## Project Structure & Module Organization
- Core protocol contracts live in `src/types.ts`, `src/schema.ts`, and `src/inputHandlers.ts`; treat `src/index.ts` as the framework-agnostic entry point that re-exports everything.
- Framework adapters stay isolated: `src/react.ts` only depends on React type helpers, while `src/vue.ts` wraps the same contracts with Vue-centric components. Keep new adapters beside these files so consumers can tree-shake.
- Human-readable protocol details belong in `spec/GUI_CHAT_PROTOCOL.md`. Update that spec whenever you touch the schema or handler semantics so downstream agents stay in sync.
- Generated bundles are emitted to `dist/` by Vite; do not edit them manually. Build tooling sits in `tsconfig.json` and `vite.config.ts`.

## Build, Test, and Development Commands
- `yarn install` — install dependencies; run after cloning or whenever `package.json` changes.
- `yarn build` — runs `vite build` to emit ESM, CJS, and declaration bundles under `dist/`. Use this before publishing.
- `yarn typecheck` — executes `tsc --noEmit` with the strict settings in `tsconfig.json`. Treat failures here as blockers because types are our primary safety net.

## Coding Style & Naming Conventions
- Use TypeScript with 2-space indentation, named exports, and doc blocks for public APIs (see `src/vue.ts`).
- Types/interfaces are `PascalCase` (`ToolPlugin`, `InputHandler`), functions and variables are `camelCase`, and constants that truly do not change can be `UPPER_SNAKE_CASE`.
- Keep modules side-effect free so bundlers can treeshake; prefer pure data helpers over runtime operations.

## Testing Guidelines
- There is no runtime test harness yet, so rely on `yarn typecheck` plus lightweight sample usage snippets when evolving the schema.
- When adding new handlers or schema fields, mirror the change in `spec/GUI_CHAT_PROTOCOL.md` and include an example configuration in the doc so reviewers can reason about compatibility.

## Commit & Pull Request Guidelines
- Follow the conventional commit style already in history (`feat: add isAudioPlaying prop`, `fix: …`, `docs: …`). Release bumps use `gui-chat-protocol@x.y.z`.
- PRs should describe schema impacts, link to any downstream issues, and include testing notes (`yarn typecheck`, `yarn build`). Attach screenshots or code excerpts when changing adapter-facing APIs.
- Keep PRs focused: update docs/spec alongside code, note any breaking changes early, and wait to publish until `dist/` is rebuilt and reviewed.
