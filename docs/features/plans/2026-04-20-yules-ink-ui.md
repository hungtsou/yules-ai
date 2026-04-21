# Ink + React Terminal UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the readline-based chat loop with a small React + Ink terminal UI (streaming assistant tokens, colored labels, spinner, input box, inline error) without changing model behavior or adding tools.

**Architecture:** `src/cli.ts` keeps env bootstrapping and renders `<App/>` via Ink. `src/agent/chat.ts` exposes a pure `streamReply(messages)` async generator over `streamText`. `src/ui/useAgentChat.ts` owns chat state and consumes the generator; presentational components (`Header`, `MessageList`, `Message`, `ErrorLine`, `InputBar`) render it. No automated tests; manual smoke verification matches existing project norms.

**Tech Stack:** TypeScript (ESM, `tsc` → `dist/`), React 19+, Ink 6+, `ink-text-input`, `ink-spinner`, Vercel AI SDK (`ai`), `@ai-sdk/openai`.

**Spec:** [`docs/features/specs/2026-04-20-yules-ink-ui-design.md`](../specs/2026-04-20-yules-ink-ui-design.md)

---

## Project conventions

- **Testing:** The spec lists automated tests as a non-goal. Each task uses `npm run build` (and `npm run lint` where relevant) plus a manual smoke step in place of TDD red/green cycles.
- **Commits:** The workspace rule `git-commits-no-auto-commit` forbids committing without explicit user approval. Each task ends with a staged `git commit` command for reference — **do not execute it without asking the user first**. Use [Conventional Commits](https://www.conventionalcommits.org/).
- **File naming:** `.tsx` for files that render JSX (components, `App`). `.ts` for pure modules (`cli.ts`, `chat.ts`, `useAgentChat.ts` — the hook uses no JSX).

---

## Task 1: Add dependencies and enable JSX in tsconfig

**Files:**

- Modify: `package.json` (dependencies)
- Modify: `tsconfig.json`

- [ ] **Step 1: Install runtime and type dependencies**

Run:

```bash
npm install react ink ink-text-input ink-spinner
npm install -D @types/react
```

Expected: `package.json` gains four runtime deps (`react`, `ink`, `ink-text-input`, `ink-spinner`) and one dev dep (`@types/react`). `package-lock.json` updates. No hand-editing of versions — accept whatever npm resolves as latest compatible.

- [ ] **Step 2: Enable JSX + include `.tsx` in tsconfig**

Edit `tsconfig.json` to:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Verify the build still passes**

Run:

```bash
npm run build
```

Expected: Build succeeds. `src/agent/run.ts` is still present and still used by `src/cli.ts`, so the CLI is unaffected by this task. If TypeScript complains about `react` types, confirm `@types/react` was installed.

- [ ] **Step 4: Commit (requires user approval)**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore(ui): add react/ink deps and enable jsx compilation"
```

---

## Task 2: Extract pure agent streaming into `src/agent/chat.ts`

**Files:**

- Create: `src/agent/chat.ts`

- [ ] **Step 1: Create `src/agent/chat.ts`**

```ts
import { streamText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system/prompt.js';

export async function* streamReply(
  messages: ModelMessage[],
): AsyncGenerator<string, void, void> {
  const result = streamText({
    model: openai('gpt-5-mini'),
    system: SYSTEM_PROMPT,
    messages,
  });

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
```

This module is pure: no I/O, no readline, no mutation of inputs. The caller owns `messages`.

- [ ] **Step 2: Verify build + lint pass**

Run:

```bash
npm run build
npm run lint
```

Expected: Both succeed. `src/agent/run.ts` is untouched and still works.

- [ ] **Step 3: Commit (requires user approval)**

```bash
git add src/agent/chat.ts
git commit -m "refactor(agent): extract streamReply async generator"
```

---

## Task 3: Create the `useAgentChat` hook

**Files:**

- Create: `src/ui/useAgentChat.ts`

- [ ] **Step 1: Create `src/ui/useAgentChat.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelMessage } from 'ai';
import { streamReply } from '../agent/chat.js';

export type ChatStatus = 'idle' | 'streaming' | 'error';

export interface UseAgentChat {
  messages: ModelMessage[];
  streamingText: string;
  status: ChatStatus;
  error: string | null;
  send: (text: string) => void;
}

export function useAgentChat(): UseAgentChat {
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
      setStatus('streaming');

      void (async () => {
        let accumulated = '';
        try {
          for await (const chunk of streamReply(nextMessages)) {
            if (!mountedRef.current) return;
            accumulated += chunk;
            setStreamingText(accumulated);
          }
          if (!mountedRef.current) return;
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: accumulated },
          ]);
          setStreamingText('');
          setStatus('idle');
        } catch (err) {
          if (!mountedRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
          setStreamingText('');
          setStatus('idle');
        }
      })();
    },
    [messages, status],
  );

  return { messages, streamingText, status, error, send };
}
```

Notes for the engineer:

- The hook holds `messages` as the canonical committed history. Partial assistant text lives in `streamingText` and is only committed on success. This is what prevents history corruption on mid-stream errors.
- `mountedRef` ensures late async completions after Ctrl+C do not call `setState` on an unmounted component.
- `send` is a no-op while streaming — this is the contract `InputBar` relies on.

- [ ] **Step 2: Verify build + lint pass**

```bash
npm run build
npm run lint
```

Expected: Both succeed.

- [ ] **Step 3: Commit (requires user approval)**

```bash
git add src/ui/useAgentChat.ts
git commit -m "feat(ui): add useAgentChat hook for streaming chat state"
```

---

## Task 4: Create presentational components

**Files:**

- Create: `src/ui/components/Header.tsx`
- Create: `src/ui/components/Message.tsx`
- Create: `src/ui/components/MessageList.tsx`
- Create: `src/ui/components/ErrorLine.tsx`
- Create: `src/ui/components/InputBar.tsx`

- [ ] **Step 1: Create `src/ui/components/Header.tsx`**

```tsx
import { Box, Text } from 'ink';

export function Header() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>yules-ai — interactive chat</Text>
      <Text dimColor>Ctrl+C to exit</Text>
    </Box>
  );
}
```

- [ ] **Step 2: Create `src/ui/components/Message.tsx`**

```tsx
import { Box, Text } from 'ink';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export function Message({ role, content }: MessageProps) {
  const label = role === 'user' ? 'You' : 'Yules';
  const color = role === 'user' ? 'cyan' : 'green';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color} bold>
        {label}
      </Text>
      <Text wrap="wrap">{content}</Text>
    </Box>
  );
}
```

- [ ] **Step 3: Create `src/ui/components/MessageList.tsx`**

```tsx
import { Box } from 'ink';
import type { ModelMessage } from 'ai';
import { Message } from './Message.js';

interface MessageListProps {
  messages: ModelMessage[];
  streamingText: string;
}

function toText(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) =>
      'text' in part && typeof part.text === 'string' ? part.text : '',
    )
    .join('');
}

export function MessageList({ messages, streamingText }: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => {
        if (msg.role !== 'user' && msg.role !== 'assistant') return null;
        return (
          <Message key={i} role={msg.role} content={toText(msg.content)} />
        );
      })}
      {streamingText !== '' && (
        <Message role="assistant" content={streamingText} />
      )}
    </Box>
  );
}
```

The `toText` helper keeps the component robust if `ModelMessage.content` is ever an array of parts (tool-ready forward-compat per the spec's "Future: tools" section). For this slice, `useAgentChat` only produces string content, but the defensive code is cheap.

- [ ] **Step 4: Create `src/ui/components/ErrorLine.tsx`**

```tsx
import { Box, Text } from 'ink';

interface ErrorLineProps {
  message: string;
}

export function ErrorLine({ message }: ErrorLineProps) {
  return (
    <Box marginBottom={1}>
      <Text color="red">Error: {message}</Text>
    </Box>
  );
}
```

- [ ] **Step 5: Create `src/ui/components/InputBar.tsx`**

```tsx
import { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

interface InputBarProps {
  isStreaming: boolean;
  onSubmit: (text: string) => void;
}

export function InputBar({ isStreaming, onSubmit }: InputBarProps) {
  const [value, setValue] = useState('');

  if (isStreaming) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Text dimColor> Yules is typing…</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="cyan">❯ </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(submitted) => {
          setValue('');
          onSubmit(submitted);
        }}
      />
    </Box>
  );
}
```

If `ink-text-input` and `ink-spinner` resolve to default exports (they do in current versions), the imports above are correct. If TypeScript complains about missing types or default exports, check each package's `main`/`types` and fall back to a namespace import (`import * as TextInput from 'ink-text-input'`) only if necessary — prefer default imports.

- [ ] **Step 6: Verify build + lint pass**

```bash
npm run build
npm run lint
```

Expected: Both succeed. Files compile to `dist/ui/components/*.js`.

- [ ] **Step 7: Commit (requires user approval)**

```bash
git add src/ui/components
git commit -m "feat(ui): add header, message, input, spinner, and error components"
```

---

## Task 5: Create the top-level `App` component

**Files:**

- Create: `src/ui/App.tsx`

- [ ] **Step 1: Create `src/ui/App.tsx`**

```tsx
import { Box } from 'ink';
import { Header } from './components/Header.js';
import { MessageList } from './components/MessageList.js';
import { ErrorLine } from './components/ErrorLine.js';
import { InputBar } from './components/InputBar.js';
import { useAgentChat } from './useAgentChat.js';

export function App() {
  const { messages, streamingText, status, error, send } = useAgentChat();

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header />
      <MessageList messages={messages} streamingText={streamingText} />
      {error && <ErrorLine message={error} />}
      <InputBar isStreaming={status === 'streaming'} onSubmit={send} />
    </Box>
  );
}
```

- [ ] **Step 2: Verify build + lint pass**

```bash
npm run build
npm run lint
```

Expected: Both succeed. `dist/ui/App.js` now exists.

- [ ] **Step 3: Commit (requires user approval)**

```bash
git add src/ui/App.tsx
git commit -m "feat(ui): add App component wiring header, messages, input, and errors"
```

---

## Task 6: Wire `cli.ts` to Ink and delete the old loop

**Files:**

- Modify: `src/cli.ts`
- Delete: `src/agent/run.ts`
- Delete: `src/ui` (the empty placeholder file, not the directory)

- [ ] **Step 1: Replace `src/cli.ts` with the Ink entrypoint**

Write the full new content of `src/cli.ts`:

```ts
#!/usr/bin/env node
import { createElement } from 'react';
import { config } from 'dotenv';
import { render } from 'ink';
import { App } from './ui/App.js';

config({ quiet: true });

const key = process.env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error(
    'yules-ai: OPENAI_API_KEY is missing or empty. Create a .env file in your current working directory with OPENAI_API_KEY set (this CLI loads .env from cwd).',
  );
  process.exit(1);
}

const { waitUntilExit } = render(createElement(App));
waitUntilExit().catch((err: unknown) => {
  console.error('yules-ai:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

Notes:

- `cli.ts` stays a `.ts` file (no JSX). Using `createElement(App)` avoids renaming the entrypoint and keeps `"bin": { "yules-ai": "dist/cli.js" }` in `package.json` valid without change.
- The shebang stays at line 1. TypeScript preserves it in the emitted `dist/cli.js` (current project behavior).
- Ctrl+C is handled by Ink's default input handling; no custom SIGINT handler is needed.

- [ ] **Step 2: Delete `src/agent/run.ts`**

Delete the file. Its behavior has been replaced by `src/agent/chat.ts` + `src/ui/useAgentChat.ts` + `App.tsx`.

- [ ] **Step 3: Delete the empty `src/ui` placeholder file**

There is an empty file at `src/ui` (not a directory). Delete it. The directory `src/ui/` (created implicitly by earlier tasks) remains and is what the build uses.

Sanity-check before moving on:

```bash
ls src/ui
```

Expected output includes `App.tsx`, `useAgentChat.ts`, and a `components` subdirectory — and **no** lingering empty `ui` file shadowing the directory.

- [ ] **Step 4: Verify build + lint pass**

```bash
npm run build
npm run lint
```

Expected: Build succeeds. No references to the deleted `./agent/run.js` remain.

- [ ] **Step 5: Commit (requires user approval)**

```bash
git add src/cli.ts
git add -A src/agent src/ui
git commit -m "feat(cli): render ink app and remove readline loop"
```

---

## Task 7: Manual smoke verification

**Files:** none modified unless a regression is found.

- [ ] **Step 1: Run the CLI against a real key**

Ensure `.env` in the repo root contains a valid `OPENAI_API_KEY`, then run:

```bash
npm start
```

Expected:

- Header banner shows `yules-ai — interactive chat` (bold) and `Ctrl+C to exit` (dim).
- A cyan `❯` prompt with a blinking cursor is ready for input.

- [ ] **Step 2: Send a message and observe streaming**

Type `hello` and press Enter.

Expected:

- Your message appears above the input under a cyan bold `You` label.
- The input bar replaces itself with a green dots spinner and dim text `Yules is typing…`.
- Assistant tokens stream in under a green bold `Yules` label as they arrive.
- When the stream completes, the spinner disappears and the prompt returns, focused.

- [ ] **Step 3: Verify multi-turn context**

Send `what did I just say?` as a follow-up.

Expected: The assistant references `hello` (or quotes it), proving `messages` is preserved across turns.

- [ ] **Step 4: Verify error resilience**

With the CLI still running, send another message after temporarily invalidating the key by setting `OPENAI_API_KEY=bad` in your current shell and restarting the CLI (this tests the in-session error path):

```bash
OPENAI_API_KEY=bad npm start
```

Send `hi`.

Expected:

- A red `Error: <api error message>` line appears above the input bar.
- No partial assistant message is committed to history.
- The input prompt returns and is usable. Pressing Ctrl+C exits with status 0.

- [ ] **Step 5: Verify the no-key fail-fast**

In a shell where `OPENAI_API_KEY` is unset and the `cwd` has no `.env`:

```bash
unset OPENAI_API_KEY
cd /tmp && node /absolute/path/to/yules-ai/dist/cli.js
```

Expected: Stderr prints `yules-ai: OPENAI_API_KEY is missing or empty...` and the process exits with a non-zero code. The Ink UI never mounts.

- [ ] **Step 6: (Optional) Update README if anything user-facing changed**

The README describes the CLI as interactive streaming chat — this remains true. If you want, add one sentence under "Run locally" mentioning the Ink UI (header, spinner, colored labels). Skip this step if the current README reads fine.

If a README change is made, commit separately:

```bash
git add README.md
git commit -m "docs(readme): mention ink-based terminal UI"
```

---

## Rollback

If the Ink UI is broken and blocking work, revert the task commits in reverse order. Because each task is an independent commit, `git revert <hash>` of Task 6's commit restores the old readline loop (Task 2–5 artifacts are unused but harmless if left in place; revert them too for a clean rollback).
