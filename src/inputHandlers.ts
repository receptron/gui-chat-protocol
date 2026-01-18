/**
 * Input Handlers (Framework-agnostic)
 *
 * Handlers for various input types that plugins can accept.
 */

import type { ToolResult } from "./types";

// ============================================================================
// Input Handlers
// ============================================================================

/**
 * File input handler
 */
export interface FileInputHandler {
  type: "file";
  acceptedTypes: string[];
  handleInput: (fileData: string, fileName: string) => ToolResult;
}

/**
 * Clipboard image input handler
 */
export interface ClipboardImageInputHandler {
  type: "clipboard-image";
  handleInput: (imageData: string) => ToolResult;
}

/**
 * URL input handler
 */
export interface UrlInputHandler {
  type: "url";
  patterns?: string[];
  handleInput: (url: string) => ToolResult;
}

/**
 * Text input handler
 */
export interface TextInputHandler {
  type: "text";
  patterns?: string[];
  handleInput: (text: string) => ToolResult;
}

/**
 * Camera capture input handler
 */
export interface CameraInputHandler {
  type: "camera";
  mode: "photo" | "video";
  handleInput: (data: string, metadata?: { duration?: number }) => ToolResult;
}

/**
 * Audio input handler
 */
export interface AudioInputHandler {
  type: "audio";
  handleInput: (audioData: string, duration: number) => ToolResult;
}

/**
 * Base interface for custom input handlers
 * Apps can extend this to create their own handler types
 */
export interface CustomInputHandler {
  type: string;
  handleInput: (...args: unknown[]) => ToolResult;
}

/**
 * Union of all input handler types
 */
export type InputHandler =
  | FileInputHandler
  | ClipboardImageInputHandler
  | UrlInputHandler
  | TextInputHandler
  | CameraInputHandler
  | AudioInputHandler;
