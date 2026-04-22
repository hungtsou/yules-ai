# UI styling — Aqua Dusk + Claude-Code-inspired layout

**Date:** 2026-04-21
**Scope:** `src/ui/` (no changes to `src/agent/`)
**Status:** Design approved; awaiting implementation plan.

## Summary

Restyle Yules's Ink-based terminal UI to match Claude Code's visual idioms
(rounded boxes, gutter markers, grouped tool blocks, markdown rendering,
thinking indicator) using a distinct **Aqua Dusk** color palette and original
emojis for tool calls, thinking, and streaming. Layered refactor — existing
component structure preserved, theme extracted, new components added where
responsibilities are genuinely new.

## Goals

- Look and feel that clearly reads "not Claude" while adopting its proven
  terminal-UI patterns.
- Single source of truth for colors, emojis, and box-drawing characters, so
  future visual tweaks are a one-file change.
- Full markdown rendering in assistant messages (headers, bold/italic, inline
  code, fenced code with syntax highlighting, lists, blockquotes, links).
- Per-tool emojis (📖 read, ✏️ write, 🗑 delete, 📂 list, 🔧 default) and a
  rotating thinking-emoji animation.

## Non-goals

- Scroll management, viewport trimming. Terminal native scroll handles it.
- Multi-line input (`ink-text-input` stays).
- Slash-command system (`/help` not implemented; footer doesn't hint at it).
- Token/context counter, turn counter, cwd in the footer.
- Dimmed past-transcript effect.
- Light-theme variant. Dark terminals only.
- Terminal capability detection. Assume 24-bit color + Unicode + emoji.
- Any change to `src/agent/*` beyond surfacing the model name string.
- Markdown tables, task lists, footnotes. Rendered as dim plain text.

## Approach

**Layered refactor** over full rewrite: keep the existing component shape
(`Header`, `MessageList`, `Message`, `ToolLine`, `InputBar`, `ErrorLine`),
extract a `theme.ts` module, restyle each component to read from the theme,
add new components where responsibilities are new (`Footer`, `ToolGroup`,
`Thinking`, `Markdown`).

**Markdown rendering** uses `marked.lexer()` to tokenize, then a custom walker
emits Ink `<Text>`/`<Box>` nodes. Fenced code blocks run through
`cli-highlight` for syntax highlighting inside a bordered `<Box>`. This
composes with Ink's layout (code blocks respect terminal width properly)
rather than emitting a single ANSI string.

## File layout

```
src/ui/
├── theme.ts                 NEW — palette tokens + emoji map + box-drawing chars
├── App.tsx                  CHANGED — compose Header + MessageList + Thinking + ErrorLine + InputBar + Footer
├── useAgentChat.ts          CHANGED — expose `modelName` (read from agent/run.ts)
├── useAgentChat.helpers.ts  UNCHANGED
└── components/
    ├── Header.tsx           CHANGED — rounded box, brand emoji, teal border
    ├── Message.tsx          CHANGED — gutter markers (> / ●), Markdown for assistant text, ✍️ while streaming
    ├── MessageList.tsx      CHANGED — groups tool-call + matching tool-result into one ToolGroup
    ├── ToolGroup.tsx        NEW — replaces loose ToolLine rendering; header + child line(s)
    ├── ToolLine.tsx         DELETED — folded into ToolGroup
    ├── Thinking.tsx         NEW — spinner + rotating emoji + dim text while waiting
    ├── InputBar.tsx         CHANGED — rounded box around TextInput, teal border
    ├── Footer.tsx           NEW — single line: `gpt-4o`
    ├── ErrorLine.tsx        CHANGED — palette colors only
    └── markdown/
        ├── Markdown.tsx     NEW — entry: string → marked.lexer → renderTokens
        ├── renderTokens.tsx NEW — token → Ink <Text>/<Box> tree
        └── codeBlock.tsx    NEW — fenced code: cli-highlight + bordered Box
```

## New dependencies

- `marked` (MIT) — markdown tokenizer.
- `cli-highlight` (ISC) — terminal syntax highlighting for fenced code.

## Theme module

`src/ui/theme.ts` is the single source of truth for colors, emojis, and
box-drawing characters. All components import from it; no hex or emoji
literals live elsewhere.

```typescript
export const theme = {
  colors: {
    primary: '#5eead4', // teal-300   — borders, assistant bullet, brand
    user: '#22d3ee', // cyan-400   — user gutter marker
    accent: '#fbbf24', // amber-400  — highlights (file paths, inline code fg)
    muted: '#94a3b8', // slate-400  — tool lines, hints, thinking text
    mutedStrong: '#cbd5e1', // slate-300  — plain assistant text
    success: '#4ade80', // green-400  — tool ok checkmark
    error: '#f87171', // rose-400   — tool error, error line
    codeBg: '#0f172a', // slate-900  — code block background
  },
  emoji: {
    brand: '🌊',
    thinking: ['💭', '🧠', '✨', '💡'], // rotates every 400ms
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
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
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

### Notes

- Brand emoji `🌊` matches the Aqua Dusk palette; swap with a one-character
  edit if taste changes.
- Emoji map keys match the actual tool names in `src/agent/tools/index.ts`
  (`readFile`, `writeFile`, `listFiles`, `deleteFile`). New tools fall back to
  `🔧` via `emojiForTool()`.
- `chars` centralizes box-drawing so a future ASCII-only variant is a
  one-file change.

## Component specifications

### `Header.tsx`

```
╭─ 🌊 Yules ─────────────────────────────╮
│ general-purpose assistant               │
╰─────────────────────────────────────────╯
```

- Ink `<Box borderStyle="round" borderColor={theme.colors.primary}>`.
- Line 1 bold, teal: `🌊 Yules`. Line 2 muted slate tagline.
- Box takes available terminal width.

### `Message.tsx` — user

```
> list the files in src/ui
```

- Cyan `>` in a 2-char gutter, plain text after.
- No bottom margin.

### `Message.tsx` — assistant

```
●  Here are the files in src/ui:

   - App.tsx
   - components/
   - useAgentChat.ts
```

- Teal `●` marker in a 2-char gutter.
- Content rendered via `<Markdown>`, indented to the gutter.
- One blank line below the block.

**Streaming variant.** While `status === 'streaming'` and tokens are arriving,
the gutter marker is `✍️` instead of `●`, and content renders as plain
wrapped text (not markdown). Once streaming completes and the message moves
into `messages[]`, it re-renders with `●` and full markdown.

### `ToolGroup.tsx`

Pairs one tool-call with its result. Three states.

**Running:**

```
⏺  📖 readFile  path: "src/ui"
   └─ ⠋ running…
```

**Success:**

```
⏺  📖 readFile  path: "src/ui"
   └─ ✓ 6 entries
```

**Error:**

```
⏺  🗑 deleteFile  path: "/etc/passwd"
   └─ ✗ permission denied
```

- Header: `⏺` (muted) + per-tool emoji + tool name (muted) + args preview
  in amber. Args preview comes from the existing `previewArgs()` helper —
  single compact string, no key/value coloring.
- Child line: `└─` + spinner (amber) / check (green) / cross (rose) + summary.
- 2-space left margin matching the assistant gutter — tool calls visually
  belong to the assistant's turn.
- Orphan case (tool-call with no matching tool-result): child shows
  `└─ (no result)` in muted.

### `Thinking.tsx`

```
🧠  thinking ⠋
```

- Local state: `frame` index, cycled via `setInterval` at
  `theme.timing.thinkingCycleMs`.
- Emoji frames from `theme.emoji.thinking`.
- Spinner after the text in primary color.
- `useEffect` cleanup clears the interval on unmount.

**Visibility rule** (computed in `App.tsx` from existing state):

```
show <Thinking />  iff
  status === 'streaming'
  && streamingText === ''
  && no entry in inFlightTools has status === 'running'
```

### `InputBar.tsx`

Idle:

```
╭─────────────────────────────────────────╮
│ ❯ ask anything…                          │
╰─────────────────────────────────────────╯
```

- `<Box borderStyle="round" borderColor={theme.colors.primary}>`.
- Inside: cyan `❯ ` + `<TextInput>`. Placeholder muted slate.

Streaming:

```
✍️  Yules is typing…
```

- Single line, no box. (Matches today's streaming branch with new styling.)

### `Footer.tsx`

```
  gpt-5-mini
```

- 2-space left padding, muted slate.
- Reads `modelName` from `useAgentChat`. Renders empty line if undefined.

### `ErrorLine.tsx`

```
Error: OPENAI_API_KEY not set
```

- Rose-colored bold text. No emoji.
- Appears between `MessageList` and `InputBar`.

## Markdown rendering

### Flow

```
assistant text (string)
        │
        ▼  marked.lexer(text) — array of block tokens
        │
        ▼  renderTokens(tokens) — Markdown.tsx
        │
        ▼  per-token mapping:
        │    heading     → <Text bold color={primary}>
        │    paragraph   → inline walker (bold/em/code/link/text)
        │    list        → <Box flexDirection="column"> + bullet per item
        │    code        → <CodeBlock lang={t.lang} value={t.text} />
        │    blockquote  → left gutter column with │ + dim content
        │    html/table  → dim plain text fallback
        ▼
   Ink <Box>/<Text> tree
```

### `CodeBlock.tsx`

```
 ts
╭─────────────────────────────────────────╮
│ export function App() {                 │
│   return <Box>Hello</Box>;              │
│ }                                       │
╰─────────────────────────────────────────╯
```

- Language label (dim muted) on the line directly above the box. (Ink's
  `<Box borderStyle="round">` has no border-title prop, so the label sits
  outside.) Omitted entirely if no language is detected.
- Rounded muted border using `<Box borderStyle="round" borderColor={muted}>`.
- Body: `cli-highlight` with detected language → ANSI string in a `<Text>`
  with `wrap="end"`. Unknown language → unhighlighted, still boxed.

### Inline renderer

- `bold` → `<Text bold>`
- `em` / `italic` → `<Text italic>`
- `codespan` → `<Text color={accent} backgroundColor={codeBg}>`
- `link` → `<Text color={primary} underline>{text}</Text>` (URL dropped)
- `text` → plain `<Text>`

### Streaming safety

Markdown rendering runs **only on finalized** messages in `messages[]`.
In-progress `streamingText` renders as plain wrapped text to avoid flicker
from mid-parse oddness (unclosed fences, etc.).

## State & data flow changes

`useAgentChat` gets one new field:

```typescript
export interface UseAgentChat {
  messages: ModelMessage[];
  streamingText: string;
  status: ChatStatus;
  error: string | null;
  send: (text: string) => void;
  inFlightTools: Record<string, InFlightTool>;
  modelName: string; // NEW
}
```

`modelName` is read from a new `MODEL_NAME` constant extracted in
`src/agent/run.ts`: the current inline `openai('gpt-5-mini')` becomes
`openai(MODEL_NAME)` with `export const MODEL_NAME = 'gpt-5-mini'` at module
scope. `useAgentChat` imports `MODEL_NAME` and re-exposes it as
`modelName`. No runtime coupling — just a string import.

No other state machine changes. `Thinking` visibility, streaming gutter, and
tool-group pairing all derive from existing state.

## Error cases

| Case                                       | Behavior                                                 |
| ------------------------------------------ | -------------------------------------------------------- |
| `marked.lexer` throws on malformed input   | Catch, render raw string as `<Text>`. Never crash.       |
| `cli-highlight` throws on unknown language | Render code block unhighlighted, still boxed.            |
| Tool name not in emoji map                 | `emojiForTool()` returns default `🔧`.                   |
| Tool-call with no matching result          | Header + `└─ (no result)` in muted.                      |
| Terminal narrower than box content         | Ink handles border truncation; `TextInput` wraps cursor. |
| Terminal lacks box-drawing support         | Renders as `?`. Fix: swap `theme.chars` to ASCII.        |
| Streaming contains partial markdown        | Plain text until streaming completes, then re-rendered.  |
| `modelName` unavailable                    | Footer renders empty line.                               |

## Testing strategy

Matches the existing project norm (see `docs/features/plans/2026-04-20-yules-ink-ui.md`):
no automated tests are introduced for UI code. Verification is:

1. **`npm run check`** — runs `tsc` build, `eslint`, and `prettier --check`.
   Must pass after every task in the implementation plan.
2. **Manual smoke checklist** (tracked in the implementation plan):
   - Run `npm start` and verify the rounded header box + Aqua Dusk palette renders.
   - Send a prompt that triggers a file tool (e.g. "list files in src/ui") →
     verify `ToolGroup` renders with the per-tool emoji (📂), amber args,
     green check on success.
   - Ask for a response with markdown (e.g. "show me a TypeScript hello-world
     in a code block") → verify fenced code block renders inside a bordered
     box with syntax highlighting.
   - Observe `Thinking` block appears with rotating emoji before first
     token; disappears when streaming starts.
   - Observe streaming assistant message renders with `✍️` gutter while
     streaming, then re-renders with `●` and full markdown on completion.
   - Ctrl-C during streaming → clean exit.
   - Footer shows `gpt-5-mini` under the input box.

No new test framework (`vitest`, `ink-testing-library`) is added as part of
this feature. If unit testing is desired later, it is a separate feature.

## Rollout

Single PR on a feature branch. Suggested commit order (details belong in the
implementation plan, not this spec):

1. `theme.ts` + deps (`marked`, `cli-highlight`).
2. Markdown renderer (`markdown/*`) + tests.
3. `Header`, `Footer`, `InputBar`, `ErrorLine` restyle.
4. `ToolGroup` replaces `ToolLine`; update `MessageList`.
5. `Thinking` component + wiring in `App.tsx`.
6. `Message` uses `Markdown` + `✍️` streaming gutter.
7. Component snapshot tests.
8. Docs: update README screenshot and `AGENTS.md` repo map.

## Open questions

None at spec time. Implementation-detail choices (exact summary string
formats, test assertion styles) are deferred to the implementation plan.
