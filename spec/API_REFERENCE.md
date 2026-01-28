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
