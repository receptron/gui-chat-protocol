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
 * Result returned from plugin execution.
 *
 * ### Rendering vs narrate-only
 *
 * Hosts treat `data` and `jsonData` as the two "view payload"
 * signals — setting **either** indicates the plugin wants a GUI
 * card rendered for this result; setting **neither** makes the
 * result *narrate-only* (`message` / `instructions` flow to the
 * LLM, but no card is shown). Use narrate-only for actions whose
 * effect is purely informational for the LLM — fetching a list
 * the LLM will summarize, validation-error returns, etc.
 *
 * ### Choosing `data` vs `jsonData` vs both
 *
 * - **`data`** — typed payload consumed by the plugin's view /
 *   preview component (Vue, React, …). The LLM does NOT see
 *   `data` — it's a private channel from the plugin's executor
 *   to its UI.
 * - **`jsonData`** — JSON-serializable shape returned to the LLM
 *   alongside `message` / `instructions`. Use when the LLM needs
 *   to read the structured result back on subsequent turns
 *   (e.g. a quiz definition the LLM must reference, a form spec
 *   the LLM will recall).
 * - **Both** — set when the same payload needs to reach both
 *   audiences. Pattern: `data: payload, jsonData: payload`. The
 *   view binds the typed shape; the LLM gets the JSON.
 *
 * ### Worked examples
 *
 * Card + view-only payload (LLM only needs to know it succeeded):
 * ```ts
 * return { message: "Generated image", data: { url, prompt } };
 * ```
 *
 * Narrate-only (LLM-readable, no card):
 * ```ts
 * return { message: `Found ${reports.length} reports`, instructions: "..." };
 * ```
 *
 * Card + LLM-readable payload (same payload, two audiences):
 * ```ts
 * return { message: "Form presented", data: form, jsonData: form, instructions: "..." };
 * ```
 */
export interface ToolResult<T = unknown, J = unknown> {
  toolName?: string; // name of the tool that generated this result
  uuid?: string;
  message: string; // status message sent back to the LLM about the tool execution result
  title?: string;
  action?: string; // sub-action / verb the tool was invoked with (e.g. "openApp", "addEntry"); used by hosts to label multi-feature tool results in the UI
  /**
   * JSON-serializable result the LLM reads back alongside
   * `message` / `instructions`. Setting this (or `data`) signals
   * the host to render a GUI card; setting neither makes the
   * result narrate-only. See the interface-level docs for the
   * choice between `data`, `jsonData`, and both.
   */
  jsonData?: J;
  instructions?: string; // follow-up instructions for the LLM
  instructionsRequired?: boolean; // if true, instructions will be sent even if suppressInstructions is enabled
  updating?: boolean; // if true, updates existing result instead of creating new one
  cancelled?: boolean; // if true, operation was cancelled by the user and should not be added to UI
  /**
   * Typed payload consumed by the plugin's view / preview
   * component. Not visible to the LLM. Setting this (or
   * `jsonData`) signals the host to render a GUI card; setting
   * neither makes the result narrate-only. See the
   * interface-level docs for the choice between `data`,
   * `jsonData`, and both.
   */
  data?: T;
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
  /** System-prompt instruction telling the LLM when/how to use this tool.
   *  Unlike `description` (which is part of the tool schema sent to the LLM),
   *  `prompt` is injected into the system prompt by the host application. */
  prompt?: string;
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

  // LLM audio playback state (for avatar lip-sync, visual feedback, etc.)
  // true when the LLM's voice response is currently playing
  isAudioPlaying?: boolean;
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
  isEnabled: (startResponse?: S | null) => boolean;
  delayAfterExecution?: number;
  /** @deprecated Use {@link ToolDefinition.prompt} instead. */
  systemPrompt?: string;
  inputHandlers?: H[];
  configSchema?: PluginConfigSchema;
  samples?: ToolSample[];
  backends?: BackendType[];
}
