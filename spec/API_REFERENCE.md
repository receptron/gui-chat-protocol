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
  sequence?: SequenceStep | null; // 2.1 — see "Sequences" below
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
  userSpokeAt?: number; // 2.1 — when the user last spoke, ms since the epoch
}

interface ToolContextApp {
  getConfig: {
    (key: string): unknown;
    <T>(key: string, parse: (raw: unknown) => T): T | undefined;
  };
  setConfig: (key: string, value: unknown) => void;
}
```

`getConfig` reads the host's config store, so it hands back `unknown` unless you pass a reader:

```typescript
const model = app.getConfig("llm.model", (raw) => String(raw));
```

`parse` is not called for a missing key — the result is `undefined`.

#### Conventional `context.app` functions

`ToolContextApp` is an open record: a host adds the backend functions it has, and a plugin checks
for one before calling it. These are the ones hosts share today (MulmoChat and MulmoGlass), so a
plugin can rely on their shape where they exist:

| Function | Returns | Notes |
|---|---|---|
| `generateImage(prompt: string)` | `ToolResult` | A new picture. `data.imageData` is a data URL; `data.imagePath` is where the host saved it (`artifacts/images/…`), when it did. |
| `editImages(prompt: string, imagePaths: string[])` | `ToolResult` | A new picture from saved ones and a prompt: one to restyle, or references to draw with (a character's sheet). 1 to 8 paths under `artifacts/images/`, `.png`, `.jpg` or `.webp`; anything else is a failed result saying why, not a throw. Same result shape as `generateImage`. The same arguments and limits as MulmoClaude's `editImages` tool, which the model calls directly. |

The index signature types them as returning `unknown`; narrow before use.

### Sequences (2.1)

A sequence is a set of steps the model shows one at a time with a tool: a slideshow's slides, a
story's panels. Each step's result tells the model, in `instructions`, to talk about the step and
call the next one in the same reply. Models sometimes end the reply instead, so a host that
supports sequences asks the model once to go on.

```typescript
interface SequenceStep {
  step: number;           // from 1 (0 for something before the first step, such as a cast)
  total: number;
  kind: string;           // "slideshow", "story": for the host's wording
  label: string;          // "Slide 2 of 5": what is on the screen
  onShown: string;        // "explain it": what the model does with a step
  nextCall: string;       // "call presentSlide for slide 3 of 5"
  waitsForUser?: boolean; // the next step waits for the user: don't ask
}
```

`ToolResult.sequence`:

| Value | Means | The host |
|---|---|---|
| a `SequenceStep` | the step is on the screen | keeps the sequence going from it |
| `null` | a step that wasn't shown (the picture failed) | stops: asking again would fail again |
| absent | not part of a sequence | changes nothing (a chart shown mid-slideshow) |

A `cancelled` result changes nothing either.

`ToolContext.userSpokeAt` is when the user last spoke or sent a message (`Date.now()` ms), or absent
when the host doesn't know. A plugin whose step waits for the user holds a later step until the
user has spoken since the waiting one appeared, and returns that as a `cancelled` result without
instructions. It is a number, so a host that runs `execute()` on a server sends it with the request.

`createSequenceKeeper(options)` is the host side, framework-agnostic:

```typescript
const keeper = createSequenceKeeper({
  isIdle: () => !replying && !audioPlaying && !toolRunning && !userSpeaking,
  sendInstructions: (text) => session.sendInstructions(text), // required instructions
  continueConversation, // text chat only: a turn for queued, unanswered instructions
});

// A tool call started:       const startedAt = Date.now();
// Its context:               { …, userSpokeAt: keeper.userSpokeAt() }
// Its result arrived:        const replaced = keeper.observe(result, startedAt);
//                            if (replaced) result.instructions = replaced;
// The model's reply or audio ended:  keeper.replyEnded();
// The user spoke or sent a message:  keeper.userSpoke();
// The chat ended:                    keeper.stop();
```

It asks at most once per step, never after the last step or a step that waits for the user, and
looks again while the host is busy. The user speaking stops it; a step asked for before the user
spoke gets instructions to answer them first (`observe` returns them).

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
