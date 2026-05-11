# AI-Native Business Application Architecture

## Overview

A new architecture for building business applications, designed from the ground up around the capabilities of modern LLMs. Instead of bolting AI onto an existing SaaS-shaped stack, this architecture treats the LLM as a **first-class peer** of the GUI — both presenting and operating on the same authoritative domain module.

The result is a smaller, leaner application stack: business logic at the center, a thin GUI for structured views, and an LLM that operates the same API as the GUI. The GUI Chat Protocol provides the connective tissue that makes this work, and a shared catalog of presentation primitives (`presentForm`, `presentChart`, `presentMarkdown`, `presentSpreadsheet`, …) lets each business application stay narrow while still offering rich user experience.

## The Inversion

A traditional SaaS application is UI-centric:

```
   ┌──────────────────────────────────────┐
   │                UI                    │   ← the product
   ├──────────────────────────────────────┤
   │         Business logic               │   ← behind the UI
   ├──────────────────────────────────────┤
   │             Database                 │
   └──────────────────────────────────────┘
```

The UI is privileged. An API, if one exists at all, is a junior afterthought — second-class access for integration partners.

The AI-native topology inverts this:

```
          [ LLM ]                 [  UI / View  ]
              \                       /
               \                     /
                \                   /
                 ─────── API ──────
                          │
                  Business logic
                          │
                      Database
                   (file system)
```

The API is the product. Two clients — a structured UI and an LLM — call it as peers. The business logic and its data are the **only** authoritative part of the application; both clients are merely presentations of the same underlying module.

This is not "an app with an AI assistant," nor "an AI with tools." It is a single domain module with two equally legitimate ways for a human to drive it: clicking, or asking.

## Three Layers

### 1. Domain module

The business logic and its data. For a ledger: double-entry invariants, append-only journal, opening balances, balance-sheet derivation. The domain module owns the **invariants** — the rules that must hold regardless of which client is calling.

Data lives on the file system. Files are the database. The workspace IS the data layer. No external database, no SaaS dependency, no opaque sync. The user owns the data.

### 2. API

A single typed contract that both clients call. In MulmoClaude's reference implementation, this is one REST endpoint per domain plugin with an `action` discriminator (`POST /api/<plugin>` with `{action, ...args}`). The LLM calls it via MCP; the GUI calls it directly. Same shape, same handlers, same results.

Because there is exactly one contract, manual clicks and LLM tool calls flow through the same service layer and produce identical state changes. There is no drift between "what the UI can do" and "what the AI can do."

### 3. Two presentations

- **Structured UI** — a canonical, fixed-schema interface for the things users want to look at: a balance sheet that looks like a balance sheet, a journal that looks like a journal. This is a thin layer that contains *no business logic*. It reads via the API and writes via the API.

- **LLM** — a conversational interface that can read the same API, call the same operations, and reason about the state. The LLM is taught about the domain through the tool schema and through per-action response messages embedded in the API's responses.

## The Role of GUI Chat Protocol

The architecture would not scale to many applications without a shared presentation toolkit. GUI Chat Protocol provides this: a set of independently-developed **presentation plugins** that any LLM can invoke.

```
   presentForm         — render a form for the user to fill in
   presentChart        — render numeric data as a chart
   presentMarkdown     — render rich text
   presentSpreadsheet  — render tabular data as an editable sheet
   …
```

These presenters are not part of any business application. They are general-purpose components, developed and maintained on their own cadence, available to every plugin and every LLM invocation. A business application does not ship its own chart library; it ships chart-ready data, and the LLM binds the two at runtime:

```
   accounting.getTimeSeries  →  data  →  presentChart  →  rendered
                                  ↑
                         LLM composes the pipeline
```

The LLM is therefore not just a controller of one plugin — it is a **composition operator** across plugins. A workflow like "graph my Q3 revenue" exists *nowhere as code*. It exists only as the LLM's runtime decision to read from one plugin and write into another.

This has two structural consequences:

1. **Domain plugins stay narrow.** There is no incentive to absorb presentation concerns; the LLM will pick a better-suited presenter than any plugin author could inline.
2. **Presentation plugins improve independently.** A better `presentChart` — more chart types, better axes, smarter legends — benefits every domain plugin at once, without any of them being touched.

The OS analogy is exact: macOS apps do not ship `NSButton`. The OS provides the widget vocabulary. AI-native apps do not ship `presentChart`. The shell provides the presentation vocabulary; the LLM provides the dataflow glue.

## The Shell

MulmoClaude plays the role of the operating-system shell. It provides:

| Shell primitive          | What it does                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------- |
| **Workspace**            | Shared file-system root that every plugin treats as its database                      |
| **Roles**                | Which plugins / tools are visible to each chat context                                |
| **MCP bridge**           | Transport that lets the LLM call any plugin's API                                     |
| **View-mounting**        | Protocol for a plugin to ask the shell to render its UI on the canvas                 |
| **Presentation toolkit** | `presentForm` / `presentChart` / `presentMarkdown` / `presentSpreadsheet` and friends |

Together these primitives make plugins **dual-driven by default**. A plugin author writes the domain module, exposes an API, writes a thin UI for fixed-schema views, and declares a tool schema for the LLM. The shell handles the rest.

## Reference Implementation: manageAccounting

The `manageAccounting` plugin in MulmoClaude is a working example.

- **Domain module** (`server/accounting/`): a double-entry ledger with append-only journal, opening balances, snapshot cache, and time-series aggregation. The invariants are real — every entry must balance, no entries are ever deleted, corrections are reversing pairs.
- **Database**: per-book directory under `data/accounting/books/<bookId>/` containing `accounts.json`, `journal/YYYY-MM.jsonl`, and `snapshots/YYYY-MM.json`. Plain files; the user owns them.
- **API**: single `POST /api/accounting` endpoint with an `action` discriminator (`createBook`, `addEntries`, `getReport`, `getTimeSeries`, …). One contract for both clients.
- **GUI**: `<AccountingApp>` component, mounted on the canvas via the `openBook` action. Contains the journal list, balance sheet, profit & loss, ledger, and settings. Calls the same `/api/accounting` endpoint as the LLM.
- **LLM**: invokes the same endpoint via MCP. When the user asks "graph my quarterly revenue," the LLM calls `getTimeSeries` (domain) and then `presentChart` (presentation). **The accounting plugin has no chart code.**

The user can switch fluidly between conversation and direct manipulation without state drift, because both modes are operating on the same ledger through the same API.

## What This Changes

Building a new business application collapses to four steps:

1. Write the domain module (logic + invariants).
2. Expose an API.
3. Write a thin UI for the fixed-schema views the user wants to look at.
4. Declare a tool schema for the LLM.

Steps 3 and 4 are both *presentation*. They are cheap once step 1 is sound. Traditional SaaS over-invests in step 3 because there is no step 4; this architecture lets step 4 carry weight, which changes how much UI you actually need.

The pattern earns its keep where the **invariants are the value**: accounting, scheduling, inventory, contracts, planning. Apps where the rules must be sound regardless of who is calling. For thin apps (notes, bookmarks), the LLM can edit files directly and the plugin layer disappears entirely.

## Why Now

Three capabilities had to converge:

1. **LLMs that can read typed schemas and call APIs reliably.** Tool-calling is no longer experimental; it is the substrate.
2. **A presentation protocol that the LLM can drive.** GUI Chat Protocol gives the LLM not just data but the ability to mount UI, including reusable presenters.
3. **A shell that hosts both.** Workspace, roles, MCP bridge, view-mounting, and a shared presentation toolkit.

None of these alone is sufficient. Together they make a different application architecture possible — one in which the LLM is not a feature of an app, but a first-class operator of the system the app exposes.

## See Also

- [`GUI_CHAT_PROTOCOL.md`](./GUI_CHAT_PROTOCOL.md) — the underlying protocol that enables typed presentation
- [`CREATING_A_PLUGIN.md`](./CREATING_A_PLUGIN.md) — practical guide to building a plugin
- [`PLUGIN_RUNTIME.md`](./PLUGIN_RUNTIME.md) — how plugins are loaded and dispatched at runtime
- [`API_REFERENCE.md`](./API_REFERENCE.md) — protocol-level API reference
