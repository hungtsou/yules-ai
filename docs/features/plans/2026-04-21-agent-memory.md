# Agent memory across turns + tool activity in UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the agent's full structured output (`assistant` + `tool` messages) into conversation history after every `runAgent` call so the model remembers prior tool use on later turns, and surface tool activity inline in the Ink UI as `▸ name(args) ✓ summary` lines (live during streaming, canonical after the turn completes).

**Architecture:** `runAgent` awaits `result.response` after the stream drains and returns `[...filteredHistory, ...response.messages]`. `useAgentChat` replaces state with the returned history on success; it no longer synthesises an assistant message from streamed tokens. A new `inFlightTools` state (keyed by `toolCallId`) drives live tool lines via the existing `AgentCallbacks`, which gain `toolCallId` + optional `{ error }` meta. `MessageList` renders assistant `tool-call` parts and tool-message `tool-result` parts as a new single-line `ToolLine` component. `filterCompatibleMessages` is loosened to stop dropping tool-call-only assistant turns.

**Tech Stack:** TypeScript (strict, ESM), Vercel AI SDK v6 (`ai`), `@ai-sdk/openai`, React + Ink, Node.js.

**Related docs:**

- Spec: [`docs/features/specs/2026-04-21-agent-memory-design.md`](../specs/2026-04-21-agent-memory-design.md)
- Prior spec (enables this work): [`docs/features/specs/2026-04-21-wire-file-tools-into-run-agent-design.md`](../specs/2026-04-21-wire-file-tools-into-run-agent-design.md)

**Repo rules the executor MUST respect:**

- `docs-features-plans-specs.mdc` — plans live under `docs/features/plans/`, specs under `docs/features/specs/`. Never `docs/superpowers/`.
- `git-commits-no-auto-commit.mdc` — **do not run `git commit` without explicit user approval.** Staging is allowed; committing is not. The final task below stages the change and drafts a message; the commit itself runs only after the user OKs it.

**Task ordering rationale:** Task 1 (filter loosening) is independent. Task 2 (types + `runAgent`) changes the `AgentCallbacks` signature and its only producer together so the typecheck stays green mid-plan; existing UI no-op callbacks remain valid because `() => {}` satisfies any callback shape structurally. Task 3 adds new files only. Task 4 updates `useAgentChat` to use them without exposing anything new yet. Task 5 is the user-visible wiring. All intermediate commits compile.

---

## File structure

Created:

- `src/ui/useAgentChat.helpers.ts` — pure helpers (`previewArgs`, `summarizeToolOutput`) and the `InFlightTool` interface. Shared by `useAgentChat.ts` and `MessageList.tsx`.
- `src/ui/components/ToolLine.tsx` — single-line Ink component rendering one tool-activity line.

Modified:

- `src/types.ts` — extend `AgentCallbacks` tool-event signatures.
- `src/agent/system/filterMessages.ts` — retain tool-call-only assistant messages.
- `src/agent/run.ts` — pass `toolCallId` in callbacks; await `result.response`; return merged history.
- `src/ui/useAgentChat.ts` — add `inFlightTools` state; replace `messages` with `runAgent`'s return value on success; drop synthetic-assistant append.
- `src/ui/App.tsx` — destructure and forward `inFlightTools`.
- `src/ui/components/MessageList.tsx` — render assistant `tool-call` parts, tool-message `tool-result` parts, and in-flight lines.

No files are removed.

---

## Task 1: Loosen `filterCompatibleMessages` to keep tool-call-only assistant turns

**Files:**

- Modify: `src/agent/system/filterMessages.ts` (entire file)

**Why first:** independent of every other change. Once this ships, later tasks can safely echo assistant tool-call turns back into `streamText`'s `messages` without having them silently dropped by the filter.

---

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

Read `src/agent/system/filterMessages.ts`. It should still be the 43-line file whose `assistant` branch only checks for text content.

- [ ] **Step 2: Replace `src/agent/system/filterMessages.ts` with the new implementation**

Overwrite the entire file with:

```typescript
import type { ModelMessage } from 'ai';

/**
 * Filter conversation history to only include compatible message formats.
 * Provider tools (like webSearch) may return messages with formats that
 * cause issues when passed back to subsequent API calls.
 *
 * Assistant messages are retained if they carry at least one text,
 * tool-call, or reasoning part — a pure tool-call turn is valid on
 * its own and must be preserved so the model can reference its own
 * prior tool use on later turns.
 */
export const filterCompatibleMessages = (
  messages: ModelMessage[],
): ModelMessage[] => {
  return messages.filter((msg) => {
    if (msg.role === 'user' || msg.role === 'system') {
      return true;
    }

    if (msg.role === 'tool') {
      return true;
    }

    if (msg.role === 'assistant') {
      const content = msg.content;
      if (typeof content === 'string') {
        return content.trim() !== '';
      }
      if (Array.isArray(content)) {
        return content.some((part: unknown) => {
          if (typeof part === 'string') {
            return part.trim() !== '';
          }
          if (typeof part === 'object' && part !== null) {
            const p = part as { type?: string; text?: string };
            if (p.type === 'tool-call') return true;
            if (p.type === 'reasoning') return true;
            if (typeof p.text === 'string' && p.text.trim() !== '') {
              return true;
            }
          }
          return false;
        });
      }
      return false;
    }

    return false;
  });
};
```

- [ ] **Step 3: Run typecheck + lint + format check**

Run: `npm run check`
Expected: exits 0.

If Prettier flags the file, run `npx prettier --write src/agent/system/filterMessages.ts` and re-run `npm run check`.

---

## Task 2: Update `AgentCallbacks` types and `runAgent` together

**Files:**

- Modify: `src/types.ts` (AgentCallbacks interface)
- Modify: `src/agent/run.ts` (tool-event callsites; await `result.response`; return merged history)

**Why combined:** the signature change in `AgentCallbacks` and its only producer (`runAgent`) must land together for `npm run check` to stay green. `useAgentChat`'s existing no-op arrow functions (`() => {}`, `() => Promise.resolve(true)`) structurally satisfy any callback shape, so the consumer side does not need to change in this task.

---

- [ ] **Step 1: Read the current files to confirm no drift**

Read `src/types.ts` and `src/agent/run.ts`. Confirm the current `AgentCallbacks` is the 8-field interface from the spec and that `runAgent` matches the 37-line file from the prior plan.

- [ ] **Step 2: Replace `src/types.ts` with the new implementation**

Overwrite the entire file with:

```typescript
export interface AgentCallbacks {
  onToken: (token: string) => void;
  onToolCallStart: (toolCallId: string, name: string, args: unknown) => void;
  onToolCallEnd: (
    toolCallId: string,
    name: string,
    result: string,
    meta?: { error?: boolean },
  ) => void;
  onComplete: (response: string) => void;
  onToolApproval: (name: string, args: unknown) => Promise<boolean>;
  onTokenUsage?: (usage: TokenUsageInfo) => void;
}

export interface ToolApprovalRequest {
  toolName: string;
  args: unknown;
  resolve: (approved: boolean) => void;
}

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ModelLimits {
  inputLimit: number;
  outputLimit: number;
  contextWindow: number;
}

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextWindow: number;
  threshold: number;
  percentage: number;
}
```

Only the `onToolCallStart` and `onToolCallEnd` signatures changed; everything else is byte-for-byte identical to today. `onComplete`, `onToolApproval`, and `onTokenUsage` remain unused in this slice.

- [ ] **Step 3: Replace `src/agent/run.ts` with the new implementation**

Overwrite the entire file with:

```typescript
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system/prompt.js';
import { tools } from './tools/index.js';
import type { AgentCallbacks } from '../types.ts';
import { filterCompatibleMessages } from './system/filterMessages.js';
import { getTracer, Laminar } from '@lmnr-ai/lmnr';

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY,
});

function stringifyToolResult(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
  const messages = filterCompatibleMessages(conversationHistory);

  const result = streamText({
    model: openai('gpt-5-mini'),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: stepCountIs(10),
    experimental_telemetry: {
      isEnabled: true,
      tracer: getTracer(),
    },
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        callbacks.onToken(chunk.text);
        break;
      case 'tool-call':
        callbacks.onToolCallStart(
          chunk.toolCallId,
          chunk.toolName,
          chunk.input,
        );
        break;
      case 'tool-result':
        callbacks.onToolCallEnd(
          chunk.toolCallId,
          chunk.toolName,
          stringifyToolResult(chunk.output),
        );
        break;
      case 'tool-error':
        callbacks.onToolCallEnd(
          chunk.toolCallId,
          chunk.toolName,
          errorToString(chunk.error),
          { error: true },
        );
        break;
      default:
        break;
    }
  }

  const response = await result.response;
  return [...messages, ...response.messages];
}
```

Key changes vs. the prior version:

- `tool-call` / `tool-result` / `tool-error` branches now pass `chunk.toolCallId` as the first argument.
- `tool-error` passes `{ error: true }` as the meta argument.
- After the `for await` loop, we `await result.response` and return `[...messages, ...response.messages]`.
- `userMessage` remains an unused parameter (same as today). The spec §4.2 calls this out; do not rename, prefix with `_`, or remove it.
- `stringifyToolResult`, `errorToString`, imports, `Laminar.initialize`, and `experimental_telemetry` are unchanged.

- [ ] **Step 4: Run typecheck + lint + format check**

Run: `npm run check`
Expected: exits 0. No TS errors about missing `toolCallId`, no unused-argument errors on `userMessage` (existing config already tolerates it).

- [ ] **Step 5: Smoke-build to catch runtime typos**

Run: `npm run build`
Expected: exits 0; `dist/agent/run.js` exists.

---

## Task 3: Add `useAgentChat.helpers.ts` and `ToolLine.tsx`

**Files:**

- Create: `src/ui/useAgentChat.helpers.ts`
- Create: `src/ui/components/ToolLine.tsx`

**Why now:** pure additions. Nothing imports them yet, so they land without affecting runtime behavior.

---

- [ ] **Step 1: Create `src/ui/useAgentChat.helpers.ts`**

Write the following contents:

```typescript
export interface InFlightTool {
  name: string;
  argsPreview: string;
  status: 'running' | 'ok' | 'error';
  summary?: string;
}

const MAX_LINE = 80;

function truncate(s: string, max: number = MAX_LINE): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function previewArgs(input: unknown): string {
  let text: string;
  if (typeof input === 'string') {
    text = input;
  } else {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }
  text = (text ?? '').replace(/\s+/g, ' ').trim();
  return truncate(text);
}

export function summarizeToolOutput(_name: string, raw: string): string {
  const lines = raw.split('\n');
  const successLine = lines.find((line) => line.startsWith('Successfully '));
  const firstNonEmpty = lines.find((line) => line.trim().length > 0) ?? '';
  return truncate((successLine ?? firstNonEmpty).trim());
}
```

Notes:

- `_name` is kept in the signature so per-tool formatting can be added later without changing callers (spec §4.4).
- `MAX_LINE = 80` is the upstream cap for both args previews and result summaries, matching spec §4.4 and §4.7.

- [ ] **Step 2: Create `src/ui/components/ToolLine.tsx`**

Write the following contents:

```tsx
import { Text } from 'ink';

interface ToolLineProps {
  mode: 'call' | 'result' | 'inflight';
  name: string;
  argsPreview?: string;
  status?: 'running' | 'ok' | 'error';
  summary?: string;
}

export function ToolLine({
  mode,
  name,
  argsPreview,
  status,
  summary,
}: ToolLineProps) {
  const args = argsPreview ?? '';

  if (mode === 'call') {
    return (
      <Text color="gray">
        {'▸ '}
        {name}({args})
      </Text>
    );
  }

  if (mode === 'inflight' && status === 'running') {
    return (
      <Text color="yellow">
        {'▸ '}
        {name}({args}) …
      </Text>
    );
  }

  const isError = status === 'error';
  const icon = isError ? '✗' : '✓';
  const color = isError ? 'red' : 'green';
  const tail = summary ? ` — ${summary}` : '';

  return (
    <Text color={color}>
      {icon} {name}
      {tail}
    </Text>
  );
}
```

Notes:

- Terminal-terminal state for `inflight` (`status === 'ok' | 'error'`) falls through to the final `return`, so a late `onToolCallEnd` updates the same line to `✓` / `✗` with a summary — matching spec §4.7.
- No truncation here; upstream helpers do it.

- [ ] **Step 3: Run typecheck + lint + format check**

Run: `npm run check`
Expected: exits 0.

If Prettier reformats the new files, re-run `npm run check`.

---

## Task 4: Update `useAgentChat.ts` to own `inFlightTools` and replace `messages` on success

**Files:**

- Modify: `src/ui/useAgentChat.ts` (entire file)

**Why now:** all new types and helpers exist from Task 3; `runAgent` already returns the merged history from Task 2. This task makes the UI layer actually consume those pieces.

---

- [ ] **Step 1: Read the current file to confirm no drift**

Read `src/ui/useAgentChat.ts`. It should still be the 74-line file whose success path appends `{ role: 'assistant', content: accumulated }`.

- [ ] **Step 2: Replace `src/ui/useAgentChat.ts` with the new implementation**

Overwrite the entire file with:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelMessage } from 'ai';
import { runAgent } from '../agent/run.js';
import type { InFlightTool } from './useAgentChat.helpers.js';
import { previewArgs, summarizeToolOutput } from './useAgentChat.helpers.js';

export type ChatStatus = 'idle' | 'streaming';

export interface UseAgentChat {
  messages: ModelMessage[];
  streamingText: string;
  status: ChatStatus;
  error: string | null;
  send: (text: string) => void;
  inFlightTools: Record<string, InFlightTool>;
}

export function useAgentChat(): UseAgentChat {
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [inFlightTools, setInFlightTools] = useState<
    Record<string, InFlightTool>
  >({});

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === '' || status === 'streaming') return;

      const userMessage: ModelMessage = { role: 'user', content: trimmed };
      const nextMessages = [...messages, userMessage];

      setMessages(nextMessages);
      setStreamingText('');
      setInFlightTools({});
      setError(null);
      setStatus('streaming');

      void (async () => {
        let accumulated = '';
        try {
          const returned = await runAgent(trimmed, nextMessages, {
            onToken: (token) => {
              accumulated += token;
              if (mountedRef.current) setStreamingText(accumulated);
            },
            onToolCallStart: (id, name, input) => {
              if (!mountedRef.current) return;
              setInFlightTools((prev) => ({
                ...prev,
                [id]: {
                  name,
                  argsPreview: previewArgs(input),
                  status: 'running',
                },
              }));
            },
            onToolCallEnd: (id, name, result, meta) => {
              if (!mountedRef.current) return;
              setInFlightTools((prev) => ({
                ...prev,
                [id]: {
                  ...(prev[id] ?? { name, argsPreview: '' }),
                  status: meta?.error ? 'error' : 'ok',
                  summary: summarizeToolOutput(name, result),
                },
              }));
            },
            onComplete: () => {},
            onToolApproval: () => Promise.resolve(true),
          });
          if (!mountedRef.current) return;
          setMessages(returned);
          setStreamingText('');
          setInFlightTools({});
          setStatus('idle');
        } catch (err) {
          if (!mountedRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
          setStreamingText('');
          setInFlightTools({});
          setStatus('idle');
        }
      })();
    },
    [messages, status],
  );

  return { messages, streamingText, status, error, send, inFlightTools };
}
```

Key differences from today:

- New `inFlightTools` state + corresponding setter, cleared on `send` start, on success, and on error.
- `onToolCallStart` / `onToolCallEnd` are now real implementations that mutate `inFlightTools` keyed by `toolCallId`. The `prev[id] ?? { name, argsPreview: '' }` branch handles a terminal event that arrives without a matching start (spec §6).
- On `runAgent` resolve, `setMessages(returned)` replaces state with the full history returned by `runAgent`. The old `setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])` append is gone — the canonical assistant turn now comes from `response.messages` inside `runAgent`.
- `accumulated` is kept because `streamingText` still drives the pending-assistant live text rendering; it is not used after the turn resolves.
- `UseAgentChat` gains `inFlightTools`; no other field is added or removed.

- [ ] **Step 3: Run typecheck + lint + format check**

Run: `npm run check`
Expected: exits 0.

At this point the UI still does not _render_ `inFlightTools` — `App.tsx` doesn't yet forward it — so behavior is the same as before _except_ that post-turn history now contains real assistant + tool messages from `response.messages`, and the synthetic text-only append is gone. That is intentional and verified in Task 5's smoke.

---

## Task 5: Wire the UI — `App.tsx` forwards `inFlightTools`; `MessageList.tsx` renders tool parts

**Files:**

- Modify: `src/ui/App.tsx` (entire file)
- Modify: `src/ui/components/MessageList.tsx` (entire file)

**Why last:** this is the user-visible piece. Everything it needs (new state, new component, new helpers, new history shape) is already in place.

---

- [ ] **Step 1: Read the current files to confirm no drift**

Read `src/ui/App.tsx` (19 lines) and `src/ui/components/MessageList.tsx` (33 lines).

- [ ] **Step 2: Replace `src/ui/App.tsx` with the new implementation**

Overwrite the entire file with:

```tsx
import { Box } from 'ink';
import { Header } from './components/Header.js';
import { MessageList } from './components/MessageList.js';
import { ErrorLine } from './components/ErrorLine.js';
import { InputBar } from './components/InputBar.js';
import { useAgentChat } from './useAgentChat.js';

export function App() {
  const { messages, streamingText, status, error, send, inFlightTools } =
    useAgentChat();

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header />
      <MessageList
        messages={messages}
        streamingText={streamingText}
        inFlightTools={inFlightTools}
      />
      {error && <ErrorLine message={error} />}
      <InputBar isStreaming={status === 'streaming'} onSubmit={send} />
    </Box>
  );
}
```

Only two changes from today: destructure `inFlightTools` and pass it to `MessageList`.

- [ ] **Step 3: Replace `src/ui/components/MessageList.tsx` with the new implementation**

Overwrite the entire file with:

```tsx
import type { ReactNode } from 'react';
import { Box } from 'ink';
import type { ModelMessage } from 'ai';
import { Message } from './Message.js';
import { ToolLine } from './ToolLine.js';
import type { InFlightTool } from '../useAgentChat.helpers.js';
import { previewArgs, summarizeToolOutput } from '../useAgentChat.helpers.js';

interface MessageListProps {
  messages: ModelMessage[];
  streamingText: string;
  inFlightTools: Record<string, InFlightTool>;
}

function textFromContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text;
      }
      return '';
    })
    .join('');
}

interface ToolResultOutput {
  type: string;
  value?: unknown;
}

function outputToString(output: ToolResultOutput): string {
  if (!('value' in output)) return '';
  const value = output.value;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isErrorOutput(output: ToolResultOutput): boolean {
  return output.type === 'error-text' || output.type === 'error-json';
}

export function MessageList({
  messages,
  streamingText,
  inFlightTools,
}: MessageListProps) {
  const nodes: ReactNode[] = [];

  messages.forEach((msg, i) => {
    if (msg.role === 'system') return;

    if (msg.role === 'user') {
      nodes.push(
        <Message
          key={`m-${i}`}
          role="user"
          content={textFromContent(msg.content)}
        />,
      );
      return;
    }

    if (msg.role === 'assistant') {
      const content = msg.content;
      const text = textFromContent(content);
      if (text.trim() !== '') {
        nodes.push(
          <Message key={`m-${i}-text`} role="assistant" content={text} />,
        );
      }
      if (Array.isArray(content)) {
        content.forEach((part, j) => {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'tool-call' &&
            'toolName' in part &&
            'input' in part &&
            typeof (part as { toolName: unknown }).toolName === 'string'
          ) {
            const p = part as { toolName: string; input: unknown };
            nodes.push(
              <ToolLine
                key={`m-${i}-tc-${j}`}
                mode="call"
                name={p.toolName}
                argsPreview={previewArgs(p.input)}
              />,
            );
          }
        });
      }
      return;
    }

    if (msg.role === 'tool') {
      const content = msg.content;
      if (Array.isArray(content)) {
        content.forEach((part, j) => {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'tool-result' &&
            'toolName' in part &&
            'output' in part &&
            typeof (part as { toolName: unknown }).toolName === 'string'
          ) {
            const p = part as {
              toolName: string;
              output: ToolResultOutput;
            };
            nodes.push(
              <ToolLine
                key={`m-${i}-tr-${j}`}
                mode="result"
                name={p.toolName}
                status={isErrorOutput(p.output) ? 'error' : 'ok'}
                summary={summarizeToolOutput(
                  p.toolName,
                  outputToString(p.output),
                )}
              />,
            );
          }
        });
      }
      return;
    }
  });

  Object.entries(inFlightTools).forEach(([id, entry]) => {
    nodes.push(
      <ToolLine
        key={`if-${id}`}
        mode="inflight"
        name={entry.name}
        argsPreview={entry.argsPreview}
        status={entry.status}
        summary={entry.summary}
      />,
    );
  });

  if (streamingText !== '') {
    nodes.push(
      <Message key="streaming" role="assistant" content={streamingText} />,
    );
  }

  return <Box flexDirection="column">{nodes}</Box>;
}
```

Notes:

- `textFromContent` replaces the old `toText` helper; it ignores non-text parts so that an assistant message containing only a `tool-call` part renders no text line (correct per spec §4.6).
- The rendering order inside an assistant message is: text first (if any), then `tool-call` parts in array order. The subsequent `tool` message's `tool-result` parts render on their own lines after. Across the whole list this matches the SDK's already-interleaved ordering from `response.messages` (spec §4.6).
- `isErrorOutput` checks `'error-text'` / `'error-json'` (both verified in `@ai-sdk/provider-utils`'s `ToolResultOutput` union). For the current first-party tools, outputs are always `{ type: 'text', value: string }`, so this branch is effectively dormant but correct.

- [ ] **Step 4: Run typecheck + lint + format check**

Run: `npm run check`
Expected: exits 0.

If lint complains about `any` or implicit types, tighten with the narrow `as` casts already shown — do not add `eslint-disable` lines.

- [ ] **Step 5: Build for smoke**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Manual smoke — single-tool multi-turn memory**

Prerequisites: `.env` at the repo root has a valid `OPENAI_API_KEY`.

Run: `npm start`

Turn 1 prompt: `list the files in this folder`

Expected during streaming:

- A yellow in-flight line appears: `▸ listFiles("./") …` (or similar path argument).
- It resolves to a green line: `✓ listFiles — Successfully listed directory: ./` (truncated as needed).
- Streamed assistant text follows.

After the turn completes, the yellow line is gone but the green line remains — because it is now rendered from persisted history rather than `inFlightTools`.

Turn 2 prompt (without restating filenames): `read the first one`

Expected:

- A new in-flight → green line appears for `readFile(...)` targeting one of the entries returned in Turn 1.
- The assistant answers about that file.
- Both Turn 1 and Turn 2 tool lines remain visible in history.

This demonstrates structured model memory: the model references tool output from a prior turn without the user re-stating it.

Exit with Ctrl-C.

- [ ] **Step 7: Manual smoke — write then delete across turns**

Run inside a scratch directory:

```bash
mkdir -p /tmp/yules-smoke && cd /tmp/yules-smoke
cp <path-to-your-checkout>/.env .env 2>/dev/null || true
node <path-to-your-checkout>/dist/cli.js
```

Turn 1: `write a file hello.txt with the contents "hi from yules"`

Expected:

- In-flight → green `writeFile` line.
- `cat /tmp/yules-smoke/hello.txt` (in another terminal or after Ctrl-C) prints `hi from yules`.

Turn 2 (same CLI session): `delete it`

Expected:

- In-flight → green `deleteFile` line targeting `hello.txt` without the user restating the filename.
- `ls /tmp/yules-smoke/hello.txt` exits non-zero.

Exit and clean up: `rm -rf /tmp/yules-smoke`.

- [ ] **Step 8: Manual smoke — tool error path**

Run: `npm start`

Prompt: `read /nonexistent`

Expected:

- In-flight line appears, then flips to red: `✗ readFile — [readFile] Error on "/nonexistent". Code: ENOENT …` (truncated).
- Assistant streams a text explanation.
- History persists the error line.

Exit with Ctrl-C.

- [ ] **Step 9: Manual smoke — stream failure recovery**

Disable your network (or disconnect Wi-Fi) and run:

```
npm start
```

Prompt: `hello`

Expected:

- After a short delay, an error line shows under the input bar (from `ErrorLine`).
- The user turn remains in history; no assistant turn was appended.

Re-enable the network, type another prompt. The agent should respond normally; history now contains the prior user turn, the prior error state is cleared, and the new turn appends correctly.

Exit with Ctrl-C.

- [ ] **Step 10: Manual smoke — text-only chat regression**

Run: `npm start`

Prompt: `what is 2+2?`

Expected:

- No `ToolLine`s rendered.
- Streamed assistant text appears as before.
- History after the turn contains the user turn and one assistant text turn (from `response.messages`), no tool messages.

Exit with Ctrl-C.

---

## Task 6: Stage the change set and draft the commit — ONLY commit after explicit user approval

**Files:** all changes from Tasks 1–5 combined.

---

- [ ] **Step 1: Stage every modified / created file**

Run:

```bash
git add \
  src/types.ts \
  src/agent/run.ts \
  src/agent/system/filterMessages.ts \
  src/ui/useAgentChat.ts \
  src/ui/useAgentChat.helpers.ts \
  src/ui/App.tsx \
  src/ui/components/MessageList.tsx \
  src/ui/components/ToolLine.tsx \
  docs/features/specs/2026-04-21-agent-memory-design.md \
  docs/features/plans/2026-04-21-agent-memory.md
git status
git diff --cached --stat
```

Expected: exactly the 10 files above are staged. No other files (e.g. `package.json`, `tsconfig.json`, lockfile) appear in the staged diff.

- [ ] **Step 2: Draft the commit message**

Conventional Commits, imperative mood, no trailing period on the subject:

```
feat(agent): persist tool-aware memory across turns and show tool activity in UI

Return `[...filtered, ...response.messages]` from `runAgent` so the
model sees prior assistant + tool turns on later calls; stop synthesising
an assistant message from streamed tokens. Extend `AgentCallbacks` tool
events with `toolCallId` + optional `{ error }` meta and wire live
in-flight tool lines through `useAgentChat` into a new `ToolLine`
component. Loosen `filterCompatibleMessages` to keep tool-call-only
assistant turns.

Refs: docs/features/specs/2026-04-21-agent-memory-design.md
```

- [ ] **Step 3: Commit — ONLY after explicit user approval**

Per `git-commits-no-auto-commit.mdc`, do **not** run `git commit` automatically. Ask the user:

> "All changes staged and smokes pass. Commit with the message above?"

If the user approves, run:

```bash
git commit -m "feat(agent): persist tool-aware memory across turns and show tool activity in UI" \
  -m "Return \`[...filtered, ...response.messages]\` from \`runAgent\` so the model sees prior assistant + tool turns on later calls; stop synthesising an assistant message from streamed tokens. Extend \`AgentCallbacks\` tool events with \`toolCallId\` + optional \`{ error }\` meta and wire live in-flight tool lines through \`useAgentChat\` into a new \`ToolLine\` component. Loosen \`filterCompatibleMessages\` to keep tool-call-only assistant turns." \
  -m "Refs: docs/features/specs/2026-04-21-agent-memory-design.md"
```

Then run `git status` and verify the tree is clean and HEAD advanced by one commit.

If the user declines or requests changes, leave everything staged and surface their feedback.

---

## Spec coverage

Mapping every section of the spec to tasks in this plan:

| Spec section                                                         | Covered by                  |
| -------------------------------------------------------------------- | --------------------------- |
| §1 Goal — multi-turn memory + inline UI tool lines                   | Tasks 2 + 4 + 5             |
| §2 Scope — files in scope                                            | Tasks 1–5 (one file each)   |
| §2 Non-goals — no approval / no usage / no pruning / no tool changes | No task touches those paths |
| §3 File layout                                                       | "File structure" + per-task |
| §4.1 `AgentCallbacks` shape                                          | Task 2 Step 2               |
| §4.2 `runAgent` behavior                                             | Task 2 Step 3               |
| §4.3 `filterCompatibleMessages` loosened                             | Task 1 Step 2               |
| §4.4 `useAgentChat` additions + helpers                              | Tasks 3 + 4                 |
| §4.5 `App.tsx` forwards `inFlightTools`                              | Task 5 Step 2               |
| §4.6 `MessageList` render rules                                      | Task 5 Step 3               |
| §4.7 `ToolLine` visual spec                                          | Task 3 Step 2               |
| §5 Data flow + invariants                                            | Task 4 Step 2               |
| §6 Error handling (defensive `tool-error` without start, unmount)    | Task 4 Step 2               |
| §7 Accepted risks                                                    | N/A — informational         |
| §10 Verification — smoke items 1–5                                   | Task 5 Steps 6–10           |
| §11 Acceptance checklist                                             | Tasks 1–5 collectively      |

No gaps.

---

## Self-review notes

- **Placeholder scan:** no TBD / TODO / "similar to Task N" / "add appropriate error handling" / "write tests for the above" — every code step ships full code, every verification step specifies the exact command and expected outcome. Smokes replace automated tests because the repo has no test framework (same pattern as `docs/features/plans/2026-04-21-wire-file-tools-into-run-agent.md`).
- **Type consistency:** `AgentCallbacks.onToolCallStart(toolCallId, name, args)` and `onToolCallEnd(toolCallId, name, result, meta?)` are defined in Task 2 Step 2 and consumed with those exact argument names and order in Task 2 Step 3 (`runAgent`) and Task 4 Step 2 (`useAgentChat`). `InFlightTool` is defined in Task 3 Step 1 and consumed by Tasks 4 and 5 under the same import path. `previewArgs(input)` and `summarizeToolOutput(name, raw)` are defined once in Task 3 Step 1 and used by both `useAgentChat.ts` (Task 4) and `MessageList.tsx` (Task 5).
- **Ordering sanity:** after every task boundary the repo compiles (`npm run check` is the per-task terminal step). The only cross-file signature change lands inside a single task (Task 2) so no commit is left with a broken typecheck even in a subagent-driven execution model.
- **Scope:** 10 files total (2 created, 8 modified — spec + plan included). One commit. No decomposition needed.
