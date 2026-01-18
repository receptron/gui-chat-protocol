/**
 * GUI Chat Protocol - React Types
 *
 * This module exports React-specific types for GUI chat plugins.
 * Use these types when building React-based plugin UI components.
 */

import type { ComponentType } from "react";
import type {
  ToolPluginCore,
  InputHandler,
  ViewComponentProps,
  PreviewComponentProps,
} from "./index";

// Re-export all core types
export * from "./index";

// ============================================================================
// React-specific Types
// ============================================================================

/**
 * React plugin interface - extends core with React components
 *
 * @typeParam T - Tool-specific data type (for views)
 * @typeParam J - JSON data type (passed to LLM)
 * @typeParam A - Arguments type for execute function
 * @typeParam H - Input handler type (allows custom handlers)
 */
export interface ToolPluginReact<
  T = unknown,
  J = unknown,
  A extends object = object,
  H = InputHandler,
> extends ToolPluginCore<T, J, A, H> {
  ViewComponent?: ComponentType<ViewComponentProps<T, J>>;
  PreviewComponent?: ComponentType<PreviewComponentProps<T, J>>;
}
