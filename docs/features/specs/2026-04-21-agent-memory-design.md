# Agent memory across turns + tool activity in UI — design

Status: Approved (brainstorming). Ready for implementation plan.

## 1. Goal

Give Yules real multi-turn memory and make tool activity visible in the Ink
UI. After every `runAgent` call, the agent's full structured output
(`assistant` turns with text and/or `tool-call` parts, plus `tool` turns with
`tool-result` parts) is appended to the conversation history owned by
`useAgentChat`, so the _next_ `runAgent` call passes this structured history
back to the model. The Ink UI renders each tool call inline between user and
assistant messages as `▸ toolName(args) ✓ short-result-summary`.

This is the follow-up work anticipated as out-of-scope in
[`2026-04-21-wire-file-tools-into-run-agent-design.md`](./2026-04-21-wire-file-tools-into-run-agent-design.md)
§5 (return value) and §2 (no UI changes).

## 2. Scope & non-goals

**In scope.**

- `src/agent/run.ts`: await `result.response` after the stream drains;
  return `[...filteredHistory, ...response.messages]`.
- `src/ui/useAgentChat.ts`: replace state with `runAgent`'s returned history
  on success; maintain an in-flight tool-lines buffer keyed by
  `toolCallId`; drop the current "append synthetic
  `{ role: 'assistant', content: accumulated }`" step (the real assistant
  turn now comes from `response.messages`). Keep `streamingText` for live
  text-delta display.
- `src/ui/components/MessageList.tsx` + new
  `src/ui/components/ToolLine.tsx`: render assistant `tool-call` parts and
  `tool` message `tool-result` parts as inline lines, plus live in-flight
  lines during streaming.
- `src/agent/system/filterMessages.ts`: stop dropping assistant messages
  that carry `tool-call` parts but no text. Preserve the narrow defense
  against genuinely empty / malformed assistant messages.
- `src/types.ts`: extend `AgentCallbacks.onToolCallStart` and
  `onToolCallEnd` with a `toolCallId` parameter and an optional
  `{ error?: boolean }` meta on the end event.

**Non-goals.**

- No approval gate / HITL. `onToolApproval` stays unused.
- No token-usage or context-window display. `onTokenUsage` stays unused.
- No history pruning, summarization, or persistence to disk — memory is
  session-scoped (React state) and grows until the process exits.
- No changes to `src/agent/tools/*`, `SYSTEM_PROMPT`, or telemetry
  (`Laminar` / `getTracer`).
- No new test framework. Verification is `npm run check` plus a manual CLI
  smoke (§10).
- No new `fullStream` chunk handling beyond the existing `text-delta`,
  `tool-call`, `tool-result`, `tool-error`; `error` / `abort` chunks remain
  silently ignored as today.
- No escaping of tool args / results in the terminal. Same trust model as
  streamed assistant text today.

## 3. File layout

```text
src/types.ts                          # extend AgentCallbacks tool events
src/agent/run.ts                      # await result.response, return merged history
src/agent/system/filterMessages.ts    # keep tool-call-only assistant turns
src/ui/useAgentChat.ts                # inFlightTools state; replace messages on success
src/ui/App.tsx                        # forward inFlightTools to MessageList
src/ui/components/MessageList.tsx     # render tool-call / tool-result / in-flight lines
src/ui/components/ToolLine.tsx        # new, single-line Ink component
```

No files are removed. One file (`ToolLine.tsx`) is created. All other paths
are edits to existing files.

## 4. Module contracts

### 4.1 `src/types.ts` — `AgentCallbacks`

```ts
export interface AgentCallbacks {
  onToken: (token: string) => void;
  onToolCallStart: (toolCallId: string, name: string, args: unknown) => void;
  onToolCallEnd: (
    toolCallId: string,
    name: string,
    result: string,
    meta?: { error?: boolean },
  ) => void;
  onComplete: (response: string) => void; // unchanged; unused
  onToolApproval: (name: string, args: unknown) => Promise<boolean>;
  onTokenUsage?: (usage: TokenUsageInfo) => void; // unchanged; unused
}
```

`ToolCallInfo`, `ToolApprovalRequest`, `ModelLimits`, `TokenUsageInfo`
are unchanged.

### 4.2 `src/agent/run.ts`

Signature unchanged:

```ts
export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]>;
```

Behavior changes:

| Point                    | Before                                     | After                                                                                          |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `fullStream` tool-call   | `onToolCallStart(chunk.toolName, input)`   | `onToolCallStart(chunk.toolCallId, chunk.toolName, chunk.input)`                               |
| `fullStream` tool-result | `onToolCallEnd(chunk.toolName, output)`    | `onToolCallEnd(chunk.toolCallId, chunk.toolName, stringify(chunk.output))`                     |
| `fullStream` tool-error  | `onToolCallEnd(chunk.toolName, errorStr)`  | `onToolCallEnd(chunk.toolCallId, chunk.toolName, errorToString(chunk.error), { error: true })` |
| After stream drains      | (nothing)                                  | `const response = await result.response;`                                                      |
| Return value             | `return messages` (filtered input history) | `return [...messages, ...response.messages]`                                                   |

Unchanged: `streamText` props (`model`, `system`, `messages`, `tools`,
`stopWhen: stepCountIs(10)`, `experimental_telemetry`), the
`text-delta` → `onToken` branch, the default-ignore branch, the local
`stringify` and `errorToString` helpers.

`userMessage` continues to be unused inside the function. The caller
(`useAgentChat`) always includes the user turn in `conversationHistory`.
Keeping the parameter preserves the signature and avoids churn at call
sites and in existing specs.

### 4.3 `src/agent/system/filterMessages.ts`

`filterCompatibleMessages(messages)` retains:

- every `user` and `system` message;
- every `tool` message;
- every `assistant` message whose content is either:
  - a non-empty string, or
  - an array containing at least one part that is either a
    non-empty text part (`type: 'text'`, non-empty `.text`), a `tool-call`
    part (`type: 'tool-call'`), or a reasoning part
    (`type: 'reasoning'`).

It drops only assistant messages whose content is empty or an array of
parts that match none of the above. The exported name and signature do
not change.

### 4.4 `src/ui/useAgentChat.ts`

Additions:

```ts
interface InFlightTool {
  name: string;
  argsPreview: string; // previewArgs(input), ~80 chars
  status: 'running' | 'ok' | 'error';
  summary?: string; // summarizeToolOutput(name, raw), ~80 chars
}

const [inFlightTools, setInFlightTools] = useState<
  Record<string, InFlightTool>
>({});
```

Exposed API:

```ts
export interface UseAgentChat {
  messages: ModelMessage[];
  streamingText: string;
  status: ChatStatus;
  error: string | null;
  send: (text: string) => void;
  inFlightTools: Record<string, InFlightTool>;
}
```

`send(text)` behavior:

1. Build `userMessage`, `nextMessages = [...messages, userMessage]`.
2. `setMessages(nextMessages); setStreamingText(''); setInFlightTools({}); setError(null); setStatus('streaming');`
3. Call `runAgent(trimmed, nextMessages, callbacks)` with:
   - `onToken(token)` → accumulate into local `accumulated`, mirror to
     `streamingText` (unchanged).
   - `onToolCallStart(id, name, input)` →
     `setInFlightTools(prev => ({ ...prev, [id]: { name, argsPreview: previewArgs(input), status: 'running' } }))`.
   - `onToolCallEnd(id, name, result, meta)` →
     `setInFlightTools(prev => ({ ...prev, [id]: { ...(prev[id] ?? { name, argsPreview: '' }), status: meta?.error ? 'error' : 'ok', summary: summarizeToolOutput(name, result) } }))`.
     (The `prev[id] ?? …` branch handles an end event arriving without a
     prior start, per §6.)
   - `onComplete`, `onToolApproval` → unchanged no-ops.
4. On resolve: `setMessages(returned); setStreamingText(''); setInFlightTools({}); setStatus('idle');`
5. On reject: `setError(msg); setStreamingText(''); setInFlightTools({}); setStatus('idle');` — `messages` stays at `nextMessages`.

Two pure helpers live in this file (or a sibling
`src/ui/useAgentChat.helpers.ts` if it reads better):

- `previewArgs(input: unknown): string` — `JSON.stringify` the input
  (fallback `String(input)`), collapse runs of whitespace to single
  spaces, truncate to 80 chars with a trailing `…` when cut.
- `summarizeToolOutput(name: string, raw: string): string` — return the
  first line of `raw` starting with `Successfully ` if present;
  otherwise the first non-empty line; truncate to 80 chars with a
  trailing `…` when cut. `name` is accepted for future per-tool
  formatting but not used in the initial implementation.

### 4.5 `src/ui/App.tsx`

One destructure + one prop:

```tsx
const { messages, streamingText, status, error, send, inFlightTools } = useAgentChat();
…
<MessageList
  messages={messages}
  streamingText={streamingText}
  inFlightTools={inFlightTools}
/>
```

No other changes.

### 4.6 `src/ui/components/MessageList.tsx`

Props:

```ts
interface MessageListProps {
  messages: ModelMessage[];
  streamingText: string;
  inFlightTools: Record<string, InFlightTool>;
}
```

Render rules, iterating `messages` in order:

- `user`: `<Message role="user" content={toText(msg.content)} />`.
- `assistant`:
  - If `content` is a string or an array with at least one non-empty
    text part, render one `<Message role="assistant" content={text} />`
    where `text` is the concatenation of text-part `.text` values (or
    the string content as-is).
  - For each `tool-call` part in an array-content assistant message,
    render `<ToolLine mode="call" name={part.toolName} argsPreview={previewArgs(part.input)} />`.
  - Order of emission follows the array order of content parts.
- `tool`: for each content part of type `'tool-result'`, render
  `<ToolLine mode="result" name={part.toolName} status={isErrorResult(part) ? 'error' : 'ok'} summary={summarizeToolOutput(part.toolName, resultToString(part.output))} />`.
  `isErrorResult` inspects `part.output.type` (AI SDK surfaces errors
  with `type: 'error-text'` / `'error-json'`); `resultToString` handles
  `{ type: 'text', value }`, `{ type: 'json', value }`, etc. by
  returning the text value or `JSON.stringify(value)`.
- `system`: skipped.

After the message loop:

- For each `[id, entry]` in `inFlightTools`, render
  `<ToolLine mode="inflight" name={entry.name} argsPreview={entry.argsPreview} status={entry.status} summary={entry.summary} />`.
- If `streamingText !== ''`, render a pending
  `<Message role="assistant" content={streamingText} />` (same as
  today).

Tool-call parts from the assistant and the matching tool-result parts
from the subsequent `tool` message are emitted as _separate_ lines in
chronological order — the SDK already interleaves them correctly in
`response.messages`, so no pairing logic is required.

### 4.7 `src/ui/components/ToolLine.tsx` (new)

```ts
interface ToolLineProps {
  mode: 'call' | 'result' | 'inflight';
  name: string;
  argsPreview?: string;
  status?: 'running' | 'ok' | 'error';
  summary?: string;
}
```

Single-line Ink `<Text>`. Visual spec:

| `mode`     | `status`  | Format                  | Color  |
| ---------- | --------- | ----------------------- | ------ |
| `call`     | n/a       | `▸ name(argsPreview)`   | gray   |
| `inflight` | `running` | `▸ name(argsPreview) …` | yellow |
| `inflight` | `ok`      | `✓ name — summary`      | green  |
| `inflight` | `error`   | `✗ name — summary`      | red    |
| `result`   | `ok`      | `✓ name — summary`      | green  |
| `result`   | `error`   | `✗ name — summary`      | red    |

Truncation is handled upstream by `previewArgs` and
`summarizeToolOutput`; `ToolLine` does not truncate.

## 5. Data flow

```text
send(text)
  │
  ├─ nextHistory = [...messages, { role: 'user', content: text }]
  ├─ setMessages(nextHistory)
  ├─ setStreamingText(''); setInFlightTools({})
  │
  └─ runAgent(text, nextHistory, callbacks)
        │
        ├─ filtered = filterCompatibleMessages(nextHistory)
        ├─ result   = streamText({ model, system, messages: filtered, tools, stopWhen })
        │
        ├─ for await chunk of result.fullStream:
        │     text-delta   → onToken(chunk.text)
        │     tool-call    → onToolCallStart(id, name, input)
        │     tool-result  → onToolCallEnd(id, name, stringify(output))
        │     tool-error   → onToolCallEnd(id, name, errorToString(error), { error: true })
        │
        ├─ response = await result.response
        └─ return [...filtered, ...response.messages]
              │                  │
              │                  └─ assistant turn(s): text + tool-call parts,
              │                     tool turn(s): tool-result parts
              │
              └─ filtered input history (for reference; equal to nextHistory
                 when the filter is a near-identity, which is the expected case)

On resolve:  setMessages(returned); clear streamingText & inFlightTools; status='idle'
On reject:   keep messages = nextHistory; clear streamingText & inFlightTools; setError; status='idle'
```

**Invariants.**

1. `messages` state is always a valid `ModelMessage[]` that can be
   passed straight back into `runAgent`.
2. `streamingText` and `inFlightTools` only contribute to rendering
   while `status === 'streaming'`. They are cleared in the same React
   update that installs the new canonical history, so a tool line or
   pending text blob is never rendered twice (once live, once canonical)
   for the same event.
3. Rejected turns do not partially persist. The history after a
   rejection equals the history just before the rejected `send`, plus
   the user turn that triggered it.

## 6. Error handling

- **Stream throws.** Exception propagates out of `runAgent`;
  `useAgentChat`'s existing `try/catch` handles it per §5. No partial
  assistant/tool turns are persisted.
- **`result.response` rejects.** Same handling and same outcome as
  above.
- **Tool `execute` throws.** Surfaces as a `tool-error` chunk. Live
  line goes to error via `onToolCallEnd(..., { error: true })`.
  Post-turn, `response.messages` includes the failed `tool-call` and
  a `tool` message carrying the error output, so the canonical view
  matches the live view.
- **`tool-error` without matching `tool-call` (defensive).**
  `onToolCallEnd` for an unknown `toolCallId` inserts a new entry in
  `inFlightTools` with the terminal state. No crash, no orphan.
- **`fullStream` `error` / `abort` chunks.** Pre-existing silent
  behavior retained; not expanded in this slice (see §7).
- **Unmount mid-turn.** Unchanged from today: `mountedRef.current`
  guards `setState` after await boundaries. `runAgent` still runs to
  completion but its return value is discarded.

## 7. Accepted risks

- **Unbounded history growth.** Long sessions will eventually hit the
  model's context window. No pruning, summarization, or `/reset` in
  this slice.
- **No approval gate.** Same risk profile as the prior file-tools
  slice; the agent can still call `writeFile` / `deleteFile`
  autonomously.
- **Tool output trusted for display.** `summarizeToolOutput` renders
  ~80 chars of the tool's raw string. All current tools are
  first-party; malicious output is not in the threat model.
- **Loosened `filterCompatibleMessages`.** By admitting
  tool-call-only assistant turns we expand what we echo back to the
  provider. If a future provider rejects a shape we start preserving,
  tighten the filter in that slice.
- **No terminal-control escaping.** File paths or result snippets
  containing control characters render as-is. Same trust model as
  streamed assistant text today.
- **Silent `error` / `abort` chunks.** Pre-existing. Listed here for
  future readers.

## 8. SOLID notes

- **Single responsibility.** `runAgent` still owns "configure and
  drive `streamText`"; it gains one concern — producing the extended
  history — that is a natural consequence of its role, not a new
  axis. `useAgentChat` still owns session state; it gains
  `inFlightTools`, which is state. `MessageList` still owns rendering.
- **Open/closed.** A fifth tool is additive in
  `src/agent/tools/index.ts`; `run.ts`, `useAgentChat.ts`,
  `MessageList.tsx`, and `ToolLine.tsx` need no edit because they
  work off generic part shapes (`tool-call`, `tool-result`).
- **Dependency inversion.** The UI continues to depend on
  `AgentCallbacks` (`src/types.ts`) and `ModelMessage` from `ai`, not
  on SDK internals. `runAgent` remains the only place that imports
  from `'ai'`'s streaming surface.
- **Interface segregation.** `AgentCallbacks` gains narrow additions
  (`toolCallId`, optional `{ error }`); unused callbacks stay optional
  / no-op and no consumer is forced to implement them.

## 9. Implementation constraints

- ESM (`"type": "module"`), TypeScript strict, per existing
  `tsconfig.json`. Relative imports use `.js` extensions.
- No new dependencies. `ai` already exposes everything we need
  (`ModelMessage`, `streamText`, `stepCountIs`, `ResponseMessage`
  shape via `result.response`).
- `npm run check` (build + lint + format:check) must pass.
- No code comments that narrate; only comments that explain
  non-obvious intent (e.g. why `userMessage` parameter is kept unused).

## 10. Verification

`npm run check` passes, plus a manual CLI smoke from a scratch
directory with `npm start`:

1. **Single-tool multi-turn memory.**
   - Turn 1: "list the files in this folder" → a live
     `▸ listFiles("./") …` line appears, resolves to
     `✓ listFiles — Successfully listed directory: ./`; assistant
     summary streams after.
   - Turn 2: "read the first one" → model issues `readFile(...)`
     targeting an entry from turn 1's tool result _without the user
     restating it_. Both the turn-1 and turn-2 tool lines remain
     visible; final text answer renders. Demonstrates structured
     model memory of prior tool output.
2. **Write + delete across turns.** "write a file `hello.txt` with
   'hi'", then "delete it". The second turn succeeds without the user
   repeating the filename. `hello.txt` exists on disk after turn 1
   and is gone after turn 2.
3. **Tool error path.** "read `/nonexistent`" →
   `✗ readFile — [readFile] Error on "/nonexistent". Code: ENOENT …`
   line; assistant recovers with a text explanation; history persists
   the error message; a follow-up turn can reference the failure.
4. **Stream failure.** Disable network mid-turn; error line shows
   under the input bar, user turn remains in history with no
   assistant turn appended, retrying after network returns works.
5. **No regression on text-only chat.** "what is 2+2" → no
   `ToolLine`s rendered; assistant text streams and persists as
   today.

## 11. Acceptance checklist

- [ ] `AgentCallbacks.onToolCallStart` / `onToolCallEnd` gain
      `toolCallId` and optional `{ error }` meta; other callback
      shapes unchanged.
- [ ] `src/agent/run.ts` awaits `result.response` and returns
      `[...filtered, ...response.messages]`; passes `toolCallId` to
      both tool callbacks.
- [ ] `filterCompatibleMessages` retains assistant messages that
      contain at least one `tool-call` part even without a text part.
- [ ] `useAgentChat` exposes `inFlightTools`, clears it on turn end
      and on error, and replaces `messages` with `runAgent`'s return
      value on success.
- [ ] `useAgentChat` no longer appends a synthetic
      `{ role: 'assistant', content: accumulated }` after a turn.
- [ ] `previewArgs` and `summarizeToolOutput` exist as pure helpers
      and are reused by both `useAgentChat` and `MessageList`.
- [ ] `App.tsx` forwards `inFlightTools` to `MessageList`.
- [ ] `MessageList` renders assistant `tool-call` parts and
      `tool-result` parts as `<ToolLine>`s in chronological order,
      plus in-flight lines during streaming.
- [ ] `ToolLine` is a new component under `src/ui/components/`; no
      other component files are added.
- [ ] Only the files listed in §3 are modified or created.
- [ ] `npm run check` passes.
- [ ] Manual smoke §10 items 1–5 succeed.
