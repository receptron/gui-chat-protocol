/**
 * GUI Chat Protocol - Vue Types
 *
 * This module exports Vue-specific types for GUI chat plugins.
 * Use these types when building Vue-based plugin UI components.
 */

import { inject, type Component, type InjectionKey, type Ref } from "vue";
import type { ToolPluginCore, InputHandler } from "./index";
import type { PluginNotifyMessage } from "./runtime";

// Re-export all core types
export * from "./index";

// ============================================================================
// Browser-side plugin runtime
// ============================================================================

/**
 * Runtime exposed to a plugin's Vue components via `useRuntime()`. The
 * host wraps a plugin's component subtree in a scope provider that
 * `provide`s a per-plugin instance to `PLUGIN_RUNTIME_KEY`.
 *
 * Spec: https://github.com/receptron/mulmoclaude/issues/1110
 */
export interface BrowserPluginRuntime {
  /**
   * Scoped pub/sub client. `subscribe("foo", handler)` is internally
   * routed to channel `plugin:<pkg>:foo`. Returns an unsubscribe
   * function.
   */
  pubsub: {
    subscribe<T>(eventName: string, handler: (payload: T) => void): () => void;
  };

  /**
   * Reactive locale ref. When the host implements a locale picker, the
   * plugin's UI re-renders automatically.
   */
  locale: Ref<string>;

  /** Same shape as the server-side logger. */
  log: {
    debug(msg: string, data?: object): void;
    info(msg: string, data?: object): void;
    warn(msg: string, data?: object): void;
    error(msg: string, data?: object): void;
  };

  /**
   * Open `url` in a new tab with `noopener,noreferrer`. Use instead of
   * `<a target="_blank">` so the security flags can't be forgotten at
   * call sites.
   */
  openUrl(url: string): void;

  /** Show a host-managed toast / notification. */
  notify(msg: PluginNotifyMessage): void;

  /**
   * POST `args` to this plugin's server-side dispatch route
   * (`/api/plugins/runtime/<pkg>/dispatch`) and return the parsed
   * JSON response. The host attaches the bearer token + builds the
   * URL automatically; the plugin author doesn't need to know either.
   * Throws on network error or non-2xx response.
   */
  dispatch<T = unknown>(args: object): Promise<T>;
}

/**
 * Vue injection key for `BrowserPluginRuntime`. The host's runtime
 * plugin loader provides a per-plugin instance here; `useRuntime()`
 * inside a plugin component picks it up.
 */
export const PLUGIN_RUNTIME_KEY: InjectionKey<BrowserPluginRuntime> = Symbol("guiChatPluginRuntime");

/**
 * Composable that returns the plugin's `BrowserPluginRuntime`. Throws
 * a descriptive error if called outside the host's scope provider so
 * misuse fails loudly during development.
 */
export function useRuntime(): BrowserPluginRuntime {
  const runtime = inject(PLUGIN_RUNTIME_KEY);
  if (!runtime) {
    throw new Error(
      "useRuntime() called outside of <PluginScopedRoot> — the host must provide PLUGIN_RUNTIME_KEY",
    );
  }
  return runtime;
}

// ============================================================================
// Vue-specific Types
// ============================================================================

/**
 * Legacy Vue component-based config
 * @deprecated Use PluginConfigSchema instead
 */
export interface ToolPluginConfig {
  key: string;
  defaultValue: unknown;
  component: Component;
}

/**
 * Vue plugin interface - extends core with Vue components
 *
 * @typeParam T - Tool-specific data type (for views)
 * @typeParam J - JSON data type (passed to LLM)
 * @typeParam A - Arguments type for execute function
 * @typeParam H - Input handler type (allows custom handlers)
 * @typeParam S - Start response type (app-specific server response)
 */
export interface ToolPlugin<
  T = unknown,
  J = unknown,
  A extends object = object,
  H = InputHandler,
  S = Record<string, unknown>,
> extends ToolPluginCore<T, J, A, H, S> {
  viewComponent?: Component;
  previewComponent?: Component;
  /**
   * Legacy Vue component-based config (for backward compatibility)
   * @deprecated Use configSchema (PluginConfigSchema) instead
   */
  config?: ToolPluginConfig;
}

/**
 * Alias for ToolPlugin (Vue-specific)
 */
export type ToolPluginVue<
  T = unknown,
  J = unknown,
  A extends object = object,
  H = InputHandler,
  S = Record<string, unknown>,
> = ToolPlugin<T, J, A, H, S>;
