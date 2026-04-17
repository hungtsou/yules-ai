# yules-ai CLI agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a globally installable `yules-ai` binary that runs an interactive, streaming terminal chat using Vercel AI SDK (`streamText`), `@ai-sdk/openai` (`gpt-5-mini`), cwd-based `.env` loading, and the file layout from `docs/features/specs/2026-04-17-yules-cli-ai-agent-design.md`.

**Architecture:** `src/cli.ts` loads `dotenv`, validates `OPENAI_API_KEY`, then calls `runAgent()` from `src/agent/run.ts`. The runner maintains `ModelMessage[]`, uses readline for input, serializes async line handling with a promise chain to avoid overlapping streams, and streams assistant text via `result.textStream` to stdout. No integration tests; no new test runner unless a trivial pure helper is extracted (optional; skipped by default).

**Tech Stack:** Node.js ESM, TypeScript (`tsc`), `ai`, `@ai-sdk/openai`, `dotenv`.

---

### Task 1: Dependencies, `.gitignore`, and `.env.example`

**Files:**

- Modify: `package.json` — add `"bin"`, set `"main"` to CLI output, add `dependencies` (already present after `npm install`: `ai`, `@ai-sdk/openai`, `dotenv`).
- Modify: `.gitignore` — after `.env.*`, add `!.env.example` so the example file can be committed.
- Create: `.env.example`

- [ ] **Step 1: Ensure dependencies**

Run: `npm install ai @ai-sdk/openai dotenv`

Expected: `package.json` lists the three packages under `dependencies`.

- [ ] **Step 2: Fix `.gitignore`**

Append a line:

```gitignore
!.env.example
```

Run: `git check-ignore -v .env.example`

Expected: **not** ignored (no matching rule), or rule `!.env.example` negates ignore.

- [ ] **Step 3: Add `.env.example`**

Create `.env.example`:

```env
OPENAI_API_KEY=your-api-key-here
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "chore: add AI SDK deps, env example, and gitignore exception"
```

---

### Task 2: System prompt module

**Files:**

- Create: `src/agent/system/prompt.ts`

- [ ] **Step 1: Add `SYSTEM_PROMPT`**

Exact file content:

```typescript
export const SYSTEM_PROMPT = `You are a helpful AI assistant. You provide clear, accurate, and concise responses to user questions.

Guidelines:
- Be direct and helpful
- If you don't know something, say so honestly
- Provide explanations when they add value
- Stay focused on the user's actual question`;
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/system/prompt.ts
git commit -m "feat(agent): add SYSTEM_PROMPT"
```

---

### Task 3: Agent runner (`streamText`, readline, history)

**Files:**

- Create: `src/agent/run.ts`

- [ ] **Step 1: Implement `runAgent`**

Full implementation (imports use `.js` extensions for NodeNext ESM):

```typescript
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { streamText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system/prompt.js';

export async function runAgent(): Promise<void> {
  const messages: ModelMessage[] = [];
  const rl = createInterface({ input, output, terminal: true });

  let lineChain = Promise.resolve();

  const processLine = async (rawLine: string): Promise<void> => {
    const trimmed = rawLine.trim();
    if (trimmed === '') {
      output.write('You: ');
      return;
    }

    messages.push({ role: 'user', content: trimmed });

    try {
      const result = streamText({
        model: openai('gpt-5-mini'),
        system: SYSTEM_PROMPT,
        messages,
      });

      let full = '';
      for await (const chunk of result.textStream) {
        full += chunk;
        output.write(chunk);
      }

      if (!full.endsWith('\n')) {
        output.write('\n');
      }

      messages.push({ role: 'assistant', content: full });
    } catch (err) {
      console.error(
        'yules-ai:',
        err instanceof Error ? err.message : String(err),
      );
    }

    output.write('You: ');
  };

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      lineChain = lineChain
        .then(() => processLine(line))
        .catch((err: unknown) => {
          console.error(
            'yules-ai:',
            err instanceof Error ? err.message : String(err),
          );
          output.write('You: ');
        });
    });

    rl.on('close', () => {
      void lineChain.finally(() => {
        resolve();
      });
    });

    process.once('SIGINT', () => {
      output.write('\n');
      rl.close();
    });

    output.write('\n');
    output.write('yules-ai — interactive chat (Ctrl+D or Ctrl+C to exit)\n\n');
    output.write('You: ');
  });
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: no errors for `src/agent/run.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/agent/run.ts
git commit -m "feat(agent): interactive streaming chat loop"
```

---

### Task 4: CLI entry, `package.json` bin, remove old `index.ts`

**Files:**

- Create: `src/cli.ts` (first line shebang; `tsc` emits it to `dist/cli.js`)
- Delete: `src/index.ts`
- Modify: `package.json` — `"main": "dist/cli.js"`, `"bin": { "yules-ai": "dist/cli.js" }`, `"start": "node dist/cli.js"`

- [ ] **Step 1: Add `src/cli.ts`**

```typescript
#!/usr/bin/env node
import { config } from 'dotenv';
import { runAgent } from './agent/run.js';

config({ quiet: true });

const key = process.env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error(
    'yules-ai: OPENAI_API_KEY is missing or empty. Create a .env file in your current working directory with OPENAI_API_KEY set (this CLI loads .env from cwd).',
  );
  process.exit(1);
}

runAgent().catch((err: unknown) => {
  console.error('yules-ai:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 2: Update `package.json`**

Set:

- `"main": "dist/cli.js"`
- `"bin": { "yules-ai": "dist/cli.js" }`
- `"start": "node dist/cli.js"`

- [ ] **Step 3: Remove `src/index.ts`**

Delete the hello-world file so `tsc` does not emit an unused `dist/index.js` (or leave it — prefer delete to match spec).

- [ ] **Step 4: Build and verify shebang**

Run: `npm run build`

Run: `head -n 1 dist/cli.js`

Expected: first line is `#!/usr/bin/env node`

- [ ] **Step 5: Lint and format**

Run: `npm run lint`

Run: `npm run format`

- [ ] **Step 6: Missing-key smoke test (no API call)**

Run from a directory **without** a valid key in env (e.g. `env -i HOME="$HOME" PATH="$PATH" node dist/cli.js` from `/tmp` if no `.env`):

Expected: stderr message about `OPENAI_API_KEY`, exit code `1`.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts package.json src/index.ts
git commit -m "feat(cli): yules-ai entrypoint and global bin"
```

---

### Task 5: Testing policy (no integration tests)

**Files:** none required.

- [ ] **Step 1: Confirm scope**

- No integration tests (no live API calls in CI).
- No new test runner in this slice; optional unit tests only if a small pure helper is introduced later (not required).

---

## Self-review (plan vs spec)

| Spec requirement                                               | Task      |
| -------------------------------------------------------------- | --------- |
| `streamText`, OpenAI `gpt-5-mini`, `SYSTEM_PROMPT`             | Tasks 2–3 |
| cwd `.env`, `OPENAI_API_KEY`, fail fast                        | Task 1, 4 |
| `src/cli.ts`, `src/agent/run.ts`, `src/agent/system/prompt.ts` | Tasks 2–4 |
| Global `yules-ai` bin                                          | Task 4    |
| `.env.example`, `!.env.example`                                | Task 1    |
| Streaming, in-memory history, no assistant append on failure   | Task 3    |
| Ctrl+C / Ctrl+D exit                                           | Task 3–4  |

No placeholder steps; all file paths explicit.

---

## Verification (manual)

1. `npm run build && npm run lint && npm run format:check`
2. With a real `OPENAI_API_KEY` in project `.env`: `npm start` — multi-turn chat streams; Ctrl+D exits 0.
3. `npm pack` or `npm i -g .` then `yules-ai` from a folder with `.env` — same behavior.
