/**
 * GUI Chat Protocol - Core Types (Framework-agnostic)
 *
 * This module exports all framework-agnostic types for GUI chat plugins.
 * Use these types when building plugin core logic without UI components.
 */

import type { InputHandler } from "./inputHandlers";
import type { PluginConfigSchema, JsonSchemaProperty } from "./schema";

// ============================================================================
// Backend Types
// ============================================================================

// Backend types that plugins can declare they use
export type BackendType =
  | "textLLM"
  | "imageGen"
  | "audio"
  | "search"
  | "browse"
  | "map"
  | "mulmocast";

// ============================================================================
// Tool Result
// ============================================================================

/**
 * Result returned from plugin execution
 */
export interface ToolResult<T = unknown, J = unknown> {
  toolName?: string; // name of the tool that generated this result
  uuid?: string;
  message: string; // status message sent back to the LLM about the tool execution result
  title?: string;
  jsonData?: J; // data to be passed to the LLM
  instructions?: string; // follow-up instructions for the LLM
  instructionsRequired?: boolean; // if true, instructions will be sent even if suppressInstructions is enabled
  updating?: boolean; // if true, updates existing result instead of creating new one
  cancelled?: boolean; // if true, operation was cancelled by the user and should not be added to UI
  data?: T; // tool specific data (for views, not visible to the LLM)
  viewState?: Record<string, unknown>; // tool specific view state
}

/**
 * Complete tool result with required fields
 */
export interface ToolResultComplete<
  T = unknown,
  J = unknown,
> extends ToolResult<T, J> {
  toolName: string;
  uuid: string;
}

// ============================================================================
// Tool Context
// ============================================================================

/**
 * App interface provided to plugins via context.app
 * Contains backend functions and config accessors
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolContextApp extends Record<
  string,
  (...args: any[]) => any
> {
  getConfig: <T = unknown>(key: string) => T | undefined;
  setConfig: (key: string, value: unknown) => void;
}

/**
 * Context passed to plugin execute function
 */
export interface ToolContext {
  currentResult?: ToolResult<unknown> | null;
  app?: ToolContextApp;
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Tool definition for OpenAI-compatible function calling
 */
export interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters?: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Sample arguments for testing
 */
export interface ToolSample {
  name: string;
  args: Record<string, unknown>;
}

// ============================================================================
// View Component Props
// ============================================================================

/**
 * Options for sendTextMessage
 */
export interface SendTextMessageOptions {
  /** Optional data to pass along with the message (for testing/debugging) */
  data?: unknown;
}

/**
 * Standard props for View components
 */
export interface ViewComponentProps<T = unknown, J = unknown> {
  selectedResult: ToolResultComplete<T, J>;
  sendTextMessage: (text?: string, options?: SendTextMessageOptions) => void;
  onUpdateResult?: (result: Partial<ToolResult<T, J>>) => void;
  pluginConfigs?: Record<string, unknown>;
}

/**
 * Standard props for Preview components
 */
export interface PreviewComponentProps<T = unknown, J = unknown> {
  result: ToolResultComplete<T, J>;
  isSelected?: boolean;
  onSelect?: () => void;
}

// ============================================================================
// Core Plugin Interface
// ============================================================================

/**
 * Core plugin interface - framework agnostic
 * Does not include UI components
 *
 * @typeParam T - Tool-specific data type (for views)
 * @typeParam J - JSON data type (passed to LLM)
 * @typeParam A - Arguments type for execute function
 * @typeParam H - Input handler type (allows custom handlers)
 * @typeParam S - Start response type (app-specific server response)
 */
export interface ToolPluginCore<
  T = unknown,
  J = unknown,
  A extends object = object,
  H = InputHandler,
  S = Record<string, unknown>,
> {
  toolDefinition: ToolDefinition;
  execute: (context: ToolContext, args: A) => Promise<ToolResult<T, J>>;
  generatingMessage: string;
  waitingMessage?: string;
  uploadMessage?: string;
  isEnabled: (startResponse?: S | null) => boolean;
  delayAfterExecution?: number;
  systemPrompt?: string;
  inputHandlers?: H[];
  configSchema?: PluginConfigSchema;
  samples?: ToolSample[];
  backends?: BackendType[];
}
