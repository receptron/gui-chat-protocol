# GUI Chat Protocol

A TypeScript library that defines the standard protocol for building GUI chat plugins. This package provides framework-agnostic core types with adapters for Vue and React, enabling developers to create interactive tool plugins that work with any compatible chat application.

> For the full protocol specification, see [GUI_CHAT_PROTOCOL.md](https://github.com/receptron/MulmoChat/blob/main/GUI_CHAT_PROTOCOL.md)

## What is GUI Chat Protocol?

GUI Chat Protocol extends standard LLM tool calling to enable **rich graphical interfaces** in chat applications. Instead of tool results being purely textual data displayed inline, they trigger the rendering of GUI components or multi-modal content in the chat interface.

### Key Mechanism

Tools return two things:

1. **Text response** - For the LLM to continue the conversation
2. **Typed GUI data** - That triggers appropriate visual components (images, maps, forms, quizzes, documents)

This approach maintains backward compatibility—existing text-based tools work unchanged while new tools leverage GUI rendering.

### Role-Based Architecture

A standout feature is the **"composable roles without code"** concept. Applications are defined by:

- **Available tools** (like `presentForm`, `generateImage`, `map`, `quiz`)
- **System prompt** describing behavior

This enables non-programmers to create specialized AI assistants by configuration alone. The same generic chat infrastructure powers vastly different applications—a recipe guide, tutor, trip planner, or game companion—simply by changing tool selection and system instructions.

### LLM Agnostic

The protocol works with **any model supporting function calling**: Claude, GPT, Gemini, and open-weight models. No proprietary features required.

### Use Cases

The protocol enables:
- **Creative tools** - Image generation, music, 3D content
- **Information discovery** - Web browsing, search, maps
- **Interactive learning** - Quizzes, tutorials, forms
- **Content creation** - Documents, presentations, spreadsheets
- **Productivity applications** - Todo lists, calendars, workflows

All with bidirectional interaction where GUIs both display information and collect structured user input.

## This Package

This npm package (`gui-chat-protocol`) provides the TypeScript type definitions for implementing the GUI Chat Protocol:

- **Framework-agnostic core types** - For plugin logic without UI dependencies
- **Vue adapter** - Vue 3 component types
- **React adapter** - React 18/19 component types

By defining a standard protocol, plugins become portable across different chat applications, and applications can easily integrate plugins without framework-specific dependencies.

## Architecture

### Tool Plugin Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chat Application                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    LLM      │  │   Plugin    │  │      UI Layer       │  │
│  │  Interface  │◄─┤   Manager   │◄─┤  (Vue/React/etc.)   │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │  Plugin A │    │  Plugin B │    │  Plugin C │
   │  (Quiz)   │    │  (Image)  │    │  (Form)   │
   └───────────┘    └───────────┘    └───────────┘
```

### Key Types

| Type | Description |
|------|-------------|
| `ToolPluginCore` | Framework-agnostic plugin definition |
| `ToolPlugin` | Vue-specific plugin with Vue components |
| `ToolPluginReact` | React-specific plugin with React components |
| `ToolResult` | Standardized result from plugin execution |
| `ToolContext` | Context passed to plugin execute function |
| `ToolDefinition` | OpenAI-compatible function definition |

## Installation

```bash
npm install gui-chat-protocol
# or
yarn add gui-chat-protocol
```

## Package Exports

```typescript
// Core types (framework-agnostic)
import { ToolPluginCore, ToolResult, ToolContext } from "gui-chat-protocol";

// Vue-specific types
import { ToolPlugin } from "gui-chat-protocol/vue";

// React-specific types
import { ToolPluginReact } from "gui-chat-protocol/react";
```

## API Reference

### Core Types

#### ToolPluginCore

The base plugin interface (framework-agnostic):

```typescript
interface ToolPluginCore<T, J, A, H, S> {
  // Tool definition for LLM function calling
  toolDefinition: ToolDefinition;

  // Execute function called when LLM invokes the tool
  execute: (context: ToolContext, args: A) => Promise<ToolResult<T, J>>;

  // Message shown while generating
  generatingMessage: string;

  // Check if plugin is enabled based on server capabilities
  isEnabled: (startResponse?: S | null) => boolean;

  // Optional: Input handlers for files, clipboard, etc.
  inputHandlers?: H[];

  // Optional: System prompt additions
  systemPrompt?: string;

  // Optional: Sample arguments for testing
  samples?: ToolSample[];

  // Optional: Backend types this plugin requires
  backends?: BackendType[];
}
```

#### ToolResult

Result returned from plugin execution:

```typescript
interface ToolResult<T, J> {
  message: string;           // Status message for the LLM
  data?: T;                  // UI data (not visible to LLM)
  jsonData?: J;              // Data passed to the LLM
  instructions?: string;     // Follow-up instructions for LLM
  title?: string;            // Display title
  updating?: boolean;        // Update existing result vs create new
}
```

#### ToolContext

Context passed to the execute function:

```typescript
interface ToolContext {
  currentResult?: ToolResult | null;  // Current result being updated
  app?: ToolContextApp;               // App-provided functions
}

interface ToolContextApp {
  getConfig: <T>(key: string) => T | undefined;
  setConfig: (key: string, value: unknown) => void;
  // App can add custom functions (e.g., generateImage, browse, etc.)
}
```

### Input Handlers

Plugins can accept various input types:

```typescript
type InputHandler =
  | FileInputHandler        // File uploads
  | ClipboardImageInputHandler  // Paste from clipboard
  | UrlInputHandler         // URL processing
  | TextInputHandler        // Text patterns
  | CameraInputHandler      // Camera capture
  | AudioInputHandler;      // Audio recording
```

### Vue Types

```typescript
import { ToolPlugin } from "gui-chat-protocol/vue";

interface ToolPlugin<T, J, A, H, S> extends ToolPluginCore<T, J, A, H, S> {
  viewComponent?: Component;     // Full view component
  previewComponent?: Component;  // Thumbnail/preview component
}
```

### React Types

```typescript
import { ToolPluginReact, ViewComponentProps, PreviewComponentProps } from "gui-chat-protocol/react";

interface ToolPluginReact<T, J, A, H, S> extends ToolPluginCore<T, J, A, H, S> {
  ViewComponent?: ComponentType<ViewComponentProps<T, J>>;
  PreviewComponent?: ComponentType<PreviewComponentProps<T, J>>;
}
```

## Creating a Plugin

### Step 1: Define Plugin-Specific Types

```typescript
// src/core/types.ts
export interface MyPluginData {
  // Data for UI (not sent to LLM)
}

export interface MyPluginArgs {
  // Arguments from LLM function call
}
```

### Step 2: Create Core Plugin (Framework-Agnostic)

```typescript
// src/core/plugin.ts
import type { ToolPluginCore, ToolContext, ToolResult } from "gui-chat-protocol";
import type { MyPluginData, MyPluginArgs } from "./types";

export const pluginCore: ToolPluginCore<MyPluginData, never, MyPluginArgs> = {
  toolDefinition: {
    type: "function",
    name: "myPlugin",
    description: "Description for the LLM",
    parameters: {
      type: "object",
      properties: { /* ... */ },
      required: [],
    },
  },
  execute: async (context, args) => {
    // Plugin logic here
    return {
      message: "Success",
      data: { /* MyPluginData */ },
    };
  },
  generatingMessage: "Processing...",
  isEnabled: () => true,
};
```

### Step 3: Create Vue Plugin

```typescript
// src/vue/index.ts
import type { ToolPlugin } from "gui-chat-protocol/vue";
import { pluginCore } from "../core/plugin";
import View from "./View.vue";
import Preview from "./Preview.vue";

export const plugin: ToolPlugin<MyPluginData, never, MyPluginArgs> = {
  ...pluginCore,
  viewComponent: View,
  previewComponent: Preview,
};

export default { plugin };
```

### Step 4: Create React Plugin

```typescript
// src/react/index.ts
import type { ToolPluginReact } from "gui-chat-protocol/react";
import { pluginCore } from "../core/plugin";
import { View } from "./View";
import { Preview } from "./Preview";

export const plugin: ToolPluginReact<MyPluginData, never, MyPluginArgs> = {
  ...pluginCore,
  ViewComponent: View,
  PreviewComponent: Preview,
};

export default { plugin };
```

## Example Implementations

### Quiz Plugin

An interactive quiz plugin that presents multiple-choice questions:

- **Repository**: [MulmoChatPluginQuiz](https://github.com/receptron/MulmoChatPluginQuiz)
- **Features**:
  - Multiple questions with choices
  - Answer tracking with viewState persistence
  - Both Vue and React implementations

```typescript
// Usage
import QuizPlugin from "@mulmochat-plugin/quiz/vue";
// or
import QuizPlugin from "@mulmochat-plugin/quiz/react";
```

### GenerateImage Plugin

An image generation plugin that creates images from text prompts:

- **Repository**: [MulmoChatPluginGenerateImage](https://github.com/receptron/MulmoChatPluginGenerateImage)
- **Features**:
  - Text-to-image generation
  - File upload and clipboard paste support
  - Backend abstraction for different providers

```typescript
// Usage
import GenerateImagePlugin from "@mulmochat-plugin/generate-image/vue";
```

## Compatible Applications

### MulmoChat

A multi-modal voice chat application with comprehensive plugin support:

- **Repository**: [MulmoChat](https://github.com/receptron/MulmoChat)
- **Features**:
  - OpenAI Realtime API integration
  - Voice and text input
  - Multiple backend providers
  - Full plugin ecosystem

### Building Your Own Application

Any application can implement the GUI Chat Protocol by:

1. Loading plugins that export `{ plugin }` default export
2. Passing tool definitions to the LLM
3. Executing plugins via `plugin.execute(context, args)`
4. Rendering plugin components (`viewComponent`/`previewComponent`)
5. Handling `ToolResult` for UI updates and LLM responses

```typescript
// Example: Loading a plugin
import Plugin from "@mulmochat-plugin/quiz/vue";

// Get tool definition for LLM
const tools = [Plugin.plugin.toolDefinition];

// Execute when LLM calls the tool
const result = await Plugin.plugin.execute(context, args);

// Render the view component
<component :is="Plugin.plugin.viewComponent" :selected-result="result" />
```

## Framework Support

| Framework | Import Path | Plugin Type |
|-----------|-------------|-------------|
| Core (no UI) | `gui-chat-protocol` | `ToolPluginCore` |
| Vue 3 | `gui-chat-protocol/vue` | `ToolPlugin` |
| React 18/19 | `gui-chat-protocol/react` | `ToolPluginReact` |

Both Vue and React are optional peer dependencies - only install what you need.

## TypeScript Support

Full TypeScript support with generic type parameters:

```typescript
// T = Tool data type (UI only)
// J = JSON data type (sent to LLM)
// A = Arguments type
// H = Input handler type (extensible)
// S = Start response type (app-specific)

type ToolPlugin<T, J, A, H, S>
```

## License

MIT
