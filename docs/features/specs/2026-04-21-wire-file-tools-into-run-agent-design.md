# Wire file tools into `runAgent` — design

Status: Approved (brainstorming). Ready for implementation plan.

## 1. Goal

Turn `runAgent` (`src/agent/run.ts`) from a text-only chat into a bounded
multi-step agent that can call the four file tools already defined in
`src/agent/tools/` — `readFile`, `writeFile`, `deleteFile`, `listFiles`. The
Ink UI continues to render the same streamed text it does today; tool-call
events are piped to the existing `AgentCallbacks` (`src/types.ts`) so a later
UI feature can surface them without another `run.ts` change.

This is the follow-up work explicitly deferred as a non-goal in
[`2026-04-21-agent-file-tools-design.md`](./2026-04-21-agent-file-tools-design.md) §2.

## 2. Scope & non-goals

**In scope**

- Pass the `tools` record from `src/agent/tools/index.ts` into the existing
  `streamText` call in `src/agent/run.ts`.
- Add `stopWhen: stepCountIs(10)` to enable the tool-use loop.
- Extend the `fullStream` consumer: continue forwarding `text-delta` to
  `onToken`, additionally forward `tool-call` → `onToolCallStart(name, input)`
  and `tool-result` / `tool-error` → `onToolCallEnd(name, resultString)`.
- No other file in the repo is edited.

**Non-goals**

- No approval gate. `onToolApproval` on `AgentCallbacks` stays unused; HITL is
  a future feature with its own spec.
- No wiring of `onComplete` or `onTokenUsage` — same as today.
- No changes to `src/ui/App.tsx`, `src/ui/useAgentChat.ts`, or any other UI
  file. The UI keeps passing no-op callbacks for tool events.
- No changes to `src/agent/tools/file.ts` or `src/agent/tools/index.ts`. The
  tool module is already complete.
- No path sandboxing and no new tool policy. The accepted risks from the
  prior spec (§7 of `2026-04-21-agent-file-tools-design.md`) stand.
- No new test framework. Verification is `npm run check` plus a manual CLI
  smoke.
- No edits to `SYSTEM_PROMPT`. If the model needs prompt guidance to use the
  tools well, that's a follow-up.
- No change to `runAgent`'s signature or return value (see §5).
- No new handling for `error` / `abort` chunks from `fullStream`. That is
  pre-existing behavior (swallowed today) and expanding it is out of scope.

## 3. File layout

Only one file changes:

```text
src/agent/run.ts    # add tools + stopWhen, extend fullStream switch
```

No files are created. No files are removed.

## 4. Module contract (`src/agent/run.ts`)

### 4.1 Imports

Add two items to the existing imports; everything else stays:

- From `'ai'`: add `stepCountIs` alongside `streamText` / `ModelMessage`.
- From `'./tools/index.js'`: add `tools` (the pre-composed record of all
  four file tools).

### 4.2 `streamText` call

The existing call grows two props:

| Prop       | Value                   | Notes                                                 |
| ---------- | ----------------------- | ----------------------------------------------------- |
| `tools`    | imported `tools` record | All four file tools; same surface the model will see. |
| `stopWhen` | `stepCountIs(10)`       | Bounded multi-step loop; cap rationale in §4.4.       |

Unchanged props: `model: openai('gpt-5-mini')`, `system: SYSTEM_PROMPT`,
`messages`, and `experimental_telemetry` (with `getTracer()` from Laminar).

### 4.3 `fullStream` consumer

Today the loop only handles `text-delta`. It becomes a `switch` over
`chunk.type`:

| `chunk.type`  | Action                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `text-delta`  | `callbacks.onToken(chunk.text)` — unchanged.                           |
| `tool-call`   | `callbacks.onToolCallStart(chunk.toolName, chunk.input)`.              |
| `tool-result` | `callbacks.onToolCallEnd(chunk.toolName, stringify(chunk.output))`.    |
| `tool-error`  | `callbacks.onToolCallEnd(chunk.toolName, errorToString(chunk.error))`. |
| default       | ignored (same behavior as today).                                      |

`stringify` is a local helper in `run.ts`:

- if the value is already a `string`, return it as-is;
- otherwise `JSON.stringify(value)` inside a `try`; on failure fall back to
  `String(value)`.

This keeps the `AgentCallbacks.onToolCallEnd(result: string)` contract
(`src/types.ts`) satisfied no matter what the SDK passes through.

`errorToString` turns a thrown error into a string: `err instanceof Error`
→ `err.message`; otherwise `String(err)`.

### 4.4 Step budget rationale

`stepCountIs(10)` matches the common default in AI SDK cookbooks and gives
the model headroom for realistic multi-file flows (e.g. `listFiles` →
several `readFile`s → final text answer) while still bounding cost if it
gets stuck. 5 is too tight for multi-file asks; 20 is needless headroom.

### 4.5 Note on file tools' error shape

The four file tools already catch `fs` errors inside `execute` and return
descriptive strings (see `describeFsError` in `src/agent/tools/file.ts`).
That means `tool-result` chunks for these tools will carry strings — never
thrown errors — and `tool-error` will essentially never fire for them. We
still wire `tool-error` because other tools added later might throw, and
because the cost is a single extra branch.

## 5. Return value & signature

`runAgent(userMessage, conversationHistory, callbacks): Promise<ModelMessage[]>`
is unchanged. It still returns the filtered history it already returns.

Rationale: the caller (`src/ui/useAgentChat.ts`) reconstructs the assistant
response from accumulated tokens and does not consume the returned history.
Persisting tool / assistant messages back into history (e.g. from
`result.response.messages`) is a separate concern that requires UI changes
and belongs in a future slice.

## 6. Error handling

Unchanged from today. Thrown errors from `streamText` / iterating
`fullStream` propagate out of `runAgent`; the `try/catch` in
`src/ui/useAgentChat.ts` already handles them. We do **not** add new
handling for `error` or `abort` `fullStream` chunks in this slice — that is
pre-existing behavior and is listed as a non-goal (§2).

## 7. Accepted risks

- **No approval gate.** The agent can call `writeFile` and `deleteFile`
  autonomously on the user's machine, constrained only by process
  permissions. Already an accepted risk in the prior file-tools spec; this
  slice does not change that. Approval / confirmation UX is a future
  feature with its own spec.
- **Step cap at 10.** A pathological loop can still consume 10 tool calls
  and their associated token cost before stopping. Bounded and
  deliberate.
- **Silent swallowing of `error` / `abort` chunks.** Pre-existing. Listed
  here only so future readers know it's intentional for this slice, not an
  oversight.
- **No system-prompt update.** The generic `SYSTEM_PROMPT` does not mention
  the new file tools. If the model underuses or misuses them, a targeted
  prompt update is the follow-up — not this slice.

## 8. SOLID notes

- **Single responsibility.** `run.ts` remains the single home for
  configuring and driving `streamText`; it gains no new concerns, only a
  richer version of the one it already owns (stream → callbacks).
- **Open/closed.** Adding a fifth tool later is additive in
  `src/agent/tools/index.ts`; `run.ts` imports the `tools` record and
  therefore needs no edit for new tools. Same for new chunk types: the
  `switch` has a default-ignore branch.
- **Dependency inversion.** The UI depends on the `AgentCallbacks`
  abstraction (`src/types.ts`); `run.ts` fulfills it. Wiring the tool
  events through that existing interface preserves the inversion — the UI
  does not learn anything new about the AI SDK.

## 9. Implementation constraints

- ESM (`"type": "module"`), TypeScript strict, per existing `tsconfig.json`.
- Relative imports use `.js` extensions (repo convention for `src/`).
- No new dependencies. `ai` already exposes `stepCountIs`; `tools` already
  exists.
- `npm run check` (build + lint + format:check) must pass.

## 10. Verification

`npm run check` passes, plus a manual CLI smoke from a scratch directory
with `npm start`:

- "list the files in this folder" → a `listFiles` tool call lands; model
  summarizes entries in text.
- "read package.json and tell me the name field" → a `readFile` tool call
  lands; model answers in text.
- "write a file called `hello.txt` with contents 'hi'" → a `writeFile`
  tool call lands; `hello.txt` exists on disk afterward.
- "delete `hello.txt`" → a `deleteFile` tool call lands; file is gone.

During each smoke, the terminal should continue to show streamed text
exactly as it does today. Tool-call events being emitted but unused by the
UI is expected.

## 11. Acceptance checklist

- [ ] `src/agent/run.ts` imports `stepCountIs` from `ai` and `tools` from
      `./tools/index.js`.
- [ ] The `streamText(...)` call passes `tools` and
      `stopWhen: stepCountIs(10)`.
- [ ] The `for await (const chunk of result.fullStream)` body is a
      `switch` handling `text-delta`, `tool-call`, `tool-result`, and
      `tool-error` as described in §4.3, with a default-ignore branch.
- [ ] `onToken`, `onToolCallStart`, and `onToolCallEnd` are the only
      callbacks invoked from `run.ts`. `onComplete`, `onToolApproval`, and
      `onTokenUsage` remain untouched.
- [ ] `runAgent`'s signature and return value are unchanged.
- [ ] No other files in the repo are modified.
- [ ] `npm run check` passes.
- [ ] The manual smoke in §10 succeeds for all four tools.
