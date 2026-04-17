# yules-cli: Interactive terminal chat agent (AI SDK + OpenAI)

## Context

The `yules-ai` repository is an ESM TypeScript Node project: `tsc` compiles `src/` to `dist/`, with ESLint and Prettier already configured. This spec adds a **globally installable CLI** (`yules-cli`) that runs an **interactive, streaming chat** in the terminal using the Vercel [AI SDK](https://ai-sdk.dev/docs/introduction) and the **OpenAI** provider.

## Goals

1. **Interactive terminal chat:** Read user input in a loop (readline), **stream** assistant tokens to stdout as they arrive, and keep **in-memory multi-turn** `user` / `assistant` history for the current process.
2. **Model and system prompt:** Use `openai('gpt-5-mini')`. System behavior is defined by a single exported **`SYSTEM_PROMPT`** constant (exact user-provided text; see below).
3. **Secrets:** Require **`OPENAI_API_KEY`**. Document placeholders in **`.env.example`**. Load **`.env` from `process.cwd()`** when the CLI starts (per-directory configuration after global install).
4. **Packaging:** `npm run build` then `npm i -g .` (or `npm link`); the binary name is **`yules-cli`**.

## Non-goals

- Persisting chat history to disk or resuming sessions.
- Tools, subagents, or MCP (beyond a plain text chat loop).
- Automated tests in this slice (manual verification only).
- Slash commands or keywords such as `/quit` or `exit` (users rely on Ctrl+C / Ctrl+D).
- Non-streaming (batch) reply mode.

## System prompt (authoritative text)

The following must be the full content of `SYSTEM_PROMPT` in `src/agent/system/prompt.ts` (exported as a template literal / string constant):

```text
You are a helpful AI assistant. You provide clear, accurate, and concise responses to user questions.

Guidelines:
- Be direct and helpful
- If you don't know something, say so honestly
- Provide explanations when they add value
- Stay focused on the user's actual question
```

## Architecture

- **Dependencies:** `ai`, `@ai-sdk/openai`, `dotenv` (load `.env` from current working directory at process start).
- **OpenAI:** Use `@ai-sdk/openai` to construct the model (e.g. `openai('gpt-5-mini')`).
- **Streaming:** Use AI SDK **`streamText`** (or equivalent documented streaming API) with `system: SYSTEM_PROMPT` and the rolling `messages` array; write incremental text to **stdout**.
- **Entry vs agent:**
  - **`src/cli.ts`:** Shebang `#!/usr/bin/env node`, `dotenv.config()` for `cwd`, validate `OPENAI_API_KEY`, then invoke the agent runner. This is the **`bin`** target for the published CLI.
  - **`src/agent/run.ts`:** Agent runner — readline loop, append user messages, call `streamText`, stream to terminal, append full assistant text to history on success.
  - **`src/agent/system/prompt.ts`:** Export `SYSTEM_PROMPT`; optional future system strings may live alongside it.

## Data flow

1. On startup (in `cli.ts` after dotenv): if `OPENAI_API_KEY` is missing or empty, print a short message to **stderr** explaining that the CLI loads `.env` from the current directory and exit with a **non-zero** exit code.
2. Initialize an empty **messages** array (core chat roles: `user` / `assistant` only in history; `system` is not stored in this array).
3. Each line of user input: trim; if empty, show the prompt again without calling the model.
4. Append `{ role: 'user', content: line }` to `messages`.
5. Call `streamText` with `model`, `system: SYSTEM_PROMPT`, and `messages`.
6. Stream assistant output to stdout; accumulate the full assistant string during the stream.
7. On **success**, append `{ role: 'assistant', content: fullText }` to `messages`. Ensure the terminal prints a clear line break before the next prompt if the streamed text does not end with a newline.
8. On **failure** (API or stream error): print error to **stderr**, **do not** append a partial assistant message, then show the input prompt again.

## Error handling and signals

- **Missing key:** Fail fast before the REPL (see Data flow).
- **Stream/API errors:** stderr + continue REPL without corrupting history.
- **Ctrl+C / Ctrl+D:** End the session with exit code **0**.

## Files and responsibilities

| Path                         | Responsibility                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli.ts`                 | Binary entry: shebang, dotenv from `cwd`, env validation, call agent runner.                                                                                               |
| `src/agent/run.ts`           | Interactive loop and `streamText` integration.                                                                                                                             |
| `src/agent/system/prompt.ts` | `SYSTEM_PROMPT` and future prompt constants.                                                                                                                               |
| `package.json`               | `dependencies` for `ai`, `@ai-sdk/openai`, `dotenv`; `"bin": { "yules-cli": "dist/cli.js" }` (exact path must match compiled output).                                      |
| `.env.example`               | `OPENAI_API_KEY=` placeholder (e.g. `your-api-key-here`).                                                                                                                  |
| `.gitignore`                 | Must allow **committing** `.env.example` while keeping `.env` ignored. If the pattern `.env.*` currently ignores `.env.example`, add an exception such as `!.env.example`. |

## npm scripts (existing + usage)

- **`build`:** `tsc` — must emit `dist/cli.js` with a valid shebang preserved if TypeScript preserves it, or document the build step that injects it (implementation detail).
- **Install:** `npm run build`, then `npm i -g .` — `yules-cli` on `PATH`.

## Verification

1. `npm run build` succeeds.
2. From a directory containing a valid `.env` with `OPENAI_API_KEY`, running `yules-cli` starts the REPL, streams replies, and maintains context across turns within one process.
3. Running from a directory **without** a usable key fails before the REPL with a clear message.

## Notes

- **Global install + cwd `.env`:** Developers run `yules-cli` from a project folder that contains their `.env`; no requirement to put secrets beside the installed package.
- **Model ID:** `gpt-5-mini` is specified as the OpenAI model identifier; if the provider renames or gates this ID, update the implementation in one place (the agent runner / model construction).
