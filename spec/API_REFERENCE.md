# GUI Chat Protocol API Reference

Authoritative reference for the TypeScript contracts exposed by the `gui-chat-protocol` package and its Vue/React adapters. For protocol motivation and UX concepts, see `spec/GUI_CHAT_PROTOCOL.md`; for package usage patterns, see `README.md`.

## Core Types

### ToolPluginCore

```typescript
interface ToolPluginCore<T, J, A, H, S> {
  toolDefinition: ToolDefinition;
  execute: (context: ToolContext, args: A) => Promise<ToolResult<T, J>>;
  generatingMessage: string;
  isEnabled: (startResponse?: S | null) => boolean;
  inputHandlers?: H[];
  systemPrompt?: string;
  samples?: ToolSample[];
  backends?: BackendType[];
}
```

### ToolResult

```typescript
interface ToolResult<T, J> {
  message: string;
  data?: T;
  jsonData?: J;
  instructions?: string;
  title?: string;
  updating?: boolean;
}
```

#### Rendering vs narrate-only

Hosts treat `data` and `jsonData` as the two "view payload" signals. Setting **either** indicates the plugin wants a GUI card rendered for this result; setting **neither** makes the result *narrate-only* — `message` / `instructions` reach the LLM, but no card is shown. Narrate-only is the right shape for actions whose effect is purely informational for the LLM (fetching a list the LLM will summarize next turn, returning a validation error, etc.).

#### Choosing `data` vs `jsonData` vs both

| Field | Audience | When to set it |
|---|---|---|
| `data` | Plugin's view / preview component | The view needs a typed payload that the LLM should NOT see. |
| `jsonData` | The LLM (returned alongside `message` / `instructions`) | The LLM needs to read the structured result back on subsequent turns. |
| **Both** | View AND LLM (same shape) | The same payload needs to reach both audiences — set `data: payload, jsonData: payload`. |

Worked examples:

```ts
// Card with view-only payload (LLM only needs to know it succeeded)
return { message: "Generated image", data: { url, prompt } };

// Narrate-only (no card)
return { message: `Found ${reports.length} reports`, instructions: "..." };

// Card + LLM-readable payload — same payload, two audiences
return { message: "Form presented", data: form, jsonData: form, instructions: "..." };
```

### ToolContext

```typescript
interface ToolContext {
  currentResult?: ToolResult | null;
  app?: ToolContextApp;
}

interface ToolContextApp {
  getConfig: <T>(key: string) => T | undefined;
  setConfig: (key: string, value: unknown) => void;
}
```

## Input Handlers

```typescript
type InputHandler =
  | FileInputHandler
  | ClipboardImageInputHandler
  | UrlInputHandler
  | TextInputHandler
  | CameraInputHandler
  | AudioInputHandler;
```

## Framework Adapters

### Vue Types

```typescript
import { ToolPlugin } from "gui-chat-protocol/vue";

interface ToolPlugin<T, J, A, H, S> extends ToolPluginCore<T, J, A, H, S> {
  viewComponent?: Component;
  previewComponent?: Component;
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
