# Wire file tools into `runAgent` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `runAgent` access to the four already-built file tools (`readFile`, `writeFile`, `deleteFile`, `listFiles`) by wiring them into `streamText`, bounding the agent loop to 10 steps, and forwarding tool-call events through the existing `AgentCallbacks`.

**Architecture:** Single-file change in `src/agent/run.ts`. Add `tools` + `stopWhen: stepCountIs(10)` to the existing `streamText` call, and turn the `fullStream` text-only `if` into a `switch` that also forwards `tool-call` / `tool-result` / `tool-error` chunks to `onToolCallStart` / `onToolCallEnd`. No changes to signatures, UI, or the tool module.

**Tech Stack:** TypeScript (strict, ESM), Vercel AI SDK v6 (`ai`), `@ai-sdk/openai`, Node.js.

**Related docs:**

- Spec: [`docs/features/specs/2026-04-21-wire-file-tools-into-run-agent-design.md`](../specs/2026-04-21-wire-file-tools-into-run-agent-design.md)
- Prior spec (tool module itself): [`docs/features/specs/2026-04-21-agent-file-tools-design.md`](../specs/2026-04-21-agent-file-tools-design.md)

**Repo rules the executor MUST respect:**

- `docs-features-plans-specs.mdc` — docs go under `docs/features/`, never `docs/superpowers/`.
- `git-commits-no-auto-commit.mdc` — **do not run `git commit` without explicit user approval.** Steps below include a "prepare commit" step (staged + message drafted); the final `git commit` runs only after the user OKs it.

---

## File structure

Only `src/agent/run.ts` is edited. For quick reference, here's the current file (37 lines):

```1:37:src/agent/run.ts
import { streamText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system/prompt.js';
import type { AgentCallbacks } from '../types.ts';
import { filterCompatibleMessages } from './system/filterMessages.js';
import { getTracer, Laminar } from '@lmnr-ai/lmnr';

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY,
});

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
    experimental_telemetry: {
      isEnabled: true,
      tracer: getTracer(),
    },
  });

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      callbacks.onToken(chunk.text);
    }
  }

  return messages;
}
```

No other files in the repo are touched.

---

## Task 1: Wire tools into `runAgent` and forward tool events

**Files:**

- Modify: `src/agent/run.ts` (entire file — scoped rewrite of the body)

**Verification:** `npm run check` (build + lint + format:check) must pass; a manual CLI smoke exercises all four tools.

---

- [ ] **Step 1: Read the current file to confirm nothing has drifted**

Read `src/agent/run.ts`. It should match the 37-line snippet in "File structure" above. If it has changed, stop and reconcile with the user before continuing.

- [ ] **Step 2: Replace `src/agent/run.ts` with the new implementation**

Overwrite the entire file with the code below. It adds `stepCountIs` and `tools` imports, passes `tools` + `stopWhen: stepCountIs(10)` to `streamText`, and replaces the text-only `if` with a `switch` that also forwards tool events. Everything else — `Laminar.initialize`, the signature, `filterCompatibleMessages`, `experimental_telemetry`, and the returned `messages` — is preserved exactly.

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
        callbacks.onToolCallStart(chunk.toolName, chunk.input);
        break;
      case 'tool-result':
        callbacks.onToolCallEnd(
          chunk.toolName,
          stringifyToolResult(chunk.output),
        );
        break;
      case 'tool-error':
        callbacks.onToolCallEnd(chunk.toolName, errorToString(chunk.error));
        break;
      default:
        break;
    }
  }

  return messages;
}
```

Notes for the executor:

- The existing imports order is preserved; `stepCountIs` is added to the `'ai'` import, `tools` is a new line right under the `SYSTEM_PROMPT` import to keep the local-module grouping tight.
- `stringifyToolResult` and `errorToString` are local to this file; do not export them.
- The `switch` has an explicit `default: break;` so future chunk types (e.g. `reasoning-delta`, `tool-input-start`, `finish-step`) are silently ignored, matching the spec's §4.3.
- Do **not** touch `userMessage`, `conversationHistory`, the signature, or the return value. `userMessage` remains an unused parameter (same as today).

- [ ] **Step 3: Run typecheck + lint + format check**

Run: `npm run check`
Expected: exits 0. No TypeScript errors, no ESLint errors, Prettier reports all files formatted.

If Prettier fails on `src/agent/run.ts`, run `npx prettier --write src/agent/run.ts` and re-run `npm run check`. Do not silence lint or format rules.

- [ ] **Step 4: Build the CLI for the smoke test**

Run: `npm run build`
Expected: exits 0. `dist/agent/run.js` now contains the new code.

(`npm start` runs `prestart` → `build` automatically, but running `build` explicitly isolates build errors from runtime errors.)

- [ ] **Step 5: Manual smoke — `listFiles`**

Prerequisites: `.env` at the repo root contains a valid `OPENAI_API_KEY`.

Run: `npm start`

At the prompt, type: `list the files in the current directory`

Expected:

- The CLI prints a streamed assistant answer that mentions plausible entries from the repo root (e.g. `package.json`, `src`, `docs`, `README.md`).
- No crash, no unhandled exception. The UI does not render a tool-call indicator (expected — the UI still uses no-op callbacks).

If the assistant answers without seeming to have looked at the filesystem (e.g. hallucinates entries), that's an indication the tool isn't being offered or isn't being picked. In that case, re-check Step 2's `tools` argument and the `tools` import path.

Exit with Ctrl-C before the next smoke.

- [ ] **Step 6: Manual smoke — `readFile`**

Run: `npm start`

At the prompt, type: `read package.json and tell me the value of the "name" field`

Expected:

- The assistant's streamed answer mentions `yules-ai` (the actual `name` in `package.json`).
- No crash.

Exit with Ctrl-C.

- [ ] **Step 7: Manual smoke — `writeFile` then `deleteFile`**

Work inside a temp scratch directory so the agent can't touch the repo:

```bash
mkdir -p /tmp/yules-smoke && cd /tmp/yules-smoke
cp <path-to-your-checkout>/.env .env 2>/dev/null || true   # or `export OPENAI_API_KEY=...`
node <path-to-your-checkout>/dist/cli.js
```

At the prompt, type: `create a file named hello.txt with the contents "hi from yules"`

Expected:

- Streamed confirmation.
- Back in the terminal (after Ctrl-C), `cat /tmp/yules-smoke/hello.txt` prints `hi from yules` (exact trailing whitespace/newline may vary).

Re-run the CLI in the same directory and type: `delete the file hello.txt`

Expected:

- Streamed confirmation.
- `ls /tmp/yules-smoke/hello.txt` exits non-zero with "No such file or directory".

Clean up: `rm -rf /tmp/yules-smoke`.

- [ ] **Step 8: Stage the change and draft the commit message**

Run:

```bash
git add src/agent/run.ts
git status
git diff --cached
```

Expected: the staged diff matches the code in Step 2 (one file, ~30 net lines added).

Draft commit message (Conventional Commits, imperative, no trailing period):

```
feat(agent): wire file tools into runAgent with 10-step cap

Pass the existing `tools` record to `streamText`, add
`stopWhen: stepCountIs(10)` to enable the multi-step tool loop,
and forward tool-call / tool-result / tool-error chunks through
the existing AgentCallbacks. No signature, return, or UI changes.

Refs: docs/features/specs/2026-04-21-wire-file-tools-into-run-agent-design.md
```

- [ ] **Step 9: Commit — ONLY after explicit user approval**

Per `git-commits-no-auto-commit.mdc`, do **not** run `git commit` automatically. Ask the user:

> "Change is staged and verified. Commit with the message above?"

If the user approves, run:

```bash
git commit -m "feat(agent): wire file tools into runAgent with 10-step cap" \
  -m "Pass the existing \`tools\` record to \`streamText\`, add \`stopWhen: stepCountIs(10)\` to enable the multi-step tool loop, and forward tool-call / tool-result / tool-error chunks through the existing AgentCallbacks. No signature, return, or UI changes." \
  -m "Refs: docs/features/specs/2026-04-21-wire-file-tools-into-run-agent-design.md"
```

Then run `git status` and verify the working tree is clean and HEAD advanced by one commit.

If the user declines or requests changes, leave the change staged and surface their feedback.

---

## Spec coverage

Mapping every section of the spec to a step in this plan:

| Spec section                                       | Covered by                  |
| -------------------------------------------------- | --------------------------- |
| §1 Goal — multi-step agent with 4 file tools       | Step 2 (whole rewrite)      |
| §2 Scope — only `run.ts` edited                    | Task 1 file list + Step 2   |
| §2 Non-goals — no UI / tools / prompt / sig change | Step 2 preserves all of it  |
| §3 File layout — single file                       | Task 1 "Files" block        |
| §4.1 Imports — `stepCountIs`, `tools`              | Step 2 (import lines)       |
| §4.2 `streamText` gains `tools` + `stopWhen`       | Step 2 (`streamText` call)  |
| §4.3 `fullStream` switch                           | Step 2 (`for await` switch) |
| §4.4 Step budget rationale                         | Step 2 (`stepCountIs(10)`)  |
| §4.5 File-tools return strings already             | N/A (informational)         |
| §5 Signature & return unchanged                    | Step 2 (preserved)          |
| §6 Error handling unchanged                        | Step 2 (no try/catch added) |
| §10 Verification — `npm run check` + 4 smokes      | Steps 3 + 5–7               |
| §11 Acceptance checklist                           | All steps                   |

No gaps.

---

## Self-review notes

- **Placeholder scan:** no TBD / TODO / "similar to task N" / "add appropriate error handling" — code blocks carry the full implementation, expected outputs are concrete.
- **Type consistency:** chunk field names (`chunk.text`, `chunk.toolName`, `chunk.input`, `chunk.output`, `chunk.error`) verified against `node_modules/ai/dist/index.d.ts` (TypedToolCall / TypedToolResult / TypedToolError / text-delta). The local helpers `stringifyToolResult(value: unknown): string` and `errorToString(err: unknown): string` are both used exactly as declared.
- **Scope:** single-file, ~30 net lines, one commit. No decomposition needed.
