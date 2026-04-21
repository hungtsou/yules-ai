# File-tools eval with Laminar — design

Status: Approved (brainstorming). Ready for implementation plan.

## 1. Goal

Measure, with a reproducible single-turn evaluation, how often the agent's
underlying LLM picks the correct file tool(s) for a given natural-language
prompt. Results are reported to [Laminar](https://laminar.sh) via the `lmnr
eval` CLI so scores can be tracked over time and across model changes.

The eval is scoped to this repo's file-tool surface (`readFile`, `writeFile`,
`listFiles`, `deleteFile`) and is driven entirely by the dataset at
`evals/data/file.tools.json`.

## 2. Non-goals

- Multi-turn or agentic evaluation (no tool results fed back to the model).
- A custom dataset uploader or `LaminarDataset` integration — datapoints are
  loaded from a local JSON file.
- Running the real file-system tools. Tools used in the eval are no-op mocks.
- CI wiring, historical score snapshots, or any custom report UI — the Laminar
  dashboard is the report.
- Any change to `src/agent/run.ts` or the runtime CLI.

## 3. Dataset contract

The existing dataset (`evals/data/file.tools.json`) is an array of Laminar
datapoints. Each entry has:

```jsonc
{
  "data": {
    "prompt": "Read the contents of package.json",
    "tools": ["readFile", "writeFile", "listFiles", "deleteFile"],
  },
  "target": {
    "expectedTools": ["readFile"], // present for golden & secondary
    "forbiddenTools": ["readFile", "writeFile", "listFiles", "deleteFile"], // present for negative
    "category": "golden", // "golden" | "secondary" | "negative"
  },
  "metadata": { "description": "..." },
}
```

Categories:

| Category    | Meaning                                                 | Scoring rule                                   |
| ----------- | ------------------------------------------------------- | ---------------------------------------------- |
| `golden`    | Prompt has one correct tool-selection answer            | Exact set-equality of called vs expected tools |
| `secondary` | Prompt is ambiguous; multiple answers may be reasonable | Always scored `1` (not penalized)              |
| `negative`  | Prompt should not trigger any file tool                 | `1` iff no forbidden tool was called           |

`data.tools` is the subset of tool names available to the model for that
datapoint. The executor must respect this subset even though every current
datapoint lists all four tools.

## 4. Architecture

### 4.1 File layout

All eval code lives at the repo root under `evals/`, alongside the existing
dataset:

```text
evals/
  data/
    file.tools.json          # (existing) datapoints
  mocks/
    tools.ts                 # mock AI SDK tools registry (no-op, zod schemas)
  types.ts                   # Input, Output, Target, Category, Datapoint
  utils.ts                   # loadDatapoints(), setEqual()
  executors.ts               # createFileToolExecutor({ model }) → executor fn
  evaluators.ts              # correctness evaluator (category-aware)
  file-tools.eval.ts         # entry: loads data, calls evaluate({...})
```

### 4.2 SOLID rationale

- **Single responsibility.** Each file has exactly one concern — data shape
  (`types.ts`), mocks (`mocks/tools.ts`), execution (`executors.ts`), scoring
  (`evaluators.ts`), orchestration (`file-tools.eval.ts`). Utilities that have
  no side effects and are reused across files live in `utils.ts`.
- **Open/closed.** Adding a new evaluator or a new tool is additive — drop a
  function in `evaluators.ts` or a mock in `mocks/tools.ts`. No existing module
  is modified.
- **Dependency inversion.** `createFileToolExecutor` depends on the AI SDK's
  `LanguageModel` abstraction, not on a concrete provider. The concrete
  `openai('gpt-5-mini')` instance is injected by `file-tools.eval.ts`, so
  swapping models (or providers) at the call site does not require editing the
  executor.

## 5. Module specifications

### 5.1 `evals/types.ts`

Pure type declarations, no runtime code. Mirrors the dataset schema 1:1.

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

### 5.2 `evals/mocks/tools.ts`

Builds the full mock tool registry and exposes a filter:

- `ALL_FILE_TOOLS: Record<string, Tool>` — one entry per supported tool
  (`readFile`, `writeFile`, `listFiles`, `deleteFile`). Each uses the AI SDK
  v6 `tool({ description, inputSchema, execute })` helper with a zod schema
  for `inputSchema`. Every `execute` is a no-op returning `''` — the executor
  caps at one step, so `execute` is never actually invoked, but the value is
  provided for type completeness.
- `pickTools(names: string[]): Record<string, Tool>` — returns a new object
  containing only the entries whose key is in `names`. Unknown names in the
  input list are silently dropped.
- Tool descriptions are plain, unambiguous, and mirror the obvious semantics
  ("Read the contents of a file at the given path", etc.). They must not
  encode prompt-level hints that would trivialize the eval.

This is the only module that contains concrete tool definitions.

### 5.3 `evals/executors.ts`

Exports one factory:

```typescript
export function createFileToolExecutor({
  model,
}: {
  model: LanguageModel;
}): (input: Input) => Promise<Output>;
```

Implementation:

1. Call `generateText({ model, prompt: input.prompt, tools: pickTools(input.tools), stopWhen: stepCountIs(1) })`.
2. Return `{ toolsCalled: uniqueStrings(result.toolCalls.map(c => c.toolName)) }`.

Notes:

- No system prompt. The eval intentionally isolates the signal to tool
  descriptions plus the user's prompt, so that results are not coupled to
  unrelated changes in the app's `SYSTEM_PROMPT`.
- Single turn. `stopWhen: stepCountIs(1)` prevents a second round-trip and
  guarantees the mock `execute` is never invoked.
- If the model emits no tool calls, `toolsCalled` is `[]` — a valid
  observation that is the correct answer for every `negative` datapoint.
- Tool-name deduplication (`uniqueStrings`) makes set-equality the right
  primitive for scoring: the model is not penalized for duplicate calls.

### 5.4 `evals/evaluators.ts`

Exports one evaluator:

```typescript
export function correctness(output: Output, target: Target): number;
```

Behavior:

| `target.category` | Return                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `'golden'`        | `1` iff `setEqual(output.toolsCalled, target.expectedTools ?? [])`, else `0`      |
| `'secondary'`     | `1` (always)                                                                      |
| `'negative'`      | `1` iff `output.toolsCalled` contains no element of `target.forbiddenTools ?? []` |

No additional evaluators are defined — this is the single headline metric.

### 5.5 `evals/utils.ts`

Two exported helpers:

- `loadDatapoints(path: string): Datapoint[]` — reads the JSON file
  synchronously via `fs.readFileSync`, parses it, and returns it cast to
  `Datapoint[]`. No validation beyond `JSON.parse`; if the dataset is malformed
  the runner fails fast with a parse error.
- `setEqual(a: string[], b: string[]): boolean` — compares two string arrays
  as sets (order-independent, duplicates ignored). Used by `correctness`.

### 5.6 `evals/file-tools.eval.ts`

Orchestrator. Composes the other modules and hands off to Laminar:

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

The `lmnr eval` CLI wraps this file, so no explicit `Laminar.initialize(...)`
call is made here — the runner handles initialization and tracing.

## 6. Running the eval

Add two npm scripts to `package.json`:

```json
{
  "scripts": {
    "eval": "lmnr eval",
    "eval:file-tools": "lmnr eval evals/file-tools.eval.ts"
  }
}
```

Usage:

- `npm run eval:file-tools` — run the file-tools eval specifically.
- `npm run eval -- <path>` — run any eval file via the shared entry.

The `lmnr` binary ships with `@lmnr-ai/lmnr` (already in `dependencies`) and
is resolved from `node_modules/.bin/`. It uses its own esbuild-based loader,
so no additional `tsx` / `ts-node` devDependency is required.

## 7. Environment & secrets

Required variables in the user's `.env` (loaded from the cwd by `dotenv/config`):

| Variable               | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `OPENAI_API_KEY`       | Calls to `openai('gpt-5-mini')` in executor |
| `LMNR_PROJECT_API_KEY` | Reporting eval results to Laminar dashboard |

`.env.example` should list both keys so contributors know what to set.

## 8. Implementation constraints

- ESM (`"type": "module"`) TypeScript. Relative imports inside `evals/` use
  `.js` extensions, matching the repo's existing convention under `src/`.
- No modification of `tsconfig.json`. The `lmnr` CLI does not rely on the
  project's `tsc` pipeline — it bundles eval files itself.
- Prettier / ESLint: eval files follow the repo's existing config. No new lint
  rules are introduced.

## 9. Risks & open questions

- **Model non-determinism.** `gpt-5-mini` may return different tool choices
  across runs for ambiguous prompts. This is mitigated by marking such prompts
  as `secondary` in the dataset, but some score variance is expected on
  `golden`/`negative` too. Acceptable for a v1 eval.
- **Tool-description sensitivity.** Because no system prompt is used, tool
  descriptions are the main lever for performance. If descriptions change in
  `mocks/tools.ts`, scores shift. This is by design but should be noted when
  interpreting trends.
- **Dataset validation.** No runtime schema check — a typo in the JSON
  (e.g. misspelled category) will surface as an evaluator returning `0`
  rather than a loud error. If this becomes a problem, add a zod schema in
  `utils.ts`. Not included in v1 to avoid over-engineering.

## 10. Acceptance checklist

- [ ] Running `npm run eval:file-tools` with the two env vars set executes all
      9 datapoints against `gpt-5-mini` and reports to Laminar.
- [ ] Each of the files listed in §4.1 exists and adheres to its
      single-responsibility contract described in §5.
- [ ] The `correctness` evaluator implements the truth table in §5.4.
- [ ] `npm run check` (build + lint + format:check) passes with the new files
      present.
- [ ] No changes were made to `src/agent/run.ts` or other runtime source.
