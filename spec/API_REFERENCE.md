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

#### `data` gates rendering

**Setting `data` is the host's render-eligibility signal**: a result with `data` renders a GUI card; a result without `data` is *narrate-only* — `message` / `instructions` reach the LLM, but no card is shown. Narrate-only is the right shape for actions whose effect is purely informational for the LLM (fetching a list the LLM will summarize next turn, returning a validation error, etc.).

`jsonData` is orthogonal to rendering. It's the JSON-serializable copy returned to the LLM alongside `message` / `instructions`, used when the model needs to read the structured result back on subsequent turns. Setting `jsonData` alone does NOT cause a card to render — pair it with `data` if you also want the view to bind the same shape.

#### What to set

| Combination | Behaviour | Use when |
|---|---|---|
| `data` only | Card renders; LLM sees only `message` | The view needs a typed payload the LLM doesn't need to recall. |
| Neither | Narrate-only; no card | The action is informational for the LLM (list lookups, validation errors). |
| Both (`data: payload, jsonData: payload`) | Card renders AND LLM reads the same payload back | The view and the LLM both reason over the same shape (quiz definitions, form specs). |
| `jsonData` only | No card; LLM gets a JSON copy | Uncommon — equivalent to narrate-only for the GUI. |

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
