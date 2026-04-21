# Agent file tools — design

Status: Approved (brainstorming). Ready for implementation plan.

## 1. Goal

Add four file-system tools — `readFile`, `writeFile`, `deleteFile`,
`listFiles` — as AI SDK v6 `Tool` objects under `src/agent/tools/`, so future
features can wire them into `streamText`. This is the first real (non-mock)
tool surface in the repo and the backing implementation for the eval already
specified in
[`2026-04-21-laminar-file-tools-eval-design.md`](./2026-04-21-laminar-file-tools-eval-design.md).

## 2. Scope & non-goals

**In scope**

- A new module `src/agent/tools/` with two files: `file.ts` (tool definitions)
  and `index.ts` (barrel re-export).
- Four named exports (`readFile`, `writeFile`, `deleteFile`, `listFiles`),
  each a `Tool` built with `tool(...)` from the `ai` package and a zod input
  schema.
- Tool descriptions that match the mock versions in `evals/mocks/tools.ts`
  verbatim, so the eval and the real tools present an identical surface to the
  model.

**Non-goals**

- No changes to `src/agent/run.ts`, `src/cli.ts`, or any file under `src/ui/`.
  Wiring the tools into `streamText`, handling multi-step tool loops, and
  rendering tool calls in the Ink UI are explicitly deferred to a later
  feature.
- No path sandboxing, path normalization, or policy layer. Paths go straight
  to `fs` (see §5).
- No file-size cap on `readFile`.
- No encoding option on `readFile` (utf-8 only).
- No parent-directory creation on `writeFile`.
- No directory support on `deleteFile` (files only, via `fs.unlink`).
- No recursive mode on `listFiles`; no per-entry metadata.
- No test framework is added; verification uses `tsc --noEmit`, prettier, and
  a small Node smoke script (to be detailed in the implementation plan).
- No modifications to `evals/mocks/tools.ts`. The mocks stay mocks. The real
  tools live separately.

## 3. File layout

```text
src/agent/tools/
  file.ts    # four named exports: readFile, writeFile, deleteFile, listFiles
  index.ts   # `export * from './file.js';` (barrel re-export)
```

No sibling files, no sub-directories. `index.ts` contains exactly one
statement.

## 4. Module contracts

All four tools are built with `tool({ description, inputSchema, execute })`
from `ai`, with `inputSchema` defined by `z.object({ ... })` from `zod`.
`execute` functions are `async` and delegate to `node:fs/promises` with
`await`. Paths are passed **straight through to `fs`**, so Node resolves
relative paths against `process.cwd()` as usual.

Every `path` field uses `z.string().describe('...')` with wording identical to
the mock tools in `evals/mocks/tools.ts`, so model behavior stays consistent
between eval and runtime.

| Tool         | Input schema                            | `execute` body                       | Return      |
| ------------ | --------------------------------------- | ------------------------------------ | ----------- |
| `readFile`   | `{ path: string }`                      | `fs.readFile(path, 'utf8')`          | `string`    |
| `writeFile`  | `{ path: string, content: string }`     | `fs.writeFile(path, content, 'utf8')`| `void`      |
| `deleteFile` | `{ path: string }`                      | `fs.unlink(path)`                    | `void`      |
| `listFiles`  | `{ path: string }`                      | `fs.readdir(path)`                   | `string[]`  |

Tool descriptions (exact strings, copied from the mock registry for parity):

- `readFile` — "Read the contents of a file at the given path."
- `writeFile` — "Create or overwrite a file with the given contents."
- `deleteFile` — "Delete the file at the given path."
- `listFiles` — "List files and directories at the given path."

Zod field `.describe(...)` strings (also copied verbatim from the mocks):

| Tool         | Field     | Describe string                                  |
| ------------ | --------- | ------------------------------------------------ |
| `readFile`   | `path`    | "Absolute or relative path to the file."         |
| `writeFile`  | `path`    | "Path to the file to write."                     |
| `writeFile`  | `content` | "Content to write to the file."                  |
| `deleteFile` | `path`    | "Path to the file to delete."                    |
| `listFiles`  | `path`    | "Directory path whose entries should be listed." |

## 5. Error handling

Tools **do not catch `fs` errors**. Thrown `ENOENT`, `EACCES`, `EISDIR`,
`EPERM`, `ENOTDIR`, etc. bubble up through `execute`, and the AI SDK converts
them into tool-error parts that the model reads on the next turn. Return types
are therefore the happy-path shape only — no `{ ok, error }` wrapper, no
string-encoded error messages.

This also means `writeFile` into a missing directory throws `ENOENT`, and
`deleteFile` on a directory throws `EISDIR` — both are correct behavior and
both are expected to surface to the model as-is.

## 6. Export shape

`file.ts` declares four top-level named exports:

```typescript
export const readFile = tool({ /* ... */ });
export const writeFile = tool({ /* ... */ });
export const deleteFile = tool({ /* ... */ });
export const listFiles = tool({ /* ... */ });
```

`index.ts` contains:

```typescript
export * from './file.js';
```

Consumers later import named tools (`import { readFile } from
'../agent/tools/index.js'`) and compose them into the `tools` object passed to
`streamText` at call sites. No pre-bundled registry object is exported from
this module in v1.

## 7. Accepted risks

- **No path sandboxing.** The model can read, overwrite, or delete any file
  the Node process can touch, including `.env` files and source code. This is
  an explicit choice to keep the module minimal. Users should only run the
  CLI in directories they are willing for the agent to modify. Path
  sandboxing is a future hardening candidate, not a v1 requirement.
- **No file-size cap on `readFile`.** Reading a very large file will consume
  tokens and memory. Accepted; guide the agent via prompt if it becomes an
  issue.
- **`listFiles` is names-only and non-recursive.** The model may need a
  second call to disambiguate files vs directories or to explore subtrees.
  This matches the mock shape used by the eval and keeps the first version
  small.
- **No tests.** The repo has no test framework. The implementation plan will
  include a one-off Node smoke script that exercises the four tools against a
  temporary directory to confirm the wiring.

## 8. SOLID notes

- **Single responsibility.** `file.ts` is the single home of file-tool
  definitions; `index.ts` is the single public entry point. Each tool owns
  exactly one `fs.promises` operation.
- **Open/closed.** Adding a fifth file tool (e.g. `statFile`) is additive —
  append an export to `file.ts`; `index.ts` picks it up via `export *` with
  no edit.
- **Dependency inversion.** Not applied in v1. Factory / dependency-injection
  patterns (`createReadFile(fs)`, etc.) were considered and rejected as
  over-engineering for the minimal profile. If future tests need an
  injectable `fs`, that's a follow-up refactor, not part of this feature.

## 9. Implementation constraints

- ESM (`"type": "module"`), TypeScript (`tsc` → `dist/`), strict mode per the
  existing `tsconfig.json`.
- Relative imports inside `src/agent/tools/` use `.js` extensions even though
  sources are `.ts`, matching the repo's existing convention under `src/`.
- Prettier and ESLint: no new rules. The new files follow the repo's existing
  config, and `npm run check` (build + lint + format:check) must pass with
  them present.
- `zod` is already a devDependency (added in the eval feature). This spec
  does not add new dependencies.

## 10. Acceptance checklist

- [ ] `src/agent/tools/file.ts` exports `readFile`, `writeFile`, `deleteFile`,
      `listFiles`, each a `Tool` built with `tool(...)` from `ai`, with zod
      `inputSchema`s matching §4.
- [ ] `src/agent/tools/index.ts` contains exactly one `export * from './file.js';`
      statement.
- [ ] Tool descriptions match the strings listed in §4 verbatim.
- [ ] Each `execute` delegates to `node:fs/promises` with `async`/`await`,
      does not catch errors, and returns the happy-path shape in the table
      in §4.
- [ ] `npm run check` passes.
- [ ] A smoke script (specified in the implementation plan) round-trips the
      four tools against a temporary directory without error.
- [ ] No changes under `src/agent/run.ts`, `src/cli.ts`, `src/ui/`, or
      `evals/mocks/tools.ts`.
