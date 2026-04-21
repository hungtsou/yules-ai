# AGENT.md: Cursor agent context for yules-ai

## Context

The `yules-ai` repository is an ESM TypeScript Node project with a globally installable CLI (`yules-ai`). This document specifies the **content and purpose** of a root-level **`AGENT.md`** file so Cursor and other agents get consistent, high-level project context when implementing features.

This spec is **vision-first** (see [Goals](#goals)): it describes intended product capabilities and stack direction even when the current codebase has not yet caught up.

## Goals

1. **Single source of intent at repo root:** Add `AGENT.md` at the repository root containing a concise overview of Yules—what it is, what it is meant to do, and how implementation should align.
2. **Vision-first capabilities:** Describe Yules as a **general-purpose AI assistant** for questions and tasks, with **intended** tool support: **filesystem** (create/read/update/delete as appropriate to the product), **web search**, and **shell** execution. These are **product goals**; the implementation may be partial or absent until built.
3. **Tech stack clarity:** Document the **current and intended** stack: Node.js (ESM), TypeScript, Vercel AI SDK and OpenAI provider, `.env` from cwd, and **React with [Ink](https://github.com/vadimdemedes/ink)** for terminal UI. The CLI may still use a **readline-based** loop today; migrating to Ink is **directional** until implemented.
4. **No confusion with runtime reality:** Include a short **implementation note** stating that the repo may lag the vision (e.g. chat-only loop, no tools yet, no Ink yet). Agents should **not** assume APIs or packages exist without checking `package.json` and `src/`.
5. **Pointers, not duplication:** Link to `README.md` and to existing specs under `docs/features/specs/` instead of copying full architecture from those documents.

## Non-goals

- Replacing `README.md` setup and run instructions.
- Replacing detailed feature specs (e.g. the original CLI chat spec); `AGENT.md` summarizes intent only.
- Defining exact tool schemas, safety policies, or Ink component structure (those belong in feature specs or code).

## Proposed `AGENT.md` structure

Sections should appear in roughly this order:

| Section | Purpose |
|--------|---------|
| **What Yules is** | AI assistant for generic questions and tasks; CLI / agent context. |
| **Intended capabilities** | Filesystem operations, web search, shell—framed as **goals**, not “already shipped.” |
| **Tech stack** | Node ESM, TypeScript, AI SDK, OpenAI, dotenv from cwd; **React + Ink** for terminal UI; optional one-line note on current entry (`cli.ts` / `agent/run.ts`) if useful. |
| **Implementation note** | Vision may run ahead of code; verify `package.json` and `src/` before adding features. |
| **Repository map** | Brief pointers: `src/cli.ts`, `src/agent/run.ts`, `src/agent/system/prompt.ts`. |
| **Further reading** | `README.md`, relevant files in `docs/features/specs/`. |
| **Guidance for implementers** | Follow existing patterns; keep secrets in `.env`; do not invent non-existent tool hooks. |

Tone: direct, scannable, under ~120 lines if possible.

## Filename and tooling note

The deliverable filename is **`AGENT.md`** (as requested). Some ecosystems use **`AGENTS.md`**; this project standardizes on **`AGENT.md`** unless the team later adds a symlink or renames for tooling compatibility.

## Consistency with existing specs

The spec [2026-04-17-yules-cli-ai-agent-design.md](./2026-04-17-yules-cli-ai-agent-design.md) described an initial slice **without** tools or MCP. **`AGENT.md` does not invalidate that history**; it describes **where the product is headed**. Future feature specs should reconcile concrete behavior (e.g. when tools or Ink land) without contradicting this intent document.

## Verification (after `AGENT.md` exists)

1. `AGENT.md` exists at repo root and matches the structure above.
2. No false claims that tools or Ink are already implemented unless `package.json` / `src/` reflect them.
3. Links to `README.md` and `docs/features/specs/` resolve.

## Open items

None. Ink package name in prose: **Ink** (`ink` on npm, used with **React**).
