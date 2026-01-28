# Creating a Plugin

Step-by-step guide for building a GUI Chat Protocol plugin using the TypeScript primitives exported from this package. Use this after reviewing `spec/GUI_CHAT_PROTOCOL.md` for conceptual grounding and `spec/API_REFERENCE.md` for exact type signatures.

## Step 1: Define Plugin-Specific Types

```typescript
// src/core/types.ts
export interface MyPluginData {
  // Data for UI (not sent to LLM)
}

export interface MyPluginArgs {
  // Arguments from LLM function call
}
```

## Step 2: Create Core Plugin (Framework-Agnostic)

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

## Step 3: Create Vue Plugin

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

## Step 4: Create React Plugin

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
