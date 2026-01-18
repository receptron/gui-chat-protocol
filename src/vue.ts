/**
 * GUI Chat Protocol - Vue Types
 *
 * This module exports Vue-specific types for GUI chat plugins.
 * Use these types when building Vue-based plugin UI components.
 */

import type { Component } from "vue";
import type { ToolPluginCore, InputHandler } from "./index";

// Re-export all core types
export * from "./index";

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
 */
export interface ToolPlugin<
  T = unknown,
  J = unknown,
  A extends object = object,
  H = InputHandler,
> extends ToolPluginCore<T, J, A, H> {
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
> = ToolPlugin<T, J, A, H>;
