# Yules — agent context

**Yules** is an AI assistant for **general questions and tasks**, delivered as a **Node.js CLI** (`yules-ai`). This file is the high-level product and stack intent for anyone (including Cursor) implementing or extending the repo.

## Intended capabilities (product goals)

These are **directional goals**. The codebase may not implement all of them yet—verify `package.json` and `src/` before assuming behavior exists.

- **Filesystem:** read, write, update, and delete files where the product allows it.
- **Web search:** search the web when answering or gathering information.
- **Shell:** run shell commands when appropriate to the task (with safety and policy to be defined in feature work).

## Tech stack

| Area | Choice |
|------|--------|
| Runtime | Node.js, **ESM** (`"type": "module"`), TypeScript (`tsc` → `dist/`) |
| AI | [Vercel AI SDK](https://ai-sdk.dev/) (`ai`), **OpenAI** via `@ai-sdk/openai`, streaming chat |
| Config | **`dotenv`** — load **`.env` from the current working directory** (not from the global install path) |
| Secrets | **`OPENAI_API_KEY`** required for API calls |
| Terminal UI (intended) | **React** + **[Ink](https://github.com/vadimdemedes/ink)** (`ink` on npm) for interactive CLI UI |

**Current entry:** `src/cli.ts` loads env and runs the agent; `src/agent/run.ts` drives the session. Today the loop may still be **readline-based** until Ink is integrated.

## Implementation note

**Vision can run ahead of the repo.** For example: multi-turn streaming chat may exist while **tools**, **MCP**, or **Ink** are not wired up yet. Do not document or code against capabilities that are not actually present without adding them.

## Repository map

| Path | Role |
|------|------|
| `src/cli.ts` | CLI entry: shebang, `dotenv`, env checks, invokes the runner |
| `src/agent/run.ts` | Interactive session and `streamText` integration |
| `src/agent/system/prompt.ts` | `SYSTEM_PROMPT` and related system strings |

## Further reading

- [README.md](README.md) — install, `.env`, run, scripts
- [docs/features/specs/](docs/features/specs/) — design specs (e.g. original CLI chat slice and `AGENT.md` design)

## Guidance for implementers

- Match existing **TypeScript**, **ESM**, and **AI SDK** patterns in `src/`.
- Keep API keys in **`.env`** at the cwd where users run the CLI; do not hardcode secrets.
- When adding tools or UI, define behavior in **feature specs** under `docs/features/specs/` and implement deliberately—do not invent tool APIs that are not in the tree.
- This project uses **`AGENT.md`** (not only `AGENTS.md`) as the root intent file; some tools expect `AGENTS.md`—rename or symlink only if you standardize that across the team.
