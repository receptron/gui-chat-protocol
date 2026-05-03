/**
 * ESLint preset for gui-chat-protocol plugin authors.
 *
 * Plugins should write all I/O through `runtime.files.{data,config}`,
 * all logging through `runtime.log.*`, and all paths as POSIX-relative
 * template literals. This preset turns deviations into lint errors so
 * platform bypasses become visible at code-review time.
 *
 * Usage (flat config):
 *
 *   // plugin/eslint.config.mjs
 *   import pluginPreset from "gui-chat-protocol/eslint-preset";
 *   export default [
 *     ...pluginPreset,
 *     // your project-specific overrides
 *   ];
 *
 * Allowed Node built-ins: `node:crypto` (randomUUID etc.), `node:url`
 * (URL parsing). `node:fs` / `node:path` are restricted because the
 * runtime provides scoped + normalised replacements.
 *
 * Spec: https://github.com/receptron/mulmoclaude/issues/1110
 */

const FS_MESSAGE = "Use runtime.files.data / runtime.files.config — see https://github.com/receptron/mulmoclaude/issues/1110.";
const PATH_MESSAGE =
  "Plugin runtime paths are POSIX-relative; use template literals like `books/${id}.json`. The platform normalises and rejects traversal.";

const restrictedImportPaths = [
  { name: "fs", message: FS_MESSAGE },
  { name: "node:fs", message: FS_MESSAGE },
  { name: "fs/promises", message: FS_MESSAGE },
  { name: "node:fs/promises", message: FS_MESSAGE },
  { name: "path", message: PATH_MESSAGE },
  { name: "node:path", message: PATH_MESSAGE },
  // Subpath aliases — Node exposes the same path APIs via these, so
  // missing them here would let plugin authors bypass the path
  // restriction by importing from `node:path/posix` (or
  // `path/posix`) instead. `path/win32` covers the same hole on the
  // Windows side. Codex review #10 caught this.
  { name: "path/posix", message: PATH_MESSAGE },
  { name: "node:path/posix", message: PATH_MESSAGE },
  { name: "path/win32", message: PATH_MESSAGE },
  { name: "node:path/win32", message: PATH_MESSAGE },
];

export default [
  {
    rules: {
      "no-restricted-imports": ["error", { paths: restrictedImportPaths }],
      "no-console": ["error"],
    },
  },
];
