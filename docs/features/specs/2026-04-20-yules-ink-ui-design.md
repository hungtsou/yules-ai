# yules-ai CLI: React + Ink terminal UI with tools, approval, and context management

## Context

Today `yules-ai` is a Node/TS ESM CLI (`tsc` → `dist/`) whose runtime is a `readline` loop in `src/agent/run.ts` that streams `streamText` output line-by-line to stdout. `AGENTS.md` states that **Ink is the intended terminal UI** and that the product's capabilities include filesystem, shell, and web search tools — none of which are wired up yet.

This spec replaces the `readline` loop with a **React + Ink** interactive UI and adds the tool, approval, and context-management stack needed to make that UI meaningful. The shape closely follows the reference repo [`Hendrixer/agents-v2@done`](https://github.com/Hendrixer/agents-v2/tree/done/src), scoped to this project's product intent.

## Goals

1. **Ink-driven CLI.** `yules-ai` renders a React + Ink app; the old `readline` loop is removed. UI owns conversational state and drives the agent.
2. **Callback-based agent API.** Refactor `runAgent` from a self-contained I/O loop into a **single-turn, callback-driven** function the UI invokes per user submit.
3. **Tool support.** Register filesystem (`readFile`, `writeFile`, `listFiles`, `deleteFile`), shell (`runCommand`), and web search (`webSearch`) tools.
4. **Approval flow.** Only destructive / side-effecting tools (`writeFile`, `deleteFile`, `runCommand`) prompt the user. Read-only tools (`readFile`, `listFiles`, `webSearch`) auto-approve.
5. **Context management.** Estimate per-turn token usage against the model's context window; **compact** history when a threshold is crossed; display usage in the UI.
6. **Keep packaging unchanged.** `tsc → dist/`, `bin: dist/cli.js`, global install + cwd `.env` behavior preserved. Model stays `openai('gpt-5-mini')`.

## Non-goals

- Porting the reference's `executeCode` JS-sandbox tool — not in `AGENTS.md` product goals.
- Porting `@lmnr-ai/lmnr` telemetry — not in this project's stack.
- Persisting chat history across processes.
- An eval harness.
- New tools beyond the reference set above.
- Automated tests in this slice (manual verification only; a vitest suite is a follow-up spec).
- MCP, subagents, slash commands.

## Architecture

### File layout

Everything below is **new** unless stated otherwise. Rewrites are marked.

```text
src/
├── cli.ts                              # rewritten: env check → render(<App/>)
├── types.ts                            # AgentCallbacks, ToolApprovalRequest, ToolCallInfo, TokenUsageInfo, ModelLimits
├── agent/
│   ├── run.ts                          # rewritten: single-turn, callback-driven
│   ├── executeTool.ts                  # dispatch a tool call to its executor
│   ├── system/
│   │   ├── prompt.ts                   # unchanged (reference uses same prompt)
│   │   └── filterMessages.ts           # strip model-incompatible messages
│   ├── context/
│   │   ├── index.ts                    # re-exports
│   │   ├── modelLimits.ts              # per-model context-window table
│   │   ├── tokenEstimator.ts           # estimateMessagesTokens + percentage helpers
│   │   └── compaction.ts               # summarize history when over threshold
│   └── tools/
│       ├── index.ts                    # tool registry + requiresApproval()
│       ├── file.ts                     # readFile, writeFile, listFiles, deleteFile
│       ├── shell.ts                    # runCommand (shelljs)
│       └── webSearch.ts                # openai.tools.webSearch({})
└── ui/
    ├── index.tsx                       # barrel re-exports
    ├── App.tsx                         # top-level Ink app + callbacks wiring
    └── components/
        ├── Input.tsx                   # prompt line (Ink useInput)
        ├── MessageList.tsx             # chat transcript
        ├── Spinner.tsx                 # ink-spinner wrapper
        ├── ToolCall.tsx                # one tool-call card (pending/complete)
        ├── ToolApproval.tsx            # y/n approval prompt
        └── TokenUsage.tsx              # context-window usage bar
```

### Build and runtime

- **Compile:** keep `tsc → dist/`. `bin: dist/cli.js` unchanged.
- **tsconfig.json** additions: `"jsx": "react-jsx"`, include `src/**/*.tsx`. Existing `NodeNext` module settings stay.
- **Relative imports** inside `src/` continue to use the project's current ESM convention (`.js` extensions on compiled relative imports). We do **not** adopt the reference's `.tsx` / `.ts` runtime-import style.
- **Dependencies added** to `package.json`:
  - prod: `react@^19`, `ink@^6`, `ink-spinner@^5`, `zod@^4`, `shelljs@^0.10`
  - dev: `@types/react@^19`, `@types/shelljs@^0.8`
- `@ai-sdk/openai` must expose `openai.tools.webSearch({})` as a provider tool; if the repo's current pinned version does not, bump to the minimum version that does as part of implementation.

### Agent API contract

`src/agent/run.ts` exports one function. It performs no terminal I/O; the UI owns I/O via callbacks.

```ts
// src/types.ts (abridged)
export interface AgentCallbacks {
  onToken: (token: string) => void;
  onToolCallStart: (name: string, args: unknown) => void;
  onToolCallEnd: (name: string, result: string) => void;
  onComplete: (response: string) => void;
  onToolApproval: (name: string, args: unknown) => Promise<boolean>;
  onTokenUsage?: (usage: TokenUsageInfo) => void;
}

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextWindow: number;
  threshold: number; // 0..1
  percentage: number; // 0..100
}

// src/agent/run.ts
export async function runAgent(
  userMessage: string,
  history: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]>;
```

### Agent turn loop

Each `runAgent` call runs exactly one user turn end-to-end, including any tool-call rounds, then returns the updated `ModelMessage[]` history:

1. `workingHistory = filterCompatibleMessages(history)` — strip messages the current model can't accept.
2. `preCheck = estimateMessagesTokens([system, ...workingHistory, user])`.
3. If `isOverThreshold(preCheck.total, contextWindow)` → `workingHistory = await compactConversation(workingHistory, model)`.
4. `messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...workingHistory, { role: 'user', content: userMessage }]`.
5. `reportTokenUsage(messages)` via `onTokenUsage?` (no-op if callback absent).
6. Enter the tool-call loop:
   1. `result = streamText({ model: openai('gpt-5-mini'), messages, tools })` — **no** telemetry options.
   2. Iterate `result.fullStream`:
      - `text-delta` → accumulate `currentText`, `callbacks.onToken(chunk.text)`.
      - `tool-call` → push to local `toolCalls[]`, `callbacks.onToolCallStart(name, input)`.
   3. On stream error: if `currentText` is empty and message is `"No output generated"`, emit a fallback apology to `onToken` and break the outer loop; otherwise if `currentText` is non-empty, continue (preserve partial text); otherwise rethrow.
   4. `fullResponse += currentText`. `finishReason = await result.finishReason`.
   5. If `finishReason !== 'tool-calls'` or `toolCalls.length === 0`: append `result.response.messages` to `messages`, report tokens, break.
   6. Otherwise append response messages, report tokens, then for each `tc` of `toolCalls` in order:
      - If `requiresApproval(tc.toolName)`: `approved = await callbacks.onToolApproval(tc.toolName, tc.args)`; if `false`, set `rejected = true` and break the for-loop.
      - Otherwise `approved = true` implicitly (auto-approved).
      - `result = await executeTool(tc.toolName, tc.args)`; `callbacks.onToolCallEnd(name, result)`.
      - Append a `tool-result` message part to `messages` (shape matches AI SDK v6: `{ role: 'tool', content: [{ type: 'tool-result', toolCallId, toolName, output: { type: 'text', value: result } }] }`). Report tokens.
   7. If `rejected`, break outer loop.
   8. Otherwise continue outer loop (the model will react to the tool results).
7. `callbacks.onComplete(fullResponse)`. Return `messages`.

### Tools

| Tool | File | Execution | Approval |
|---|---|---|---|
| `readFile(path)` | `agent/tools/file.ts` | local `fs.readFile` | no (auto) |
| `writeFile(path, content)` | `agent/tools/file.ts` | local; `fs.mkdir` parents then `fs.writeFile` | **yes** |
| `listFiles(directory=".")` | `agent/tools/file.ts` | local `fs.readdir({ withFileTypes: true })` | no (auto) |
| `deleteFile(path)` | `agent/tools/file.ts` | local `fs.unlink` | **yes** |
| `runCommand(command)` | `agent/tools/shell.ts` | `shelljs.exec(command, { silent: true })` | **yes** |
| `webSearch` | `agent/tools/webSearch.ts` | OpenAI provider tool — `executeTool` returns a "provider tool" sentinel string; OpenAI runs it server-side | no (auto) |

All `execute` functions catch their own errors and return a string (e.g. `"Error: File not found: <path>"`). The agent loop never needs to try/catch a tool execution.

### Tool registry and approval gate

```ts
// src/agent/tools/index.ts (abridged)
export const tools = { readFile, writeFile, listFiles, deleteFile, runCommand, webSearch };
export type ToolName = keyof typeof tools;

const TOOLS_REQUIRING_APPROVAL: ReadonlySet<string> = new Set([
  'writeFile',
  'deleteFile',
  'runCommand',
]);

export function requiresApproval(name: string): boolean {
  return TOOLS_REQUIRING_APPROVAL.has(name);
}
```

`executeTool(name, args)` looks the tool up by name, calls `tool.execute(args, { toolCallId: '', messages: [] })`, stringifies the result, and returns it. If the tool has no `execute` (provider tool like `webSearch`), it returns `"Provider tool <name> — executed by model provider"`. Unknown tools return `"Unknown tool: <name>"`.

### Context and token management

- `agent/context/modelLimits.ts`: `getModelLimits(modelName)` returns `{ inputLimit, outputLimit, contextWindow }` from a hard-coded table; falls back to conservative defaults for unknown models.
- `agent/context/tokenEstimator.ts`: `estimateMessagesTokens(messages)` returns `{ input, output, total }` using a character-count heuristic (≈ 4 chars/token); `calculateUsagePercentage(total, contextWindow)`.
- `agent/context/compaction.ts`: `compactConversation(history, modelName)` summarizes the oldest N-2 messages into a single system-style assistant message via a separate `streamText` call; keeps the two most recent user/assistant turns verbatim. Returns a new `ModelMessage[]`.
- `agent/context/index.ts` re-exports the above and exports `DEFAULT_THRESHOLD = 0.8` plus an `isOverThreshold(total, contextWindow)` helper.

Compaction policy (matches reference):
- Triggered only in `runAgent` step 3 above, before the turn begins.
- After compaction, the turn proceeds against the compacted history; the UI is not notified directly but sees lower token usage via `onTokenUsage`.

### System prompt

`src/agent/system/prompt.ts` is **unchanged**. The reference repo uses the same prompt text we already have; the AI SDK injects tool names and schemas into the model context via the `tools` parameter of `streamText`, so the prompt doesn't need to enumerate them. Future specs may add tool-specific guidance if needed.

### `filterCompatibleMessages`

`agent/system/filterMessages.ts` exports `filterCompatibleMessages(history)`. It drops or rewrites messages that the current OpenAI model can't accept (e.g. tool-result messages whose shape has changed between SDK versions, or empty assistant messages). Implementation scope is: walk the array, keep only `user`, `assistant`, and `tool` roles with well-formed content; drop anything else.

## UI

### Component tree

```text
<App>
 ├─ header: title + "type 'exit' to quit"
 ├─ <MessageList messages={messages} />
 ├─ streaming assistant block  (shown while isLoading && streamingText)
 ├─ <ToolCall … /> × activeToolCalls.length  (hidden when pendingApproval set)
 ├─ <Spinner/>  (shown while isLoading && no streamingText && no activeToolCalls && no pendingApproval)
 ├─ <ToolApproval … />  (replaces <Input/> when pendingApproval set)
 ├─ <Input onSubmit={handleSubmit} disabled={isLoading} />
 └─ <TokenUsage usage={tokenUsage} />
```

### App state

- `messages: Message[]` — committed turns for rendering (`{ role: 'user' | 'assistant', content: string }`).
- `conversationHistory: ModelMessage[]` — AI-SDK history, threaded through each `runAgent` call.
- `isLoading: boolean`, `streamingText: string`.
- `activeToolCalls: ActiveToolCall[]` — `{ id, name, args, status: 'pending' | 'complete', result? }`.
- `pendingApproval: ToolApprovalRequest | null` — `{ toolName, args, resolve }`.
- `tokenUsage: TokenUsageInfo | null`.

### Data flow per turn

1. User types, presses enter → `handleSubmit(userInput)`.
2. If `userInput.toLowerCase()` is `"exit"` or `"quit"` → `useApp().exit()` and return.
3. Otherwise: append user message to `messages`, set `isLoading=true`, clear `streamingText` and `activeToolCalls`.
4. `const newHistory = await runAgent(userInput, conversationHistory, callbacks)` where `callbacks`:
   - `onToken(t)` → `setStreamingText(prev => prev + t)`.
   - `onToolCallStart(name, args)` → push a pending `ActiveToolCall`.
   - `onToolCallEnd(name, result)` → flip the matching pending entry to `complete` with `result`.
   - `onComplete(response)` → if `response`, append assistant `Message`; clear `streamingText` and `activeToolCalls`.
   - `onToolApproval(name, args)` → returns a `Promise<boolean>` whose `resolve` is captured in `pendingApproval`; `<ToolApproval>` calls it when the user picks y/n.
   - `onTokenUsage(usage)` → `setTokenUsage(usage)`.
5. On success: `setConversationHistory(newHistory)`.
6. On exception: append an assistant message `"Error: <message>"`. Clear transient state in `finally`.

### Input handling

- `Input.tsx` uses Ink's `useInput` directly (no `ink-text-input` dependency). Handles: printable characters, backspace, left/right arrow (cursor), enter (submit), Ctrl+C (Ink default exit).
- `ToolApproval.tsx` uses `useInput` to capture `y`/`n`/enter (enter = default No).

### Visual detail

- Header renders bold + accent color, title `yules-ai` (no emoji; the reference's 🤖 is optional and omitted for consistency with current stdout output).
- `MessageList` renders each message with a colored role label (`› You` / `› Assistant`) and indented content.
- Streaming block has a trailing gray cursor glyph (`▌`) until `onComplete`.
- `ToolCall` shows name, truncated args JSON, and status pill (`pending` spinner / `complete` check).
- `ToolApproval` shows the tool name and args and a `(y/N)` prompt.
- `TokenUsage` shows `input/output/total` + a compact progress bar colored by threshold (green < 70%, yellow 70–85%, red ≥ 85%).

## Error handling and signals

- **Env missing:** unchanged from today. `cli.ts` prints `"yules-ai: OPENAI_API_KEY is missing or empty. Create a .env file …"` to stderr and exits 1 **before** Ink renders.
- **Agent stream error:** caught in `App.handleSubmit`'s try/catch; a synthetic assistant message `"Error: <message>"` is appended, transient state cleared in `finally`. The Ink app keeps running.
- **"No output generated" partial-failure:** handled inside `runAgent` (see turn loop, step 6.3). Produces a fallback apology that streams via `onToken` so the UI displays it normally.
- **Tool execution errors:** caught inside each tool's `execute`; surfaced as result strings. The agent loop treats them as ordinary tool results and lets the model react.
- **Tool rejection:** user picks "no" → `onToolApproval` resolves `false` → current turn breaks cleanly; assistant text emitted before the rejected call is still committed to history on the next turn boundary; UI input re-enables.
- **Ctrl+C / Ctrl+D:** Ink's default handling terminates the process with exit code 0.

## Files and responsibilities

| Path | Responsibility |
|---|---|
| `src/cli.ts` (rewritten) | Shebang, `dotenv` from cwd, env validation, `render(React.createElement(App))`. No readline. |
| `src/types.ts` (new) | `AgentCallbacks`, `ToolApprovalRequest`, `ToolCallInfo`, `TokenUsageInfo`, `ModelLimits`. |
| `src/agent/run.ts` (rewritten) | Single-turn callback-driven loop; no terminal I/O. |
| `src/agent/executeTool.ts` (new) | Dispatch tool name → `tool.execute(args, ctx)`; stringify result; handle provider tools and unknown tools. |
| `src/agent/system/prompt.ts` (unchanged) | Existing `SYSTEM_PROMPT` text retained as-is. |
| `src/agent/system/filterMessages.ts` (new) | `filterCompatibleMessages(history)`. |
| `src/agent/context/*` (new) | `modelLimits`, `tokenEstimator`, `compaction`, `index`, `DEFAULT_THRESHOLD`, `isOverThreshold`. |
| `src/agent/tools/*` (new) | `file.ts`, `shell.ts`, `webSearch.ts`, `index.ts` with registry + `requiresApproval`. |
| `src/ui/*` (new) | Ink components and `App`. |
| `tsconfig.json` (updated) | `"jsx": "react-jsx"`. |
| `package.json` (updated) | Add prod + dev deps listed under Build and runtime. No changes to `bin` or scripts. |

## Verification (manual)

Run from the repo root. Preconditions: a valid `.env` with `OPENAI_API_KEY` in the repo root (or cwd when invoking the installed binary).

1. `npm run check` — build, lint, prettier all pass.
2. `node dist/cli.js` — header renders; blinking cursor in input; no readline "You: " prompt.
3. Send a plain prompt ("Say hi") — tokens stream into the assistant block; on completion, the block commits into `MessageList`; a `TokenUsage` row appears/updates.
4. Ask a prompt that triggers a read-only tool (e.g. "list files in src"): a `ToolCall` pending card appears, **no approval prompt**, card flips to complete, assistant summarizes.
5. Ask a prompt that triggers `writeFile` or `runCommand`: a `ToolApproval` panel replaces the input; pressing `y` executes the tool and the turn continues; pressing `n` ends the turn cleanly and re-enables input.
6. Multi-turn: several turns grow the transcript; `TokenUsage` percentage grows; no crashes.
7. `exit` or `quit` submission, or Ctrl+C, terminates the process with exit code 0.
8. Running from a directory without `OPENAI_API_KEY` exits 1 before Ink renders, with the existing error message on stderr.

## Migration notes

- The rewrite removes the existing readline loop entirely; no code path keeps it as a fallback.
- `SYSTEM_PROMPT` content changes; existing tests (none) or downstream consumers (none) do not depend on its text.
- `package.json` gains new prod deps. Global reinstall (`npm i -g .`) required for users after this lands.
- No changes to `bin` name, script names, `.env.example`, `.gitignore`, `.prettierignore`, or ESLint config. ESLint's flat config should already accept `.tsx` via `typescript-eslint`; if not, the implementation plan will add the minimum glob change.

## Open points (for the implementation plan to resolve)

- Exact `modelLimits` table contents (at minimum an entry for `gpt-5-mini` plus a conservative default). Reference uses `contextWindow: 400000` for gpt-5 family.
- Whether `Input.tsx` needs history navigation (up/down arrow to recall previous prompts) — default: **no**, matches reference.
