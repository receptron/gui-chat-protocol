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
  "textLLM" | "imageGen" | "audio" | "search" | "browse" | "map" | "mulmocast";

// ============================================================================
// Tool Result
// ============================================================================

/**
 * Result returned from plugin execution.
 *
 * ### `data` gates rendering
 *
 * `data` is the host's render-eligibility signal: setting it
 * means "render a GUI card for this result"; omitting it makes
 * the result *narrate-only* (`message` / `instructions` flow to
 * the LLM, but no card is shown). Use narrate-only for actions
 * whose effect is purely informational for the LLM — fetching a
 * list the LLM will summarize, validation-error returns, etc.
 *
 * `jsonData` is orthogonal: it's the JSON-serializable copy
 * returned to the LLM alongside `message` / `instructions` for
 * cases where the model needs to read the structured result back
 * on subsequent turns. Setting `jsonData` does NOT, by itself,
 * cause a card to render — pair it with `data` if you also want
 * the view to bind the same shape.
 *
 * ### Choosing what to set
 *
 * - **`data` only** — render a card; the LLM only sees `message`.
 * - **Neither** — narrate-only; no card.
 * - **Both** (`data: payload, jsonData: payload`) — render a card
 *   AND let the LLM read the same payload back. Use this when
 *   the view and the LLM need to reason over the same shape
 *   (e.g. a quiz definition, a form spec).
 * - **`jsonData` only** — uncommon; the LLM gets a JSON copy with
 *   no card. Equivalent to narrate-only as far as the GUI is
 *   concerned.
 *
 * ### Worked examples
 *
 * Card with view-only payload (LLM only needs to know it succeeded):
 * ```ts
 * return { message: "Generated image", data: { url, prompt } };
 * ```
 *
 * Narrate-only (no card):
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
   * `message` / `instructions`. Orthogonal to rendering — only
   * `data` causes a card to render. Set this when the LLM needs
   * to recall the structured result on subsequent turns; pair
   * with `data` to also render a card bound to the same shape.
   */
  jsonData?: J;
  instructions?: string; // follow-up instructions for the LLM
  instructionsRequired?: boolean; // if true, instructions will be sent even if suppressInstructions is enabled
  updating?: boolean; // if true, updates existing result instead of creating new one
  cancelled?: boolean; // if true, operation was cancelled by the user and should not be added to UI
  /**
   * Typed payload consumed by the plugin's view / preview
   * component. Not visible to the LLM. **Setting `data` is the
   * host's render-eligibility signal** — a result without `data`
   * is treated as narrate-only and no card is rendered. See the
   * interface-level docs for the full rule and worked examples.
   */
  data?: T;
  viewState?: Record<string, unknown>; // tool specific view state
  /**
   * The result is a step of a sequence the model shows one step at a
   * time (a slideshow's slide, a story's panel), and this is where the
   * sequence is now. A host that supports sequences keeps them going
   * with it (see `createSequenceKeeper`); one that doesn't ignores it.
   *
   * - A `SequenceStep`: the step is on the screen.
   * - `null`: a step of a sequence that wasn't shown (the picture
   *   failed, say). The host stops keeping the sequence going: asking
   *   for the step again would fail again.
   * - Absent: the result isn't part of a sequence. The host's tracking
   *   is unchanged (the model may show a chart in the middle of a
   *   slideshow).
   *
   * A cancelled result (a repeated or held call) changes nothing either.
   */
  sequence?: SequenceStep | null;
}

/**
 * Where a sequence is after one of its steps was shown. Everything here
 * is for the host's wording to the model: the host asks the model to go
 * on with `nextCall` when a reply ends mid-sequence.
 */
export interface SequenceStep {
  /** This step's number, from 1 (0 for something shown before the first
   *  step, such as a story's cast). */
  step: number;
  /** How many steps the sequence has. */
  total: number;
  /** What the sequence is, for the host's wording: "slideshow", "story". */
  kind: string;
  /** What is on the screen: "Slide 2 of 5". */
  label: string;
  /** What the model does with a step once it is on the screen:
   *  "explain it". */
  onShown: string;
  /** The call that shows the next step, as the model should make it:
   *  `call presentSlide for slide 3 of 5`. */
  nextCall: string;
  /** The next step waits for the user (a how-to step they are doing, a
   *  story choice): the host doesn't ask the model to go on. */
  waitsForUser?: boolean;
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
 *
 * The index signature keeps `any[]` parameters so a host can expose backend
 * functions of any arity, but returns `unknown`: what a host function hands
 * back is not something this protocol can see, so the plugin narrows it.
 */
export interface ToolContextApp extends Record<
  string,
  (...args: any[]) => unknown
> {
  /**
   * Read a host config value. Untyped by default — the value comes from
   * the host's config store, so naming its type without checking it
   * would make the host assert a shape nobody verified. Pass `parse` to
   * narrow it (same rule as `fetchJson` in `./runtime`):
   *
   * ```ts
   * const model = app.getConfig("llm.model", (raw) => String(raw));
   * ```
   *
   * `parse` is not called for a missing key — the result is `undefined`.
   */
  getConfig: {
    (key: string): unknown;
    <T>(key: string, parse: (raw: unknown) => T): T | undefined;
  };
  setConfig: (key: string, value: unknown) => void;
}

/**
 * Context passed to plugin execute function
 */
export interface ToolContext {
  currentResult?: ToolResult<unknown> | null;
  app?: ToolContextApp;
  /**
   * When the user last spoke or sent a message, in milliseconds since
   * the epoch (`Date.now()`), or absent when the host doesn't know. A
   * plugin whose step waits for the user (a guide's step, a story's
   * choice) holds a later step until the user has spoken since the
   * waiting one appeared. A plain number, so a host that runs
   * `execute()` on a server can send it with the request. Hosts using
   * `createSequenceKeeper` take it from `userSpokeAt()`.
   */
  userSpokeAt?: number;
  /**
   * Which conversation this call belongs to, when a host runs several at
   * once (browser tabs sharing one server, sessions). A plugin that keeps
   * state in memory between calls (a slideshow in progress, a step waiting
   * for the user) keeps it per conversation, so two conversations don't
   * mix. Opaque: compare it, don't parse it. Absent means the host has one
   * conversation, or doesn't say.
   */
  conversationId?: string;
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
