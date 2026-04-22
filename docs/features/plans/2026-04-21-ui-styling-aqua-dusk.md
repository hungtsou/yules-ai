# UI Styling — Aqua Dusk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Yules's Ink terminal UI with the Aqua Dusk palette, rounded boxes, gutter markers, per-tool emojis, rotating thinking indicator, and full markdown rendering in assistant messages.

**Architecture:** Layered refactor of `src/ui/`. Extract a `theme.ts` module (palette + emoji + box-drawing chars) as the single source of truth. Keep existing component shape and add new components where responsibilities are new (`Footer`, `ToolGroup`, `Thinking`, `Markdown`). No changes to `src/agent/*` except extracting one constant (`MODEL_NAME`) for the footer.

**Tech Stack:** TypeScript (ESM, `tsc` → `dist/`), React 19, Ink 6, `ink-text-input`, `ink-spinner`, `marked` (new), `cli-highlight` (new).

**Spec:** [`docs/features/specs/2026-04-21-ui-styling-aqua-dusk-design.md`](../specs/2026-04-21-ui-styling-aqua-dusk-design.md)

---

## Project conventions

- **Testing:** The spec lists automated UI tests as a non-goal, matching the existing `docs/features/plans/2026-04-20-yules-ink-ui.md` precedent. Each task uses `npm run check` (build + lint + format) plus a manual smoke step at the end.
- **Commits:** The workspace rule `git-commits-no-auto-commit` forbids committing without explicit user approval. Each task ends with a staged `git commit` command for reference — **do not execute it without asking the user first**. Use [Conventional Commits](https://www.conventionalcommits.org/).
- **File naming:** `.tsx` for files that render JSX. `.ts` for pure modules (`theme.ts`, `useAgentChat.ts`).
- **Imports:** Use `.js` extensions on relative imports (ESM + `NodeNext` module resolution already enforces this). Example: `import { theme } from '../theme.js';`

---

## Task 1: Add dependencies and create the theme module

**Files:**

- Modify: `package.json` (dependencies)
- Create: `src/ui/theme.ts`

- [ ] **Step 1: Install markdown + syntax-highlight dependencies**

Run:

```bash
npm install marked cli-highlight
```

Expected: `package.json` gains `marked` and `cli-highlight` runtime deps. `package-lock.json` updates. Accept whatever npm resolves as latest compatible — no hand-editing of versions.

- [ ] **Step 2: Create `src/ui/theme.ts`**

Create the file with this exact content:

```typescript
export const theme = {
  colors: {
    primary: '#5eead4',
    user: '#22d3ee',
    accent: '#fbbf24',
    muted: '#94a3b8',
    mutedStrong: '#cbd5e1',
    success: '#4ade80',
    error: '#f87171',
    codeBg: '#0f172a',
  },
  emoji: {
    brand: '🌊',
    thinking: ['💭', '🧠', '✨', '💡'] as const,
    typing: '✍️',
    tools: {
      readFile: '📖',
      writeFile: '✏️',
      listFiles: '📂',
      deleteFile: '🗑',
      default: '🔧',
    } as Record<string, string>,
  },
  chars: {
    userMark: '>',
    assistantMark: '●',
    toolHeadMark: '⏺',
    toolChildMark: '└─',
    ok: '✓',
    err: '✗',
    prompt: '❯',
  },
  spinner: 'dots' as const,
  timing: {
    thinkingCycleMs: 400,
  },
} as const;

export function emojiForTool(name: string): string {
  return theme.emoji.tools[name] ?? theme.emoji.tools.default;
}
```

- [ ] **Step 3: Verify build, lint, and format still pass**

Run:

```bash
npm run check
```

Expected: Build succeeds, lint passes, prettier passes. `theme.ts` is not yet imported anywhere, so no runtime effect.

- [ ] **Step 4: Commit (requires user approval)**

```bash
git add package.json package-lock.json src/ui/theme.ts
git commit -m "feat(ui): add aqua dusk theme module and markdown deps"
```

---

## Task 2: Build the markdown subsystem

**Files:**

- Create: `src/ui/components/markdown/codeBlock.tsx`
- Create: `src/ui/components/markdown/renderTokens.tsx`
- Create: `src/ui/components/markdown/Markdown.tsx`

This task adds a full markdown renderer for assistant messages. It is not yet wired into any component — Task 9 flips `Message.tsx` to use it.

- [ ] **Step 1: Create `src/ui/components/markdown/codeBlock.tsx`**

```typescript
import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';
import { theme } from '../../theme.js';

interface CodeBlockProps {
  lang?: string;
  value: string;
}

function safeHighlight(value: string, lang?: string): string {
  if (!lang) return value;
  try {
    return highlight(value, { language: lang, ignoreIllegals: true });
  } catch {
    return value;
  }
}

export function CodeBlock({ lang, value }: CodeBlockProps) {
  const highlighted = safeHighlight(value, lang);
  return (
    <Box flexDirection="column" marginY={1}>
      {lang ? (
        <Text color={theme.colors.muted}> {lang}</Text>
      ) : null}
      <Box
        borderStyle="round"
        borderColor={theme.colors.muted}
        paddingX={1}
      >
        <Text>{highlighted}</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Create `src/ui/components/markdown/renderTokens.tsx`**

This file walks `marked` tokens and emits Ink components. Keep it exhaustive for supported types and fall back to plain dim text for unknowns.

```typescript
import type { ReactNode } from 'react';
import { Box, Text } from 'ink';
import type { Tokens } from 'marked';
import { theme } from '../../theme.js';
import { CodeBlock } from './codeBlock.js';

type BlockToken = Tokens.Generic;
type InlineToken = Tokens.Generic;

function renderInline(tokens: InlineToken[] | undefined): ReactNode[] {
  if (!tokens) return [];
  return tokens.map((tok, i) => {
    switch (tok.type) {
      case 'strong':
        return (
          <Text key={i} bold>
            {renderInline((tok as Tokens.Strong).tokens)}
          </Text>
        );
      case 'em':
        return (
          <Text key={i} italic>
            {renderInline((tok as Tokens.Em).tokens)}
          </Text>
        );
      case 'codespan':
        return (
          <Text
            key={i}
            color={theme.colors.accent}
            backgroundColor={theme.colors.codeBg}
          >
            {(tok as Tokens.Codespan).text}
          </Text>
        );
      case 'link':
        return (
          <Text key={i} color={theme.colors.primary} underline>
            {(tok as Tokens.Link).text}
          </Text>
        );
      case 'br':
        return <Text key={i}>{'\n'}</Text>;
      case 'text':
      default: {
        const t = tok as Tokens.Text;
        if ('tokens' in t && t.tokens) {
          return <Text key={i}>{renderInline(t.tokens)}</Text>;
        }
        return <Text key={i}>{t.text ?? ''}</Text>;
      }
    }
  });
}

function renderBlock(tok: BlockToken, key: number): ReactNode {
  switch (tok.type) {
    case 'heading': {
      const h = tok as Tokens.Heading;
      return (
        <Box key={key} marginBottom={1}>
          <Text bold color={theme.colors.primary}>
            {'#'.repeat(h.depth)} {renderInline(h.tokens)}
          </Text>
        </Box>
      );
    }
    case 'paragraph': {
      const p = tok as Tokens.Paragraph;
      return (
        <Box key={key} marginBottom={1}>
          <Text color={theme.colors.mutedStrong}>
            {renderInline(p.tokens)}
          </Text>
        </Box>
      );
    }
    case 'list': {
      const l = tok as Tokens.List;
      return (
        <Box key={key} flexDirection="column" marginBottom={1}>
          {l.items.map((item, i) => (
            <Box key={i}>
              <Text color={theme.colors.primary}>
                {l.ordered ? `${i + 1}. ` : '• '}
              </Text>
              <Text color={theme.colors.mutedStrong}>
                {renderInline(item.tokens as InlineToken[])}
              </Text>
            </Box>
          ))}
        </Box>
      );
    }
    case 'code': {
      const c = tok as Tokens.Code;
      return <CodeBlock key={key} lang={c.lang} value={c.text} />;
    }
    case 'blockquote': {
      const b = tok as Tokens.Blockquote;
      return (
        <Box key={key} marginBottom={1}>
          <Text color={theme.colors.muted}>│ </Text>
          <Box flexDirection="column">
            {b.tokens.map((inner, i) => renderBlock(inner, i))}
          </Box>
        </Box>
      );
    }
    case 'space':
      return null;
    default: {
      const anyTok = tok as { raw?: string; text?: string };
      const raw = anyTok.raw ?? anyTok.text ?? '';
      return (
        <Box key={key} marginBottom={1}>
          <Text color={theme.colors.muted}>{raw}</Text>
        </Box>
      );
    }
  }
}

export function renderTokens(tokens: BlockToken[]): ReactNode[] {
  return tokens.map((tok, i) => renderBlock(tok, i));
}
```

- [ ] **Step 3: Create `src/ui/components/markdown/Markdown.tsx`**

```typescript
import { Box, Text } from 'ink';
import { marked } from 'marked';
import { theme } from '../../theme.js';
import { renderTokens } from './renderTokens.js';

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  let tokens;
  try {
    tokens = marked.lexer(children);
  } catch {
    return (
      <Text color={theme.colors.mutedStrong} wrap="wrap">
        {children}
      </Text>
    );
  }
  return <Box flexDirection="column">{renderTokens(tokens)}</Box>;
}
```

- [ ] **Step 4: Verify build, lint, and format still pass**

Run:

```bash
npm run check
```

Expected: All pass. `Markdown` is not yet used anywhere; this task just adds new files.

- [ ] **Step 5: Commit (requires user approval)**

```bash
git add src/ui/components/markdown/
git commit -m "feat(ui): add markdown renderer with code block support"
```

---

## Task 3: Restyle `Header.tsx`

**Files:**

- Modify: `src/ui/components/Header.tsx`

- [ ] **Step 1: Replace `Header.tsx` contents**

```typescript
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export function Header() {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color={theme.colors.primary}>
        {theme.emoji.brand} Yules
      </Text>
      <Text color={theme.colors.muted}>general-purpose assistant</Text>
    </Box>
  );
}
```

- [ ] **Step 2: Run the CLI and eyeball the header**

```bash
npm run build && npm start
```

Expected: Terminal shows a rounded teal-bordered box containing `🌊 Yules` (bold teal) and the muted tagline. Send `Ctrl+C` to exit. Tool calls / messages still render with pre-change styling — that's fine; later tasks handle them.

- [ ] **Step 3: Verify checks pass**

```bash
npm run check
```

Expected: All pass.

- [ ] **Step 4: Commit (requires user approval)**

```bash
git add src/ui/components/Header.tsx
git commit -m "feat(ui): restyle header with rounded box and aqua dusk palette"
```

---

## Task 4: Restyle `InputBar.tsx`

**Files:**

- Modify: `src/ui/components/InputBar.tsx`

- [ ] **Step 1: Replace `InputBar.tsx` contents**

```typescript
import { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';

interface InputBarProps {
  isStreaming: boolean;
  onSubmit: (text: string) => void;
}

export function InputBar({ isStreaming, onSubmit }: InputBarProps) {
  const [value, setValue] = useState('');

  if (isStreaming) {
    return (
      <Box>
        <Text>{theme.emoji.typing} </Text>
        <Text color={theme.colors.primary}>
          <Spinner type={theme.spinner} />
        </Text>
        <Text color={theme.colors.muted}> Yules is typing…</Text>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={1}
    >
      <Text color={theme.colors.user}>{theme.chars.prompt} </Text>
      <TextInput
        value={value}
        placeholder="ask anything…"
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

- [ ] **Step 2: Run and eyeball the input box**

```bash
npm run build && npm start
```

Expected: Idle prompt shows a rounded teal-bordered box containing `❯ ` followed by muted placeholder `ask anything…`. Type a prompt and submit — while the agent streams, the box is replaced with `✍️ ⠋ Yules is typing…`. Ctrl+C to exit.

- [ ] **Step 3: Verify checks pass**

```bash
npm run check
```

Expected: All pass.

- [ ] **Step 4: Commit (requires user approval)**

```bash
git add src/ui/components/InputBar.tsx
git commit -m "feat(ui): restyle input bar with rounded box and typing indicator"
```

---

## Task 5: Footer component + expose `modelName` through `useAgentChat`

**Files:**

- Modify: `src/agent/run.ts`
- Modify: `src/ui/useAgentChat.ts`
- Create: `src/ui/components/Footer.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Extract `MODEL_NAME` in `src/agent/run.ts`**

In `src/agent/run.ts`, add a module-scope export above `runAgent` and use it in the `streamText` call. Replace the existing line 35 `model: openai('gpt-5-mini'),` accordingly.

Exact diff (anchor line 33-35 in the current file):

```typescript
// near the top, after the Laminar.initialize block
export const MODEL_NAME = 'gpt-5-mini';
```

And in `streamText({ ... })`:

```typescript
model: openai(MODEL_NAME),
```

- [ ] **Step 2: Extend `useAgentChat` with `modelName`**

Edit `src/ui/useAgentChat.ts`:

1. Import `MODEL_NAME` alongside `runAgent`:

```typescript
import { runAgent, MODEL_NAME } from '../agent/run.js';
```

2. Add `modelName` to the `UseAgentChat` interface:

```typescript
export interface UseAgentChat {
  messages: ModelMessage[];
  streamingText: string;
  status: ChatStatus;
  error: string | null;
  send: (text: string) => void;
  inFlightTools: Record<string, InFlightTool>;
  modelName: string;
}
```

3. At the end of the hook, update the return statement:

```typescript
return {
  messages,
  streamingText,
  status,
  error,
  send,
  inFlightTools,
  modelName: MODEL_NAME,
};
```

- [ ] **Step 3: Create `src/ui/components/Footer.tsx`**

```typescript
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface FooterProps {
  modelName: string;
}

export function Footer({ modelName }: FooterProps) {
  return (
    <Box paddingX={2}>
      <Text color={theme.colors.muted}>{modelName}</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Wire `Footer` into `App.tsx`**

Replace `src/ui/App.tsx` contents:

```typescript
import { Box } from 'ink';
import { Header } from './components/Header.js';
import { MessageList } from './components/MessageList.js';
import { ErrorLine } from './components/ErrorLine.js';
import { InputBar } from './components/InputBar.js';
import { Footer } from './components/Footer.js';
import { useAgentChat } from './useAgentChat.js';

export function App() {
  const {
    messages,
    streamingText,
    status,
    error,
    send,
    inFlightTools,
    modelName,
  } = useAgentChat();

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
      <Footer modelName={modelName} />
    </Box>
  );
}
```

- [ ] **Step 5: Run and eyeball the footer**

```bash
npm run build && npm start
```

Expected: Below the input box, a single dim line reads `gpt-5-mini`. Ctrl+C to exit.

- [ ] **Step 6: Verify checks pass**

```bash
npm run check
```

Expected: All pass.

- [ ] **Step 7: Commit (requires user approval)**

```bash
git add src/agent/run.ts src/ui/useAgentChat.ts src/ui/components/Footer.tsx src/ui/App.tsx
git commit -m "feat(ui): add footer with model name"
```

---

## Task 6: Restyle `ErrorLine.tsx`

**Files:**

- Modify: `src/ui/components/ErrorLine.tsx`

- [ ] **Step 1: Replace `ErrorLine.tsx` contents**

```typescript
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface ErrorLineProps {
  message: string;
}

export function ErrorLine({ message }: ErrorLineProps) {
  return (
    <Box marginBottom={1}>
      <Text color={theme.colors.error} bold>
        Error: {message}
      </Text>
    </Box>
  );
}
```

- [ ] **Step 2: Verify checks pass**

```bash
npm run check
```

Expected: All pass. (No simple way to trigger an error in local smoke without disabling the API key; visual change is only a hex color, safe to skip runtime eyeball.)

- [ ] **Step 3: Commit (requires user approval)**

```bash
git add src/ui/components/ErrorLine.tsx
git commit -m "feat(ui): adopt aqua dusk palette in error line"
```

---

## Task 7: Replace `ToolLine` with grouped `ToolGroup`

**Files:**

- Create: `src/ui/components/ToolGroup.tsx`
- Modify: `src/ui/components/MessageList.tsx`
- Delete: `src/ui/components/ToolLine.tsx`

- [ ] **Step 1: Create `src/ui/components/ToolGroup.tsx`**

```typescript
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme, emojiForTool } from '../theme.js';

interface ToolGroupProps {
  name: string;
  argsPreview?: string;
  status: 'running' | 'ok' | 'error';
  summary?: string;
}

export function ToolGroup({
  name,
  argsPreview,
  status,
  summary,
}: ToolGroupProps) {
  const emoji = emojiForTool(name);
  const args = argsPreview ?? '';

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box>
        <Text color={theme.colors.muted}>{theme.chars.toolHeadMark} </Text>
        <Text>{emoji} </Text>
        <Text color={theme.colors.muted}>{name}</Text>
        {args ? (
          <>
            <Text color={theme.colors.muted}>  </Text>
            <Text color={theme.colors.accent}>{args}</Text>
          </>
        ) : null}
      </Box>
      <Box>
        <Text color={theme.colors.muted}>   {theme.chars.toolChildMark} </Text>
        {status === 'running' ? (
          <>
            <Text color={theme.colors.accent}>
              <Spinner type={theme.spinner} />
            </Text>
            <Text color={theme.colors.muted}> running…</Text>
          </>
        ) : status === 'ok' ? (
          <>
            <Text color={theme.colors.success}>{theme.chars.ok} </Text>
            <Text color={theme.colors.mutedStrong}>
              {summary ?? 'done'}
            </Text>
          </>
        ) : (
          <>
            <Text color={theme.colors.error}>{theme.chars.err} </Text>
            <Text color={theme.colors.error}>{summary ?? 'error'}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Update `src/ui/components/MessageList.tsx` to use `ToolGroup`**

The existing file emits `<ToolLine mode="call" … />`, `<ToolLine mode="result" … />`, and per-in-flight `<ToolLine mode="inflight" …/>`. Consolidate these into `<ToolGroup>` by pairing calls with results.

Replace the full file contents with:

```typescript
import type { ReactNode } from 'react';
import { Box } from 'ink';
import type { ModelMessage } from 'ai';
import { Message } from './Message.js';
import { ToolGroup } from './ToolGroup.js';
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

interface PendingToolCall {
  id: string;
  name: string;
  argsPreview: string;
  pushKey: string;
}

export function MessageList({
  messages,
  streamingText,
  inFlightTools,
}: MessageListProps) {
  const nodes: ReactNode[] = [];
  const pendingByCallId = new Map<string, PendingToolCall>();

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
      if (typeof content === 'string') {
        if (content.trim() !== '') {
          nodes.push(
            <Message key={`m-${i}-s`} role="assistant" content={content} />,
          );
        }
        return;
      }
      if (Array.isArray(content)) {
        content.forEach((part, j) => {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part &&
            typeof part.text === 'string' &&
            part.text.trim() !== ''
          ) {
            nodes.push(
              <Message
                key={`m-${i}-p-${j}`}
                role="assistant"
                content={part.text}
              />,
            );
            return;
          }
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'tool-call' &&
            'toolCallId' in part &&
            'toolName' in part &&
            'input' in part &&
            typeof (part as { toolCallId: unknown }).toolCallId === 'string' &&
            typeof (part as { toolName: unknown }).toolName === 'string'
          ) {
            const p = part as {
              toolCallId: string;
              toolName: string;
              input: unknown;
            };
            const pushKey = `m-${i}-tc-${j}`;
            pendingByCallId.set(p.toolCallId, {
              id: p.toolCallId,
              name: p.toolName,
              argsPreview: previewArgs(p.input),
              pushKey,
            });
            nodes.push(
              <ToolGroup
                key={pushKey}
                name={p.toolName}
                argsPreview={previewArgs(p.input)}
                status="running"
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
            'toolCallId' in part &&
            'toolName' in part &&
            'output' in part &&
            typeof (part as { toolCallId: unknown }).toolCallId === 'string' &&
            typeof (part as { toolName: unknown }).toolName === 'string'
          ) {
            const p = part as {
              toolCallId: string;
              toolName: string;
              output: ToolResultOutput;
            };
            const pending = pendingByCallId.get(p.toolCallId);
            const replacementKey = pending?.pushKey ?? `m-${i}-tr-${j}`;
            const replacementIndex = pending
              ? nodes.findIndex(
                  (n) =>
                    (n as { key?: string | null }).key === pending.pushKey,
                )
              : -1;
            const replacement = (
              <ToolGroup
                key={replacementKey}
                name={p.toolName}
                argsPreview={pending?.argsPreview}
                status={isErrorOutput(p.output) ? 'error' : 'ok'}
                summary={summarizeToolOutput(
                  p.toolName,
                  outputToString(p.output),
                )}
              />
            );
            if (replacementIndex >= 0) {
              nodes[replacementIndex] = replacement;
            } else {
              nodes.push(replacement);
            }
            pendingByCallId.delete(p.toolCallId);
          }
        });
      }
      return;
    }
  });

  Object.entries(inFlightTools).forEach(([id, entry]) => {
    nodes.push(
      <ToolGroup
        key={`if-${id}`}
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

- [ ] **Step 3: Delete `src/ui/components/ToolLine.tsx`**

Run:

```bash
rm src/ui/components/ToolLine.tsx
```

- [ ] **Step 4: Run and eyeball a tool invocation**

```bash
npm run build && npm start
```

Send a prompt that triggers a file tool, e.g. `list files in src/ui`.

Expected: A block appears indented with `⏺ 📂 listFiles  path: "src/ui"` on the header line, then `   └─ ⠋ running…` on the child line while the tool runs. Once the tool finishes, the child line becomes `   └─ ✓ <summary>`. Ctrl+C to exit.

- [ ] **Step 5: Verify checks pass**

```bash
npm run check
```

Expected: All pass.

- [ ] **Step 6: Commit (requires user approval)**

```bash
git add src/ui/components/ToolGroup.tsx src/ui/components/MessageList.tsx
git add -u src/ui/components/ToolLine.tsx
git commit -m "feat(ui): group tool calls with results into single block"
```

---

## Task 8: Thinking component and visibility wiring

**Files:**

- Create: `src/ui/components/Thinking.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Create `src/ui/components/Thinking.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';

export function Thinking() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % theme.emoji.thinking.length);
    }, theme.timing.thinkingCycleMs);
    return () => clearInterval(id);
  }, []);
  return (
    <Box marginBottom={1} paddingLeft={2}>
      <Text>{theme.emoji.thinking[frame]}  </Text>
      <Text color={theme.colors.muted}>thinking </Text>
      <Text color={theme.colors.primary}>
        <Spinner type={theme.spinner} />
      </Text>
    </Box>
  );
}
```

- [ ] **Step 2: Wire `Thinking` into `App.tsx`**

Replace `src/ui/App.tsx` contents:

```typescript
import { Box } from 'ink';
import { Header } from './components/Header.js';
import { MessageList } from './components/MessageList.js';
import { ErrorLine } from './components/ErrorLine.js';
import { InputBar } from './components/InputBar.js';
import { Footer } from './components/Footer.js';
import { Thinking } from './components/Thinking.js';
import { useAgentChat } from './useAgentChat.js';

export function App() {
  const {
    messages,
    streamingText,
    status,
    error,
    send,
    inFlightTools,
    modelName,
  } = useAgentChat();

  const anyToolRunning = Object.values(inFlightTools).some(
    (t) => t.status === 'running',
  );
  const showThinking =
    status === 'streaming' && streamingText === '' && !anyToolRunning;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header />
      <MessageList
        messages={messages}
        streamingText={streamingText}
        inFlightTools={inFlightTools}
      />
      {showThinking && <Thinking />}
      {error && <ErrorLine message={error} />}
      <InputBar isStreaming={status === 'streaming'} onSubmit={send} />
      <Footer modelName={modelName} />
    </Box>
  );
}
```

- [ ] **Step 3: Run and eyeball the thinking block**

```bash
npm run build && npm start
```

Send a prompt that forces the agent to think for a moment (e.g. `what is 17 * 29?`).

Expected: Between submitting the prompt and the first streamed token, a line appears reading `🧠  thinking ⠋` (emoji rotates through 💭 → 🧠 → ✨ → 💡 at ~400ms intervals). The line disappears as soon as streaming begins or a tool starts. Ctrl+C to exit.

- [ ] **Step 4: Verify checks pass**

```bash
npm run check
```

Expected: All pass.

- [ ] **Step 5: Commit (requires user approval)**

```bash
git add src/ui/components/Thinking.tsx src/ui/App.tsx
git commit -m "feat(ui): add rotating thinking indicator while agent works"
```

---

## Task 9: Message renders markdown, streaming uses `✍️` gutter

**Files:**

- Modify: `src/ui/components/Message.tsx`
- Modify: `src/ui/components/MessageList.tsx`

- [ ] **Step 1: Replace `Message.tsx` contents**

`Message` gains a `streaming` prop. When `role === 'assistant'` and `streaming === false`, content is rendered through `<Markdown>`. Otherwise (user, or streaming assistant), content is plain wrapped text.

```typescript
import { Box, Text } from 'ink';
import { theme } from '../theme.js';
import { Markdown } from './markdown/Markdown.js';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export function Message({ role, content, streaming = false }: MessageProps) {
  if (role === 'user') {
    return (
      <Box marginBottom={1}>
        <Text color={theme.colors.user}>{theme.chars.userMark} </Text>
        <Text color={theme.colors.mutedStrong} wrap="wrap">
          {content}
        </Text>
      </Box>
    );
  }

  if (streaming) {
    return (
      <Box marginBottom={1}>
        <Text>{theme.emoji.typing} </Text>
        <Text color={theme.colors.mutedStrong} wrap="wrap">
          {content}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={theme.colors.primary}>
          {theme.chars.assistantMark}{'  '}
        </Text>
        <Box flexDirection="column" flexGrow={1}>
          <Markdown>{content}</Markdown>
        </Box>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Pass `streaming` flag from `MessageList`**

In `src/ui/components/MessageList.tsx`, update the streaming-text branch to pass `streaming`:

Find the block at the end of the function:

```typescript
  if (streamingText !== '') {
    nodes.push(
      <Message key="streaming" role="assistant" content={streamingText} />,
    );
  }
```

Replace with:

```typescript
  if (streamingText !== '') {
    nodes.push(
      <Message
        key="streaming"
        role="assistant"
        content={streamingText}
        streaming
      />,
    );
  }
```

- [ ] **Step 3: Run and eyeball a full turn with markdown**

```bash
npm run build && npm start
```

Send: `show me a TypeScript hello-world in a fenced code block, with a short bulleted list explaining it`.

Expected behavior during the turn:

1. `🧠  thinking ⠋` (rotating) shows briefly.
2. As tokens arrive, streaming message appears with `✍️  <partial text>` gutter.
3. When streaming completes, the message re-renders: teal `●  `, then fully parsed markdown — bulleted list with primary-colored bullets, code block in a rounded muted box with syntax highlighting and a dim `ts` label above it.

Ctrl+C to exit.

- [ ] **Step 4: Verify checks pass**

```bash
npm run check
```

Expected: All pass.

- [ ] **Step 5: Commit (requires user approval)**

```bash
git add src/ui/components/Message.tsx src/ui/components/MessageList.tsx
git commit -m "feat(ui): render markdown in assistant messages and typing gutter"
```

---

## Task 10: Manual smoke + documentation

**Files:**

- Modify: `AGENTS.md` (repo map section)

- [ ] **Step 1: Run the full manual smoke checklist**

Start the CLI:

```bash
npm run build && npm start
```

Verify each of the following in one session (check off mentally, no automation):

1. Header: rounded teal border around `🌊 Yules` + muted tagline.
2. Input box: rounded teal border with `❯ ` and placeholder `ask anything…`.
3. Footer: dim `gpt-5-mini` under the input box.
4. Prompt: `list files in src/ui`.
   - Thinking line appears briefly with rotating emoji.
   - `ToolGroup` header shows `⏺ 📂 listFiles  path: "src/ui"` indented, amber args.
   - Child line starts as `└─ ⠋ running…` (amber spinner), becomes `└─ ✓ <summary>` (green check).
5. Prompt: `show me a TypeScript hello-world in a fenced code block`.
   - Streaming message renders with `✍️  ` gutter.
   - Final message shows `●  ` gutter + code block in a rounded muted box with a `ts` label above and syntax highlighting inside.
6. `Ctrl+C` exits cleanly.

If any of the above fails, fix before proceeding. Do not commit a broken task.

- [ ] **Step 2: Update `AGENTS.md` repo map**

Find the repository-map table in `AGENTS.md` and add rows for the new UI files. Replace the existing table block (currently five rows `src/cli.ts` → `src/agent/system/prompt.ts`) with:

```markdown
| Path                              | Role                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `src/cli.ts`                      | CLI entry: shebang, `dotenv`, env checks, Ink `render` of `App`               |
| `src/ui/App.tsx`                  | Ink root component; wires chat UI                                             |
| `src/ui/theme.ts`                 | Aqua Dusk palette, emoji map, box-drawing chars — single source of UI styling |
| `src/ui/useAgentChat.ts`          | Chat state, streaming consumption, errors; exposes `modelName`                |
| `src/ui/components/Header.tsx`    | Rounded welcome box                                                           |
| `src/ui/components/Footer.tsx`    | Model name under the input                                                    |
| `src/ui/components/Thinking.tsx`  | Rotating thinking indicator while the agent works                             |
| `src/ui/components/ToolGroup.tsx` | Grouped tool call + result display                                            |
| `src/ui/components/markdown/`     | Markdown renderer for assistant messages                                      |
| `src/agent/chat.ts`               | `streamReply` — pure `streamText` async generator                             |
| `src/agent/run.ts`                | `runAgent` + `MODEL_NAME` constant                                            |
| `src/agent/system/prompt.ts`      | `SYSTEM_PROMPT` and related system strings                                    |
```

- [ ] **Step 3: Verify checks pass**

```bash
npm run check
```

Expected: All pass.

- [ ] **Step 4: Commit (requires user approval)**

```bash
git add AGENTS.md
git commit -m "docs: update repo map for aqua dusk ui components"
```

---

## Completion check

- [ ] `src/ui/theme.ts` is the only place hex colors, emoji literals, and box-drawing chars appear.
- [ ] No files import the deleted `ToolLine.tsx`.
- [ ] `npm run check` passes from a clean state.
- [ ] The manual smoke checklist in Task 10 Step 1 passes end-to-end.
- [ ] `AGENTS.md` repo map reflects the new files.
