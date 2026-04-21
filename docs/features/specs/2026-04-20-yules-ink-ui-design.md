# yules-ai CLI: Ink + React terminal UI

## Context

`yules-ai` is an ESM TypeScript Node CLI. Today the interactive chat loop in `src/agent/run.ts` is **readline-based**: it writes a `You: ` prompt, reads lines, calls `streamText` from the Vercel AI SDK (`openai('gpt-5-mini')`), and streams tokens directly to stdout. `src/cli.ts` loads `.env` from `cwd`, validates `OPENAI_API_KEY`, and invokes the runner.

This spec replaces that loop with a small **React + [Ink](https://github.com/vadimdemedes/ink)** terminal UI. Scope is intentionally kept to a simple demo — nice-looking, functional, not over-engineered.

## Goals

1. Render an interactive chat UI in the terminal using React and Ink (TypeScript, `.tsx`).
2. Preserve existing chat behavior: streaming assistant tokens, in-memory multi-turn history, `openai('gpt-5-mini')` + `SYSTEM_PROMPT`, `.env` loaded from `cwd`.
3. Refactor the current agent so streaming can be consumed by a React component (pure async-iterable producer, not a readline loop).
4. Clean exit on Ctrl+C with exit code 0. Session survives per-request API errors.

## Non-goals

- Slash commands (`/clear`, `/exit`), keyboard shortcuts beyond Ctrl+C.
- Persisting chat history to disk or resuming sessions.
- Tools, subagents, or MCP.
- Markdown rendering, syntax highlighting, or custom word-wrap logic.
- Automated tests (manual verification only, matching existing project norms).
- Non-TTY fallback (if stdout is not a TTY, Ink's default behavior is acceptable).

## Dependencies

Add runtime dependencies:

- `react`
- `ink`
- `ink-text-input`
- `ink-spinner`

Add dev dependency:

- `@types/react`

Keep existing: `ai`, `@ai-sdk/openai`, `dotenv`.

## TypeScript configuration

Update `tsconfig.json` to support JSX:

- `"jsx": "react-jsx"` so `.tsx` files compile with the automatic runtime (no explicit `import React` required for JSX).
- `include` remains `["src/**/*.ts"]`; broaden to `["src/**/*.ts", "src/**/*.tsx"]` so the compiler picks up the UI files.

ESLint/Prettier configs require no changes for this slice (ESLint already parses TS; Prettier handles `.tsx` natively).

## File layout

```text
src/
  cli.ts                     # env check + render(<App/>)
  agent/
    system/prompt.ts         # unchanged
    chat.ts                  # new: streamReply(messages) pure async-iterable wrapper around streamText
  ui/
    App.tsx                  # state owner: messages, status, error; mounts children
    useAgentChat.ts          # hook: exposes { messages, streamingText, status, error, send }
    components/
      Header.tsx             # title + hint line
      MessageList.tsx        # renders committed history + in-progress streaming message
      Message.tsx            # one row with colored 'You' / 'Yules' label
      InputBar.tsx           # ink-text-input with inline spinner when streaming
      ErrorLine.tsx          # red inline error above the input bar
```

Delete:

- `src/agent/run.ts` (replaced by `App.tsx` + `useAgentChat.ts` + `chat.ts`).
- `src/ui` (empty placeholder file; the directory `src/ui/` takes its place).

## Architecture

### Entry (`src/cli.ts`)

- Keep shebang `#!/usr/bin/env node`.
- Keep `dotenv` load from `cwd` and the `OPENAI_API_KEY` presence check (fail fast with stderr message + non-zero exit code).
- Replace `runAgent()` call with:
  - `import { render } from 'ink'`
  - `import { App } from './ui/App.js'`
  - `render(<App/>)`
- The returned Ink instance resolves when the app unmounts (Ctrl+C). Let the process exit normally after that.

### Agent core (`src/agent/chat.ts`)

Expose a single pure function:

```ts
export async function* streamReply(
  messages: ModelMessage[],
): AsyncGenerator<string, void, void> { ... }
```

Internally it calls `streamText({ model: openai('gpt-5-mini'), system: SYSTEM_PROMPT, messages })` and yields chunks from `result.textStream`. No I/O, no readline, no side effects on `messages`. The caller owns history mutation.

### UI state (`src/ui/useAgentChat.ts`)

Custom hook that owns chat state:

- `messages: ModelMessage[]` — committed turns only (user + assistant).
- `streamingText: string` — in-progress assistant text; empty when idle.
- `status: 'idle' | 'streaming' | 'error'`.
- `error: string | null`.
- `send(text: string): void` — no-op on empty trimmed input or while streaming.

`send` flow:

1. Append `{ role: 'user', content: trimmed }` to `messages`.
2. Set `status = 'streaming'`, clear `error`, clear `streamingText`.
3. Start an async task that iterates `streamReply(nextMessages)`, appending each chunk to `streamingText` via a ref + state update.
4. On completion: commit `{ role: 'assistant', content: streamingText }` to `messages`, clear `streamingText`, set `status = 'idle'`.
5. On thrown error: set `error` to the message, clear `streamingText`, set `status = 'idle'`. Do **not** commit partial assistant text.

The hook guards against stale async completions if the component unmounts mid-stream (use a `cancelled` flag tied to a `useEffect` cleanup on unmount or a ref set from a top-level unmount effect).

### Components

- **`App.tsx`**: calls `useAgentChat()`; renders `<Box flexDirection="column">` with `<Header/>`, `<MessageList .../>`, optional `<ErrorLine/>`, `<InputBar .../>`.
- **`Header.tsx`**: two-line static block: bold `yules-ai — interactive chat`, then dim `Ctrl+C to exit`.
- **`MessageList.tsx`**: maps `messages` to `<Message/>`; when `status === 'streaming'`, appends one extra `<Message role="assistant" content={streamingText}/>` so tokens appear live.
- **`Message.tsx`**: `<Box>` with a colored label (`cyan` for `You`, `green` for `Yules`) and the content. Let Ink handle wrapping via `<Text wrap="wrap">`.
- **`InputBar.tsx`**: when `status === 'streaming'`, render `<Spinner/>` + dim `Yules is thinking…`. When idle, render a cyan `❯` prompt + `<TextInput>` bound to local state; on submit, trim, call `props.onSubmit`, clear local state.
- **`ErrorLine.tsx`**: red `Error: <message>` line; rendered only when `error` is set.

### Data flow (per turn)

1. User types in `InputBar` → Enter → `onSubmit(text)` → `send(text)`.
2. `useAgentChat` appends the user message and kicks off `streamReply`.
3. First token hides the spinner (because `status` stays `'streaming'` but the streaming message now has non-empty content; `InputBar` can show spinner only while `streamingText === ''`).
4. Subsequent tokens append to `streamingText` → `MessageList` re-renders.
5. Stream end → assistant message committed, status back to idle, input re-enabled.
6. On error → error line shown, partial output discarded, input re-enabled.

## Error handling and signals

- **Missing `OPENAI_API_KEY`:** handled in `cli.ts` before Ink mounts (unchanged from today). Print to stderr, exit non-zero.
- **Stream/API errors:** surfaced via `ErrorLine`; REPL continues.
- **Ctrl+C:** Ink's default (unmount + exit 0). No custom SIGINT handler.
- **Empty input:** ignored (no-op, input stays focused).
- **Submit while streaming:** prevented at the hook (`send` no-op) and visually (spinner replaces input).

## Files and responsibilities

| Path                         | Responsibility                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/cli.ts`                 | Shebang, dotenv from `cwd`, env validation, `render(<App/>)`.                                  |
| `src/agent/chat.ts`          | `streamReply(messages)` async generator wrapping `streamText`; pure, no I/O.                   |
| `src/agent/system/prompt.ts` | `SYSTEM_PROMPT` (unchanged).                                                                   |
| `src/ui/App.tsx`             | Top-level component; wires the hook to children.                                               |
| `src/ui/useAgentChat.ts`     | Chat state + streaming lifecycle.                                                              |
| `src/ui/components/*.tsx`    | Presentational components (Header, MessageList, Message, InputBar, ErrorLine).                 |
| `tsconfig.json`              | Add `"jsx": "react-jsx"`; include `.tsx`.                                                      |
| `package.json`               | Add `react`, `ink`, `ink-text-input`, `ink-spinner` deps; add `@types/react` dev dep.          |

## Verification (manual)

1. `npm run build` succeeds with no TS errors.
2. `npm start` renders the header, prompt input, and a blinking cursor; typing a message and pressing Enter shows the user message, a spinner briefly, then streaming tokens under a green `Yules` label.
3. Multi-turn context is preserved within one session.
4. Running from a directory without a usable key fails before the Ink UI mounts, with a clear stderr message.
5. Forcing an API error (e.g., temporarily invalid key after mount — or simulated error) shows a red error line and leaves the REPL usable.
6. Ctrl+C exits cleanly with exit code 0.

## Notes

- The removed commit `2472e6b` wiped a previous Ink attempt; this spec is a fresh, smaller pass. Do not assume any of the old file layout is still on disk.
- Model ID `gpt-5-mini` stays in one place (`src/agent/chat.ts`); update there if the provider renames it.
- `AGENTS.md` already names Ink as the intended terminal UI — this spec is what wires that intent into the codebase.

## Future: tools

Tools (filesystem, shell, web search) are on the product roadmap but **out of scope for this slice**. To keep this UI forward-compatible without building speculative tool UX now:

- State uses the AI SDK's `ModelMessage[]` type, which already supports tool parts — the state shape will not need to change when tools land.
- `Message.tsx` renders a single text bubble per message. When tools arrive, introduce a small `MessageParts.tsx` that switches on message part kind (`text` / `tool-call` / `tool-result`) and reuse it inside `Message.tsx`.
- `streamReply` returns `AsyncIterable<string>` (text-only) for this slice. Switching to `result.fullStream` with a discriminated-union yield is a localized change in `src/agent/chat.ts` and the `useAgentChat` hook; no other component needs to know.

UX decisions for tool rendering (inline vs. collapsible, approval prompts, long-running status, argument/result truncation) depend on real tool behavior and will be designed in a follow-up spec once at least one tool is wired into the agent.
