# Agent file tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `src/agent/tools/` module that exports four AI SDK v6 `Tool` objects — `readFile`, `writeFile`, `deleteFile`, `listFiles` — each a thin wrapper over `node:fs/promises`, so future features can pass them to `streamText`.

**Architecture:** Two files: `file.ts` defines all four tools as top-level named exports using `tool({ description, inputSchema, execute })` from `ai` with `zod` input schemas. `index.ts` is a one-line barrel re-export. No sandboxing, no error wrapping — `fs` errors bubble up and the AI SDK converts them into tool-error parts for the model.

**Tech Stack:**

- TypeScript (ESM, NodeNext, strict) per the existing `tsconfig.json`.
- Vercel AI SDK v6 — `tool` from `ai`.
- `zod` (already a devDependency) — input schemas.
- `node:fs/promises` — real fs calls in each `execute`.
- No test framework in the repo. Per-task verification uses `npm run check` (build + lint + prettier) plus a one-off smoke script that exercises all four tools against a temp directory.

**Reference spec:** [`docs/features/specs/2026-04-21-agent-file-tools-design.md`](../specs/2026-04-21-agent-file-tools-design.md)

**Conventions (repo-wide):**

- Single quotes, semicolons (`.prettierrc.json`).
- ESM relative imports end in `.js` even when the source is `.ts`.
- Do **not** auto-run `git commit` — every "Commit" step in this plan is a **suggested** command for the user to run when they choose to (`.cursor/rules/git-commits-no-auto-commit.mdc`).

---

## File Structure

| Path                            | Purpose                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `src/agent/tools/file.ts`       | Four named `Tool` exports (`readFile`, `writeFile`, `deleteFile`, `listFiles`)         |
| `src/agent/tools/index.ts`      | Barrel: `export * from './file.js';`                                                   |
| `scripts/smoke-file-tools.mjs`  | Ad-hoc smoke script: round-trips all four tools against a temp directory               |

No changes to `src/agent/run.ts`, `src/cli.ts`, `src/ui/**`, `evals/mocks/tools.ts`, `package.json`, or `tsconfig.json`.

---

## Task 1: Create `src/agent/tools/file.ts`

**Files:**

- Create: `src/agent/tools/file.ts`

- [ ] **Step 1: Create the `src/agent/tools/` directory**

Run:

```bash
mkdir -p src/agent/tools
```

Expected: exits 0, no output.

- [ ] **Step 2: Write `src/agent/tools/file.ts`**

Write exactly this content:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  unlink as fsUnlink,
  readdir as fsReaddir,
} from 'node:fs/promises';

export const readFile = tool({
  description: 'Read the contents of a file at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Absolute or relative path to the file.'),
  }),
  execute: async ({ path }) => {
    return await fsReadFile(path, 'utf8');
  },
});

export const writeFile = tool({
  description: 'Create or overwrite a file with the given contents.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to write.'),
    content: z.string().describe('Content to write to the file.'),
  }),
  execute: async ({ path, content }) => {
    await fsWriteFile(path, content, 'utf8');
  },
});

export const deleteFile = tool({
  description: 'Delete the file at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to delete.'),
  }),
  execute: async ({ path }) => {
    await fsUnlink(path);
  },
});

export const listFiles = tool({
  description: 'List files and directories at the given path.',
  inputSchema: z.object({
    path: z
      .string()
      .describe('Directory path whose entries should be listed.'),
  }),
  execute: async ({ path }) => {
    return await fsReaddir(path);
  },
});
```

Notes for the implementer:

- `fs.promises` functions are aliased (`fsReadFile`, `fsWriteFile`, …) because the tool constants are also named `readFile`, `writeFile`, etc. Without the alias the `import` would shadow the exports.
- No `try`/`catch` anywhere. `fs` errors propagate — this is intentional (spec §5).
- `writeFile`'s `execute` returns `void` implicitly. `deleteFile` the same. `readFile` and `listFiles` return their fs result directly. Types are inferred by `tool()`.
- No imports from `evals/` or any other part of the repo. This module has zero internal dependencies.

- [ ] **Step 3: Prettier check on the new file**

Run:

```bash
npx prettier --check src/agent/tools/file.ts
```

Expected: exits 0. If it reports style issues, run `npx prettier --write src/agent/tools/file.ts` and re-check.

- [ ] **Step 4: TypeScript build check for the whole project**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0 with no output. A new file appears at `dist/agent/tools/file.js` plus its `.d.ts` and `.js.map` siblings.

- [ ] **Step 5: Suggested commit (await user approval)**

```bash
git add src/agent/tools/file.ts
git commit -m "feat(agent): add file-tools module with four fs-backed Tool exports"
```

---

## Task 2: Create `src/agent/tools/index.ts`

**Files:**

- Create: `src/agent/tools/index.ts`

- [ ] **Step 1: Write `src/agent/tools/index.ts`**

Write exactly this content (one line of code plus the trailing newline):

```typescript
export * from './file.js';
```

Notes for the implementer:

- The `.js` extension is required for NodeNext module resolution even though the source is `.ts` — this matches the convention used throughout `src/`.
- No default export, no re-named re-exports, no registry object. Per spec §6 this file is exactly one statement.

- [ ] **Step 2: Prettier check**

Run:

```bash
npx prettier --check src/agent/tools/index.ts
```

Expected: exits 0.

- [ ] **Step 3: Verify re-export surface via a throwaway node command**

Build first (if Task 1 Step 4's output has been removed since):

```bash
npm run build
```

Then, from the repo root, run:

```bash
node -e "const m = await import('./dist/agent/tools/index.js'); console.log(Object.keys(m).sort().join(','))" --input-type=module
```

Expected output: `deleteFile,listFiles,readFile,writeFile`

If the output is missing any name, Task 1's `file.ts` is missing that export or `index.ts`'s `export *` is malformed — fix and re-run.

- [ ] **Step 4: Suggested commit (await user approval)**

```bash
git add src/agent/tools/index.ts
git commit -m "feat(agent): barrel-export file tools via src/agent/tools/index.ts"
```

---

## Task 3: Verify the module is clean under `npm run check`

No files are modified in this task — it is pure verification that Tasks 1 and 2 integrate with the existing build/lint/format pipeline.

- [ ] **Step 1: Run the full check**

Run:

```bash
npm run check
```

Expected:

- `tsc` builds `src/` cleanly (`dist/agent/tools/file.js` and `dist/agent/tools/index.js` are present).
- `eslint src` reports zero errors. (The new files are under `src/`, so they are linted by the existing config.)
- `prettier --check .` reports no style issues.
- Exit code 0 overall.

- [ ] **Step 2: If ESLint reports a `@typescript-eslint/no-shadow` or similar on the aliased fs imports, resolve inline**

The repo uses `tseslint.configs.recommendedTypeChecked`. If a type-checked rule fires on the aliased fs imports (unlikely but possible), the fix is to rename the aliases — e.g. `fsReadFile` → `readFileFs`. Apply the rename consistently in all four `execute` bodies and re-run `npm run check`.

No other eslint issues are expected. If a different rule fires, read the diagnostic and fix the offending line; do not disable the rule project-wide.

- [ ] **Step 3: No commit needed**

This task only verifies. If Step 2 forced any rename, stage the edit alongside Task 4's changes.

---

## Task 4: Create `scripts/smoke-file-tools.mjs`

This task creates a one-off verification script that exercises each tool's `execute` directly against a temporary directory. The AI SDK v6 `Tool.execute` signature is `(input, options) => …` where `options: { toolCallId, messages, ... }` — we pass minimal stub options (`toolCallId: 'smoke'`, `messages: []`).

**Files:**

- Create: `scripts/smoke-file-tools.mjs`

- [ ] **Step 1: Ensure the `scripts/` directory exists**

Run:

```bash
mkdir -p scripts
```

Expected: exits 0, no output.

- [ ] **Step 2: Write `scripts/smoke-file-tools.mjs`**

Write exactly this content:

```javascript
import { mkdtemp, rm, readFile as fsReadFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readFile,
  writeFile,
  deleteFile,
  listFiles,
} from '../dist/agent/tools/index.js';

const opts = { toolCallId: 'smoke', messages: [] };

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const root = await mkdtemp(join(tmpdir(), 'yules-file-tools-'));
const filePath = join(root, 'hello.txt');
const missingPath = join(root, 'does-not-exist.txt');

try {
  await writeFile.execute({ path: filePath, content: 'hello world' }, opts);
  const onDisk = await fsReadFile(filePath, 'utf8');
  assert(onDisk === 'hello world', `writeFile content mismatch: ${onDisk}`);

  const read = await readFile.execute({ path: filePath }, opts);
  assert(read === 'hello world', `readFile returned ${JSON.stringify(read)}`);

  const entries = await listFiles.execute({ path: root }, opts);
  assert(
    Array.isArray(entries) && entries.includes('hello.txt'),
    `listFiles returned ${JSON.stringify(entries)}`,
  );

  await deleteFile.execute({ path: filePath }, opts);
  const afterDelete = await listFiles.execute({ path: root }, opts);
  assert(
    Array.isArray(afterDelete) && !afterDelete.includes('hello.txt'),
    `deleteFile left file behind: ${JSON.stringify(afterDelete)}`,
  );

  let threw = false;
  try {
    await readFile.execute({ path: missingPath }, opts);
  } catch (err) {
    threw = true;
    assert(
      typeof err === 'object' && err !== null && 'code' in err,
      `expected error object with code, got ${String(err)}`,
    );
  }
  assert(threw, 'readFile on missing path did not throw');

  console.log('OK: all four file tools round-trip against', root);
} finally {
  await rm(root, { recursive: true, force: true });
}
```

Notes for the implementer:

- The script is `.mjs` (plain JS ESM) — it imports the compiled output from `dist/`, so there is no TypeScript toolchain dependency at runtime. That keeps the verification independent of `tsx`/`ts-node`.
- `mkdtemp` gives a unique temp dir per run, so concurrent runs do not clash.
- The `finally` block removes the temp dir even on failure, so repeated runs do not leak temp files.
- The final assertion (readFile on a missing path) confirms that `fs` errors bubble up as expected (spec §5) and that `err.code` is populated — a weak but cheap check that the thrown object is a real `SystemError`, not something the tool wrapped.
- The script explicitly does **not** test `writeFile` into a missing parent directory or `deleteFile` on a directory; those behaviors are covered by the spec's acceptance criteria and are trivially provable from the implementation. Adding them would add failure modes without signal.

- [ ] **Step 3: Prettier check on the smoke script**

Run:

```bash
npx prettier --check scripts/smoke-file-tools.mjs
```

Expected: exits 0.

- [ ] **Step 4: Suggested commit (await user approval)**

```bash
git add scripts/smoke-file-tools.mjs
git commit -m "chore(agent): add smoke script for file tools"
```

---

## Task 5: Run the smoke script end-to-end

This task is a live invocation, not a code change. It validates the spec's acceptance checklist items that say "each execute delegates to `node:fs/promises`" and "a smoke script round-trips the four tools against a temporary directory without error".

**Files:** none modified.

- [ ] **Step 1: Make sure `dist/` is fresh**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0. (If you already ran `npm run check` in Task 3, this is redundant but cheap.)

- [ ] **Step 2: Run the smoke script**

Run:

```bash
node scripts/smoke-file-tools.mjs
```

Expected output (the exact temp dir path will vary):

```text
OK: all four file tools round-trip against /tmp/yules-file-tools-XXXXXX
```

The script exits 0. If any assertion fails, the script prints `FAIL: <reason>` and exits 1 — read the reason, fix the offending tool in `src/agent/tools/file.ts`, rebuild, and re-run.

- [ ] **Step 3: Walk through the spec's acceptance checklist**

Open `docs/features/specs/2026-04-21-agent-file-tools-design.md` and confirm each box in §10:

- `src/agent/tools/file.ts` exports `readFile`, `writeFile`, `deleteFile`, `listFiles` — verified by Task 2 Step 3's node import check.
- `src/agent/tools/index.ts` contains exactly one `export * from './file.js';` statement — verifiable by reading the file.
- Tool descriptions match the strings listed in spec §4 verbatim — Task 1 Step 2's code block is a verbatim copy of spec §4.
- Each `execute` delegates to `node:fs/promises` with `async`/`await`, does not catch errors, and returns the happy-path shape — verified by the smoke script in Task 5 Step 2.
- `npm run check` passes — verified in Task 3 Step 1.
- A smoke script round-trips the four tools against a temporary directory without error — Task 5 Step 2.
- No changes under `src/agent/run.ts`, `src/cli.ts`, `src/ui/`, or `evals/mocks/tools.ts` — confirm with:

  ```bash
  git diff --stat src/agent/run.ts src/cli.ts src/ui evals/mocks/tools.ts
  ```

  Expected: empty output.

- [ ] **Step 4: Final suggested commit (only if any incidental fix-ups were made)**

If Tasks 3–5 surfaced any prettier/eslint fix-ups not already committed, stage and commit them:

```bash
git status
git add -A
git commit -m "chore(agent): cleanup after file-tools smoke verification"
```

Otherwise skip this step — the feature is complete.

---

## Self-Review Notes

Plan checked against the spec on 2026-04-21.

### Spec coverage

| Spec section                                       | Task(s) |
| -------------------------------------------------- | ------- |
| §1 Goal — four AI SDK Tools under `src/agent/tools/` | 1, 2    |
| §2 Scope & non-goals (no runtime wiring)            | (respected across all tasks; verified in Task 5 Step 3) |
| §3 File layout (`file.ts` + one-line `index.ts`)    | 1, 2    |
| §4 Module contracts (descriptions, schemas, fs calls, return shapes) | 1 |
| §4 Zod `.describe(...)` strings table               | 1       |
| §5 Error handling (no try/catch, fs errors bubble)  | 1 (code), 4/5 (verified by smoke script's missing-path case) |
| §6 Export shape (named exports + `export * from './file.js'`) | 1, 2 |
| §7 Accepted risks                                   | noted in spec; no implementation work required |
| §8 SOLID notes                                      | noted in spec; no implementation work required |
| §9 Implementation constraints (ESM, `.js` extensions, strict tsc) | 1, 2, 3 |
| §10 Acceptance checklist                            | 3, 5    |

### Placeholder scan

No "TBD", "TODO", "implement later", or vague guidance remains. Every code step contains the exact content to write. Every verification step names an exact command and expected output.

### Type consistency

- Tool names (`readFile`, `writeFile`, `deleteFile`, `listFiles`) are used identically in Tasks 1, 2, 4, and the acceptance checklist.
- Input-field names (`path`, `content`) in Task 1's zod schemas match the smoke script's destructuring in Task 4.
- The import path `'../dist/agent/tools/index.js'` in the smoke script matches the output directory of `tsconfig.json` (`"outDir": "dist"`) applied to the source path `src/agent/tools/index.ts`.
- The `execute` options stub `{ toolCallId: 'smoke', messages: [] }` matches the minimum required fields of `ToolExecutionOptions` from `@ai-sdk/provider-utils` (`toolCallId: string` and `messages: ModelMessage[]`, others optional).

No issues identified.
