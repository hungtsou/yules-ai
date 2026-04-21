# File-tools eval with Laminar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-turn Laminar evaluation that measures how often `gpt-5-mini` picks the correct file tool(s) for the prompts in `evals/data/file.tools.json`, runnable via `npm run eval:file-tools`.

**Architecture:** Six small files under `evals/` with clear single responsibilities (types, utils, mock tools, evaluator, executor, entry). The entry file composes the other modules, loads datapoints from JSON, and hands off to `evaluate()` from `@lmnr-ai/lmnr`. The `lmnr` CLI (shipped with the package) handles TS loading, dotenv, and tracing.

**Tech Stack:**

- TypeScript (ESM, NodeNext)
- Vercel AI SDK v6 — `generateText`, `tool`, `stepCountIs`
- `@ai-sdk/openai` — `gpt-5-mini`
- `@lmnr-ai/lmnr` — `evaluate`, `lmnr eval` CLI
- `zod` — tool input schemas
- No test framework in the repo; per-task verification uses `tsc --noEmit` and prettier; final verification is a live eval run.

**Reference spec:** [`docs/features/specs/2026-04-21-laminar-file-tools-eval-design.md`](../specs/2026-04-21-laminar-file-tools-eval-design.md)

**Conventions (repo-wide):**

- Single quotes, semicolons (`.prettierrc.json`).
- ESM relative imports end in `.js` even when the source is `.ts`.
- Do **not** auto-run `git commit` — every "Commit" step in this plan is a **suggested** command for the user to run when they choose to.

---

## File Structure

| Path                       | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `evals/types.ts`           | Shared types: `Category`, `Input`, `Output`, `Target`, `Datapoint`       |
| `evals/utils.ts`           | `loadDatapoints(path)`, `setEqual(a, b)`                                 |
| `evals/mocks/tools.ts`     | `ALL_FILE_TOOLS` (no-op mock tools) and `pickTools(names)` filter        |
| `evals/evaluators.ts`      | `correctness(output, target)` — category-aware 0/1 score                 |
| `evals/executors.ts`       | `createFileToolExecutor({ model })` — single-turn `generateText` wrapper |
| `evals/file-tools.eval.ts` | Entry point; composes modules, calls `evaluate({...})`                   |
| `package.json`             | Add `eval` / `eval:file-tools` scripts; add `zod` as devDependency       |
| `.env.example`             | Add `LMNR_PROJECT_API_KEY` placeholder                                   |

---

## Task 1: Install zod and create `evals/types.ts`

**Files:**

- Modify: `package.json` (add `zod` to `devDependencies`)
- Create: `evals/types.ts`

- [ ] **Step 1: Install zod as a devDependency**

Run:

```bash
npm install --save-dev zod
```

Expected: `package.json` gets a `devDependencies.zod` entry, `package-lock.json` updates, no errors.

- [ ] **Step 2: Create `evals/types.ts`**

Write this file:

```typescript
export type Category = 'golden' | 'secondary' | 'negative';

export interface Input {
  prompt: string;
  tools: string[];
}

export interface Output {
  toolsCalled: string[];
}

export interface Target {
  category: Category;
  expectedTools?: string[];
  forbiddenTools?: string[];
}

export interface Datapoint {
  data: Input;
  target: Target;
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 3: Typecheck the new file**

Run:

```bash
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck evals/types.ts
```

Expected: exits 0 with no output.

- [ ] **Step 4: Prettier check**

Run:

```bash
npx prettier --check 'evals/**/*.ts' 'package.json'
```

Expected: exits 0. If it fails with "Code style issues", run `npx prettier --write 'evals/**/*.ts' 'package.json'` and re-check.

- [ ] **Step 5: Suggested commit (await user approval)**

```bash
git add package.json package-lock.json evals/types.ts
git commit -m "chore(evals): add zod dep and scaffold types"
```

---

## Task 2: Create `evals/utils.ts`

**Files:**

- Create: `evals/utils.ts`

- [ ] **Step 1: Write `evals/utils.ts`**

```typescript
import { readFileSync } from 'node:fs';
import type { Datapoint } from './types.js';

export function loadDatapoints(path: string): Datapoint[] {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of datapoints in ${path}`);
  }
  return parsed as Datapoint[];
}

export function setEqual(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) {
    if (!sb.has(x)) return false;
  }
  return true;
}
```

- [ ] **Step 2: Typecheck `evals/` so far**

Run:

```bash
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck evals/types.ts evals/utils.ts
```

Expected: exits 0 with no output.

- [ ] **Step 3: Smoke-test `setEqual` via inline node**

Run:

```bash
node -e "const a=new Set(['x','y']); const b=new Set(['y','x']); console.log(a.size===b.size && [...a].every(v=>b.has(v)))"
```

Expected: `true`. (This validates the set-equality logic we just wrote as a standalone sanity check.)

- [ ] **Step 4: Prettier check**

Run:

```bash
npx prettier --check 'evals/**/*.ts'
```

Expected: exits 0.

- [ ] **Step 5: Suggested commit**

```bash
git add evals/utils.ts
git commit -m "feat(evals): add loadDatapoints and setEqual utilities"
```

---

## Task 3: Create `evals/mocks/tools.ts`

**Files:**

- Create: `evals/mocks/tools.ts`

- [ ] **Step 1: Write `evals/mocks/tools.ts`**

```typescript
import { tool, type Tool } from 'ai';
import { z } from 'zod';

export const ALL_FILE_TOOLS: Record<string, Tool> = {
  readFile: tool({
    description: 'Read the contents of a file at the given path.',
    inputSchema: z.object({
      path: z.string().describe('Absolute or relative path to the file.'),
    }),
    execute: async () => '',
  }),
  writeFile: tool({
    description: 'Create or overwrite a file with the given contents.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file to write.'),
      content: z.string().describe('Content to write to the file.'),
    }),
    execute: async () => '',
  }),
  listFiles: tool({
    description: 'List files and directories at the given path.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('Directory path whose entries should be listed.'),
    }),
    execute: async () => '',
  }),
  deleteFile: tool({
    description: 'Delete the file at the given path.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file to delete.'),
    }),
    execute: async () => '',
  }),
};

export function pickTools(names: string[]): Record<string, Tool> {
  const picked: Record<string, Tool> = {};
  for (const name of names) {
    const t = ALL_FILE_TOOLS[name];
    if (t) picked[name] = t;
  }
  return picked;
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck evals/types.ts evals/utils.ts evals/mocks/tools.ts
```

Expected: exits 0 with no output.

- [ ] **Step 3: Sanity-check `pickTools` semantics**

Manually confirm (by reading the file back) that:

- `ALL_FILE_TOOLS` has exactly four keys: `readFile`, `writeFile`, `listFiles`, `deleteFile`.
- `pickTools(['readFile', 'bogus'])` would return only `readFile` (unknown names are dropped silently by the `if (t)` guard).
- Every `execute` returns `''` — no real I/O.

- [ ] **Step 4: Prettier check**

Run:

```bash
npx prettier --check 'evals/**/*.ts'
```

Expected: exits 0.

- [ ] **Step 5: Suggested commit**

```bash
git add evals/mocks/tools.ts
git commit -m "feat(evals): add mock file-tool registry and pickTools filter"
```

---

## Task 4: Create `evals/evaluators.ts`

**Files:**

- Create: `evals/evaluators.ts`

- [ ] **Step 1: Write `evals/evaluators.ts`**

```typescript
import type { Output, Target } from './types.js';
import { setEqual } from './utils.js';

export function correctness(output: Output, target: Target): number {
  switch (target.category) {
    case 'golden': {
      const expected = target.expectedTools ?? [];
      return setEqual(output.toolsCalled, expected) ? 1 : 0;
    }
    case 'secondary':
      return 1;
    case 'negative': {
      const forbidden = new Set(target.forbiddenTools ?? []);
      const usedAnyForbidden = output.toolsCalled.some((name) =>
        forbidden.has(name),
      );
      return usedAnyForbidden ? 0 : 1;
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck evals/types.ts evals/utils.ts evals/evaluators.ts
```

Expected: exits 0 with no output. (If TypeScript complains about a missing return after the switch, that indicates `Category` union is incomplete — all three arms are covered, so this should type-check.)

- [ ] **Step 3: Hand-trace the truth table**

With the file open, walk through each branch against the real dataset and confirm:

- `{ category: 'golden', expectedTools: ['readFile'] }` + `toolsCalled: ['readFile']` → `1`
- `{ category: 'golden', expectedTools: ['readFile'] }` + `toolsCalled: ['listFiles']` → `0`
- `{ category: 'golden', expectedTools: ['listFiles','readFile'] }` + `toolsCalled: ['readFile']` → `0` (strict set-equality)
- `{ category: 'secondary', expectedTools: ['listFiles'] }` + `toolsCalled: []` → `1` (always)
- `{ category: 'negative', forbiddenTools: [...all 4] }` + `toolsCalled: []` → `1`
- `{ category: 'negative', forbiddenTools: [...all 4] }` + `toolsCalled: ['readFile'] }` → `0`

If any case disagrees with the implementation, fix the implementation.

- [ ] **Step 4: Prettier check**

Run:

```bash
npx prettier --check 'evals/**/*.ts'
```

Expected: exits 0.

- [ ] **Step 5: Suggested commit**

```bash
git add evals/evaluators.ts
git commit -m "feat(evals): add category-aware correctness evaluator"
```

---

## Task 5: Create `evals/executors.ts`

**Files:**

- Create: `evals/executors.ts`

- [ ] **Step 1: Write `evals/executors.ts`**

```typescript
import { generateText, stepCountIs, type LanguageModel } from 'ai';
import type { Input, Output } from './types.js';
import { pickTools } from './mocks/tools.js';

export function createFileToolExecutor({
  model,
}: {
  model: LanguageModel;
}): (input: Input) => Promise<Output> {
  return async (input) => {
    const result = await generateText({
      model,
      prompt: input.prompt,
      tools: pickTools(input.tools),
      stopWhen: stepCountIs(1),
    });

    const toolsCalled = Array.from(
      new Set(result.toolCalls.map((call) => call.toolName)),
    );

    return { toolsCalled };
  };
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck evals/types.ts evals/utils.ts evals/mocks/tools.ts evals/executors.ts
```

Expected: exits 0 with no output.

- [ ] **Step 3: Sanity review**

Confirm by reading the file back:

- No system prompt is passed to `generateText` (spec §5.3).
- `stopWhen: stepCountIs(1)` is present (single-turn enforcement).
- Tool-name deduplication uses a `Set` so duplicate calls of the same tool collapse to one entry.
- The `model` is a parameter — no hard-coded provider reference in this file.

- [ ] **Step 4: Prettier check**

Run:

```bash
npx prettier --check 'evals/**/*.ts'
```

Expected: exits 0.

- [ ] **Step 5: Suggested commit**

```bash
git add evals/executors.ts
git commit -m "feat(evals): add single-turn file-tool executor"
```

---

## Task 6: Create `evals/file-tools.eval.ts`

**Files:**

- Create: `evals/file-tools.eval.ts`

- [ ] **Step 1: Write `evals/file-tools.eval.ts`**

```typescript
import 'dotenv/config';
import { evaluate } from '@lmnr-ai/lmnr';
import { openai } from '@ai-sdk/openai';
import { loadDatapoints } from './utils.js';
import { createFileToolExecutor } from './executors.js';
import { correctness } from './evaluators.js';

const data = loadDatapoints('evals/data/file.tools.json');

await evaluate({
  name: 'file-tools',
  data,
  executor: createFileToolExecutor({ model: openai('gpt-5-mini') }),
  evaluators: { correctness },
});
```

- [ ] **Step 2: Typecheck the whole `evals/` tree**

Run:

```bash
npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck evals/types.ts evals/utils.ts evals/mocks/tools.ts evals/evaluators.ts evals/executors.ts evals/file-tools.eval.ts
```

Expected: exits 0 with no output.

Common failure: top-level `await` flagged. If so, confirm `"target": "ES2022"` and `"module": "NodeNext"` are set in the tsc flags above (they enable top-level await).

- [ ] **Step 3: Prettier check**

Run:

```bash
npx prettier --check 'evals/**/*.ts'
```

Expected: exits 0.

- [ ] **Step 4: Suggested commit**

```bash
git add evals/file-tools.eval.ts
git commit -m "feat(evals): wire file-tools eval entry point"
```

---

## Task 7: Add npm scripts and update `.env.example`

**Files:**

- Modify: `package.json` (add two scripts)
- Modify: `.env.example` (add `LMNR_PROJECT_API_KEY`)

- [ ] **Step 1: Update `package.json` scripts**

In `package.json`, add these two entries inside the existing `"scripts"` block (keep the existing scripts untouched):

```json
"eval": "lmnr eval",
"eval:file-tools": "lmnr eval evals/file-tools.eval.ts"
```

So the scripts block becomes (for reference):

```json
{
  "scripts": {
    "build": "tsc",
    "prestart": "npm run build",
    "start": "node dist/cli.js",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "npm run build && npm run lint && npm run format:check",
    "eval": "lmnr eval",
    "eval:file-tools": "lmnr eval evals/file-tools.eval.ts"
  }
}
```

- [ ] **Step 2: Update `.env.example`**

Replace the contents of `.env.example` with:

```env
OPENAI_API_KEY=your-openai-api-key
LMNR_PROJECT_API_KEY=your-laminar-project-api-key
```

- [ ] **Step 3: Verify the `lmnr` binary resolves**

Run:

```bash
npx lmnr --help
```

Expected: prints the Laminar CLI help, including an `eval` subcommand. If the binary is not found, run `npm install` and retry.

- [ ] **Step 4: Verify existing `npm run check` still passes**

Run:

```bash
npm run check
```

Expected: `tsc` builds `src/` cleanly, `eslint src` has no errors, and prettier reports no style issues. (The `evals/` tree is outside the `tsconfig.json` `include`, so it will not be compiled by `npm run check`; that is intentional per the spec.)

- [ ] **Step 5: Prettier check on the modified root files**

Run:

```bash
npx prettier --check package.json .env.example
```

Expected: exits 0.

- [ ] **Step 6: Suggested commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore(evals): add npm scripts and document LMNR_PROJECT_API_KEY"
```

---

## Task 8: End-to-end smoke verification

This task is a live eval run, not a code change. It validates the spec's §10 acceptance checklist.

**Files:** none modified.

- [ ] **Step 1: Confirm required env vars are set**

Run:

```bash
node -e "require('dotenv').config(); console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY); console.log('LMNR_PROJECT_API_KEY set:', !!process.env.LMNR_PROJECT_API_KEY);"
```

Expected: both print `true`. If either is `false`, populate `.env` from `.env.example` before continuing.

- [ ] **Step 2: Run the eval**

Run:

```bash
npm run eval:file-tools
```

Expected:

- The CLI reports "9 datapoints" (matching the length of `evals/data/file.tools.json`).
- Progress bar completes without thrown exceptions.
- A Laminar dashboard URL is printed, along with an average `correctness` score between `0` and `1`.

If the run fails with a provider error mentioning `gpt-5-mini`, retry once — transient OpenAI 429/5xx responses are not an eval-code bug. If it fails with "tool not found" or "invalid tool schema", re-read Task 3 and fix the zod schema.

- [ ] **Step 3: Confirm acceptance checklist**

Open the spec `docs/features/specs/2026-04-21-laminar-file-tools-eval-design.md` and confirm each box in §10:

- [ ] Running `npm run eval:file-tools` with env vars set executes all 9 datapoints against `gpt-5-mini` and reports to Laminar.
- [ ] Every file listed in §4.1 of the spec exists with the responsibilities described in §5.
- [ ] `correctness` implements the §5.4 truth table (hand-verified in Task 4 Step 3).
- [ ] `npm run check` passes with the new files present (verified in Task 7 Step 4).
- [ ] No changes were made to `src/agent/run.ts` or other runtime source (`git diff --stat src/` should be empty).

- [ ] **Step 4: Final suggested commit (only if any lint/format fix-ups were made)**

If Task 8 surfaced any prettier/eslint fix-ups, stage and commit them:

```bash
git status
git add -A
git commit -m "chore(evals): cleanup after smoke verification"
```

Otherwise skip this step — the feature branch is complete.

---

## Self-Review Notes

This plan was checked against the spec on 2026-04-21. Coverage:

| Spec section                                                       | Task(s) |
| ------------------------------------------------------------------ | ------- |
| §3 Dataset contract (loading, categories)                          | 2, 4    |
| §4.1 File layout                                                   | 1–6     |
| §4.2 SOLID rationale (DIP via injected `model`)                    | 5, 6    |
| §5.1 `types.ts`                                                    | 1       |
| §5.2 `mocks/tools.ts` (`ALL_FILE_TOOLS`, `pickTools`)              | 3       |
| §5.3 Executor (`generateText`, `stepCountIs(1)`, no system prompt) | 5       |
| §5.4 `correctness` truth table                                     | 4       |
| §5.5 `utils.ts` (`loadDatapoints`, `setEqual`)                     | 2       |
| §5.6 `file-tools.eval.ts` composition                              | 6       |
| §6 npm scripts                                                     | 7       |
| §7 env vars                                                        | 7, 8    |
| §10 Acceptance checklist                                           | 8       |

No placeholders remain; all types, method signatures, and property names match between tasks (`toolsCalled`, `expectedTools`, `forbiddenTools`, `pickTools`, `createFileToolExecutor`, `correctness` are used consistently).
