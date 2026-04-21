# yules-ai Ink UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `readline` chat loop with a React + Ink terminal UI, add filesystem/shell/web-search tools, a policy-based tool-approval flow, and context-window usage tracking with conversation compaction — matching the scope of the approved spec in `docs/features/specs/2026-04-20-yules-ink-ui-design.md`.

**Architecture:** UI owns conversational state. `runAgent(userMessage, history, callbacks)` becomes a single-turn pure function that streams tokens and tool events through callbacks; the Ink `<App/>` invokes it per user submit. Six tools live under `src/agent/tools/`; destructive ones (`writeFile`, `deleteFile`, `runCommand`) require per-call approval via `onToolApproval`. Context compaction runs opportunistically before each turn when estimated tokens exceed 80% of the model's context window.

**Tech Stack:** Node.js ESM, TypeScript (`tsc → dist/`), AI SDK `ai` + `@ai-sdk/openai` with `openai('gpt-5-mini')`, React 19, Ink 6, `ink-spinner`, `zod`, `shelljs`, `dotenv`.

---

## Ground rules (read once, apply to every task)

- **No auto-commits.** The repo rule `.cursor/rules/git-commits-no-auto-commit.mdc` forbids agentic commits without explicit user approval for that specific commit. Every task below ends with a "Commit" step — **treat it as a proposal**: stage the files, show the suggested message, and stop for user approval before running `git commit`.
- **Conventional Commits.** Use `type(scope): description` for the subject line. See the repo rule for type list. Keep descriptions imperative, lowercase, no trailing period.
- **Build verification.** After each task, run `npm run check` (`tsc` + ESLint + Prettier). It must pass before proposing a commit.
- **No automated tests in this feature** (non-goal per spec). Verification is manual, consolidated in Task 19.
- **No telemetry** (`@lmnr-ai/lmnr`) — not in our stack.
- **Relative imports** use `.js` extensions for compiled resolution (ESM + NodeNext). New `.tsx` files import each other with `.js` extensions too (e.g. `import { Spinner } from './Spinner.js'`).
- If any step's expected output differs from what you see, **stop and report** — don't paper over it.

---

## Task 1: Add React/Ink dependencies and enable JSX

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Add runtime and type dependencies**

Run from repo root:

```bash
npm install react@^19 ink@^6 ink-spinner@^5 zod@^4 shelljs@^0.10
npm install --save-dev @types/react@^19 @types/shelljs@^0.8
```

Expected: `package.json` gains the six entries above; `package-lock.json` updates; no install errors.

- [ ] **Step 2: Confirm `@ai-sdk/openai` supports provider web search**

```bash
node -e "const o = require('@ai-sdk/openai'); console.log(typeof o.openai?.tools?.webSearch)"
```

Expected output: `function`.

If output is `undefined`, bump the dep:

```bash
npm install @ai-sdk/openai@latest
```

Re-run the probe; it must now print `function`.

- [ ] **Step 3: Enable JSX in `tsconfig.json`**

Open `tsconfig.json` and add the `jsx` option inside `compilerOptions`. The final file should match:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Only add `jsx: "react-jsx"` and ensure `include` covers `.tsx`. Keep existing values for other options if they differ from the above — do NOT rewrite unrelated settings.

- [ ] **Step 4: Verify build still works**

```bash
npm run check
```

Expected: `tsc`, ESLint, and Prettier all exit 0. There are no `.tsx` files yet, so this only proves the config is still valid.

- [ ] **Step 5: Propose commit (wait for user approval)**

```bash
git add package.json package-lock.json tsconfig.json
```

Proposed message:

```text
chore(deps): add react, ink, ink-spinner, zod, shelljs; enable jsx
```

Do not run `git commit` until the user says so.

---

## Task 2: Introduce shared types (`src/types.ts`)

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create the file**

```ts
import type { ModelMessage } from 'ai';

export interface AgentCallbacks {
  onToken: (token: string) => void;
  onToolCallStart: (name: string, args: unknown) => void;
  onToolCallEnd: (name: string, result: string) => void;
  onComplete: (response: string) => void;
  onToolApproval: (name: string, args: unknown) => Promise<boolean>;
  onTokenUsage?: (usage: TokenUsageInfo) => void;
}

export interface ToolApprovalRequest {
  toolName: string;
  args: unknown;
  resolve: (approved: boolean) => void;
}

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ModelLimits {
  inputLimit: number;
  outputLimit: number;
  contextWindow: number;
}

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextWindow: number;
  threshold: number;
  percentage: number;
}

export type { ModelMessage };
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/types.ts
```

Proposed message: `feat(types): add shared agent and ui types`

---

## Task 3: Add context package — `modelLimits`, `tokenEstimator`, barrel

**Files:**
- Create: `src/agent/context/modelLimits.ts`
- Create: `src/agent/context/tokenEstimator.ts`
- Create: `src/agent/context/index.ts`

- [ ] **Step 1: Create `modelLimits.ts`**

```ts
import type { ModelLimits } from '../../types.js';

export const DEFAULT_THRESHOLD = 0.8;

const MODEL_LIMITS: Record<string, ModelLimits> = {
  'gpt-5': {
    inputLimit: 272000,
    outputLimit: 128000,
    contextWindow: 400000,
  },
  'gpt-5-mini': {
    inputLimit: 272000,
    outputLimit: 128000,
    contextWindow: 400000,
  },
};

const DEFAULT_LIMITS: ModelLimits = {
  inputLimit: 128000,
  outputLimit: 16000,
  contextWindow: 128000,
};

export function getModelLimits(model: string): ModelLimits {
  if (MODEL_LIMITS[model]) {
    return MODEL_LIMITS[model];
  }
  if (model.startsWith('gpt-5')) {
    return MODEL_LIMITS['gpt-5'];
  }
  return DEFAULT_LIMITS;
}

export function isOverThreshold(
  totalTokens: number,
  contextWindow: number,
  threshold: number = DEFAULT_THRESHOLD,
): boolean {
  return totalTokens > contextWindow * threshold;
}

export function calculateUsagePercentage(
  totalTokens: number,
  contextWindow: number,
): number {
  return (totalTokens / contextWindow) * 100;
}
```

- [ ] **Step 2: Create `tokenEstimator.ts`**

```ts
import type { ModelMessage } from 'ai';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.75);
}

export function extractMessageText(message: ModelMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if ('text' in part && typeof part.text === 'string') return part.text;
        if ('value' in part && typeof part.value === 'string') return part.value;
        if ('output' in part && typeof part.output === 'object' && part.output) {
          const output = part.output as Record<string, unknown>;
          if ('value' in output && typeof output.value === 'string') {
            return output.value;
          }
        }
        return JSON.stringify(part);
      })
      .join(' ');
  }
  return JSON.stringify(message.content);
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export function estimateMessagesTokens(messages: ModelMessage[]): TokenUsage {
  let input = 0;
  let output = 0;
  for (const message of messages) {
    const text = extractMessageText(message);
    const tokens = estimateTokens(text);
    if (message.role === 'assistant') {
      output += tokens;
    } else {
      input += tokens;
    }
  }
  return { input, output, total: input + output };
}
```

- [ ] **Step 3: Create barrel `index.ts`** (compaction will be appended in Task 4)

```ts
export {
  estimateTokens,
  estimateMessagesTokens,
  extractMessageText,
  type TokenUsage,
} from './tokenEstimator.js';

export {
  DEFAULT_THRESHOLD,
  getModelLimits,
  isOverThreshold,
  calculateUsagePercentage,
} from './modelLimits.js';
```

- [ ] **Step 4: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 5: Propose commit**

```bash
git add src/agent/context/modelLimits.ts src/agent/context/tokenEstimator.ts src/agent/context/index.ts
```

Proposed message: `feat(context): add model limits and token estimation`

---

## Task 4: Add conversation compaction

**Files:**
- Create: `src/agent/context/compaction.ts`
- Modify: `src/agent/context/index.ts`

- [ ] **Step 1: Create `compaction.ts`**

```ts
import { generateText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { extractMessageText } from './tokenEstimator.js';

const SUMMARIZATION_PROMPT = `You are a conversation summarizer. Your task is to create a concise summary of the conversation so far that preserves:

1. Key decisions and conclusions reached
2. Important context and facts mentioned
3. Any pending tasks or questions
4. The overall goal of the conversation

Be concise but complete. The summary should allow the conversation to continue naturally.

Conversation to summarize:
`;

function messagesToText(messages: ModelMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role.toUpperCase();
      const content = extractMessageText(msg);
      return `[${role}]: ${content}`;
    })
    .join('\n\n');
}

export async function compactConversation(
  messages: ModelMessage[],
  model: string = 'gpt-5-mini',
): Promise<ModelMessage[]> {
  const conversationMessages = messages.filter((m) => m.role !== 'system');
  if (conversationMessages.length === 0) {
    return [];
  }

  const conversationText = messagesToText(conversationMessages);

  const { text: summary } = await generateText({
    model: openai(model),
    prompt: SUMMARIZATION_PROMPT + conversationText,
  });

  const compacted: ModelMessage[] = [
    {
      role: 'user',
      content: `[CONVERSATION SUMMARY]\nThe following is a summary of our conversation so far:\n\n${summary}\n\nPlease continue from where we left off.`,
    },
    {
      role: 'assistant',
      content:
        "I understand. I've reviewed the summary of our conversation and I'm ready to continue. How can I help you next?",
    },
  ];

  return compacted;
}
```

- [ ] **Step 2: Append to `index.ts`**

Add these lines to the end of `src/agent/context/index.ts`:

```ts
export { compactConversation } from './compaction.js';
```

- [ ] **Step 3: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 4: Propose commit**

```bash
git add src/agent/context/compaction.ts src/agent/context/index.ts
```

Proposed message: `feat(context): add conversation compaction via summarization`

---

## Task 5: Add `filterCompatibleMessages`

**Files:**
- Create: `src/agent/system/filterMessages.ts`

- [ ] **Step 1: Create the file**

```ts
import type { ModelMessage } from 'ai';

export const filterCompatibleMessages = (
  messages: ModelMessage[],
): ModelMessage[] => {
  return messages.filter((msg) => {
    if (msg.role === 'user' || msg.role === 'system') {
      return true;
    }

    if (msg.role === 'assistant') {
      const content = msg.content;
      if (typeof content === 'string' && content.trim()) {
        return true;
      }
      if (Array.isArray(content)) {
        return content.some((part: unknown) => {
          if (typeof part === 'string' && part.trim()) return true;
          if (typeof part === 'object' && part !== null && 'text' in part) {
            const textPart = part as { text?: string };
            return Boolean(textPart.text && textPart.text.trim());
          }
          return false;
        });
      }
      return false;
    }

    if (msg.role === 'tool') {
      return true;
    }

    return false;
  });
};
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/agent/system/filterMessages.ts
```

Proposed message: `feat(agent): filter incompatible messages before model calls`

---

## Task 6: Add filesystem tools

**Files:**
- Create: `src/agent/tools/file.ts`

- [ ] **Step 1: Create the file**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

export const readFile = tool({
  description:
    'Read the contents of a file at the specified path. Use this to examine file contents.',
  inputSchema: z.object({
    path: z.string().describe('The path to the file to read'),
  }),
  execute: async ({ path: filePath }: { path: string }) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return `Error: File not found: ${filePath}`;
      }
      return `Error reading file: ${err.message}`;
    }
  },
});

export const writeFile = tool({
  description:
    "Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does.",
  inputSchema: z.object({
    path: z.string().describe('The path to the file to write'),
    content: z.string().describe('The content to write to the file'),
  }),
  execute: async ({
    path: filePath,
    content,
  }: {
    path: string;
    content: string;
  }) => {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      return `Error writing file: ${err.message}`;
    }
  },
});

export const listFiles = tool({
  description:
    'List all files and directories in the specified directory path.',
  inputSchema: z.object({
    directory: z
      .string()
      .describe('The directory path to list contents of')
      .default('.'),
  }),
  execute: async ({ directory }: { directory: string }) => {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const items = entries.map((entry) => {
        const type = entry.isDirectory() ? '[dir]' : '[file]';
        return `${type} ${entry.name}`;
      });
      return items.length > 0
        ? items.join('\n')
        : `Directory ${directory} is empty`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return `Error: Directory not found: ${directory}`;
      }
      return `Error listing directory: ${err.message}`;
    }
  },
});

export const deleteFile = tool({
  description:
    'Delete a file at the specified path. Use with caution as this is irreversible.',
  inputSchema: z.object({
    path: z.string().describe('The path to the file to delete'),
  }),
  execute: async ({ path: filePath }: { path: string }) => {
    try {
      await fs.unlink(filePath);
      return `Successfully deleted ${filePath}`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return `Error: File not found: ${filePath}`;
      }
      return `Error deleting file: ${err.message}`;
    }
  },
});
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/agent/tools/file.ts
```

Proposed message: `feat(tools): add readFile, writeFile, listFiles, deleteFile`

---

## Task 7: Add shell tool

**Files:**
- Create: `src/agent/tools/shell.ts`

- [ ] **Step 1: Create the file**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import shell from 'shelljs';

export const runCommand = tool({
  description:
    'Execute a shell command and return its output. Use this for system operations, running scripts, or interacting with the operating system.',
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute'),
  }),
  execute: async ({ command }: { command: string }) => {
    const result = shell.exec(command, { silent: true });

    let output = '';
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += result.stderr;

    if (result.code !== 0) {
      return `Command failed (exit code ${result.code}):\n${output}`;
    }

    return output || 'Command completed successfully (no output)';
  },
});
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass. If the build complains that `shelljs` has no default export, change the import to `import * as shell from 'shelljs';` and rebuild.

- [ ] **Step 3: Propose commit**

```bash
git add src/agent/tools/shell.ts
```

Proposed message: `feat(tools): add runCommand shell execution tool`

---

## Task 8: Add web search tool

**Files:**
- Create: `src/agent/tools/webSearch.ts`

- [ ] **Step 1: Create the file**

```ts
import { openai } from '@ai-sdk/openai';

/**
 * OpenAI native web search.
 * Provider tool — executed by OpenAI, not by executeTool. Results come back
 * as part of the model's response stream.
 */
export const webSearch = openai.tools.webSearch({});
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass. If `openai.tools.webSearch` is typed `any` or missing, re-confirm Task 1 Step 2 succeeded.

- [ ] **Step 3: Propose commit**

```bash
git add src/agent/tools/webSearch.ts
```

Proposed message: `feat(tools): add openai provider web search tool`

---

## Task 9: Tool registry, approval policy, and `executeTool`

**Files:**
- Create: `src/agent/tools/index.ts`
- Create: `src/agent/executeTool.ts`

- [ ] **Step 1: Create `tools/index.ts`**

```ts
import { readFile, writeFile, listFiles, deleteFile } from './file.js';
import { runCommand } from './shell.js';
import { webSearch } from './webSearch.js';

export const tools = {
  readFile,
  writeFile,
  listFiles,
  deleteFile,
  runCommand,
  webSearch,
};

export type ToolName = keyof typeof tools;

const TOOLS_REQUIRING_APPROVAL: ReadonlySet<string> = new Set([
  'writeFile',
  'deleteFile',
  'runCommand',
]);

export function requiresApproval(name: string): boolean {
  return TOOLS_REQUIRING_APPROVAL.has(name);
}

export { readFile, writeFile, listFiles, deleteFile } from './file.js';
export { runCommand } from './shell.js';
export { webSearch } from './webSearch.js';
```

- [ ] **Step 2: Create `executeTool.ts`**

```ts
import { tools, type ToolName } from './tools/index.js';

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = tools[name as ToolName];

  if (!tool) {
    return `Unknown tool: ${name}`;
  }

  const execute = tool.execute;
  if (!execute) {
    return `Provider tool ${name} — executed by model provider`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await execute(args as any, {
    toolCallId: '',
    messages: [],
  });

  return String(result);
}
```

- [ ] **Step 3: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 4: Propose commit**

```bash
git add src/agent/tools/index.ts src/agent/executeTool.ts
```

Proposed message: `feat(agent): add tool registry, approval policy, and executeTool dispatcher`

---

## Task 10: Rewrite `agent/run.ts` and park `cli.ts`

The new `runAgent` signature breaks `cli.ts`. This task rewrites both so the build stays green. `cli.ts` becomes a temporary stub; Task 18 restores functionality by mounting the Ink app.

**Files:**
- Modify (rewrite): `src/agent/run.ts`
- Modify (temporary stub): `src/cli.ts`

- [ ] **Step 1: Rewrite `agent/run.ts`**

Replace the entire file with:

```ts
import { streamText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { tools, requiresApproval } from './tools/index.js';
import { executeTool } from './executeTool.js';
import { SYSTEM_PROMPT } from './system/prompt.js';
import { filterCompatibleMessages } from './system/filterMessages.js';
import {
  estimateMessagesTokens,
  getModelLimits,
  isOverThreshold,
  calculateUsagePercentage,
  compactConversation,
  DEFAULT_THRESHOLD,
} from './context/index.js';
import type { AgentCallbacks, ToolCallInfo } from '../types.js';

const MODEL_NAME = 'gpt-5-mini';

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
  const modelLimits = getModelLimits(MODEL_NAME);

  let workingHistory = filterCompatibleMessages(conversationHistory);
  const preCheck = estimateMessagesTokens([
    { role: 'system', content: SYSTEM_PROMPT },
    ...workingHistory,
    { role: 'user', content: userMessage },
  ]);

  if (isOverThreshold(preCheck.total, modelLimits.contextWindow)) {
    workingHistory = await compactConversation(workingHistory, MODEL_NAME);
  }

  const messages: ModelMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...workingHistory,
    { role: 'user', content: userMessage },
  ];

  const reportTokenUsage = (): void => {
    if (!callbacks.onTokenUsage) return;
    const usage = estimateMessagesTokens(messages);
    callbacks.onTokenUsage({
      inputTokens: usage.input,
      outputTokens: usage.output,
      totalTokens: usage.total,
      contextWindow: modelLimits.contextWindow,
      threshold: DEFAULT_THRESHOLD,
      percentage: calculateUsagePercentage(
        usage.total,
        modelLimits.contextWindow,
      ),
    });
  };

  reportTokenUsage();

  let fullResponse = '';

  while (true) {
    const result = streamText({
      model: openai(MODEL_NAME),
      messages,
      tools,
    });

    const toolCalls: ToolCallInfo[] = [];
    let currentText = '';
    let streamError: Error | null = null;

    try {
      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          currentText += chunk.text;
          callbacks.onToken(chunk.text);
        }

        if (chunk.type === 'tool-call') {
          const input = 'input' in chunk ? chunk.input : {};
          toolCalls.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: input as Record<string, unknown>,
          });
          callbacks.onToolCallStart(chunk.toolName, input);
        }
      }
    } catch (error) {
      streamError = error as Error;
      if (
        !currentText &&
        !streamError.message.includes('No output generated')
      ) {
        throw streamError;
      }
    }

    fullResponse += currentText;

    if (streamError && !currentText) {
      fullResponse =
        "I apologize, but I wasn't able to generate a response. Could you please try rephrasing your message?";
      callbacks.onToken(fullResponse);
      break;
    }

    const finishReason = await result.finishReason;

    if (finishReason !== 'tool-calls' || toolCalls.length === 0) {
      const responseMessages = await result.response;
      messages.push(...responseMessages.messages);
      reportTokenUsage();
      break;
    }

    const responseMessages = await result.response;
    messages.push(...responseMessages.messages);
    reportTokenUsage();

    let rejected = false;
    for (const tc of toolCalls) {
      let approved = true;
      if (requiresApproval(tc.toolName)) {
        approved = await callbacks.onToolApproval(tc.toolName, tc.args);
      }

      if (!approved) {
        rejected = true;
        break;
      }

      const toolResult = await executeTool(tc.toolName, tc.args);
      callbacks.onToolCallEnd(tc.toolName, toolResult);

      messages.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            output: { type: 'text', value: toolResult },
          },
        ],
      });
      reportTokenUsage();
    }

    if (rejected) {
      break;
    }
  }

  callbacks.onComplete(fullResponse);

  return messages;
}
```

- [ ] **Step 2: Replace `cli.ts` with a temporary stub**

Keep env validation intact, but park the runner. Write:

```ts
#!/usr/bin/env node
import { config } from 'dotenv';

config({ quiet: true });

const key = process.env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error(
    'yules-ai: OPENAI_API_KEY is missing or empty. Create a .env file in your current working directory with OPENAI_API_KEY set (this CLI loads .env from cwd).',
  );
  process.exit(1);
}

console.error('yules-ai: interactive UI is being rebuilt; run after task 18 completes.');
process.exit(0);
```

- [ ] **Step 3: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 4: Smoke check the stub**

```bash
node dist/cli.js
```

Expected stderr: `yules-ai: interactive UI is being rebuilt; run after task 18 completes.` Exit code 0.

- [ ] **Step 5: Propose commit**

```bash
git add src/agent/run.ts src/cli.ts
```

Proposed message: `refactor(agent): rewrite runAgent as single-turn callback API; park cli`

---

## Task 11: UI — `Spinner`

**Files:**
- Create: `src/ui/components/Spinner.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = 'Thinking...' }: SpinnerProps) {
  return (
    <Box>
      <Text color="cyan">
        <InkSpinner type="dots" />
      </Text>
      <Text>
        {' '}
        {label}
      </Text>
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/ui/components/Spinner.tsx
```

Proposed message: `feat(ui): add Spinner component`

---

## Task 12: UI — `MessageList`

**Files:**
- Create: `src/ui/components/MessageList.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map((message, index) => (
        <Box key={index} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
          <Text color={message.role === 'user' ? 'blue' : 'green'} bold>
            {message.role === 'user' ? '› You' : '› Assistant'}
          </Text>
          <Box marginLeft={2}>
            <Text>{message.content}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/ui/components/MessageList.tsx
```

Proposed message: `feat(ui): add MessageList component`

---

## Task 13: UI — `Input`

**Files:**
- Create: `src/ui/components/Input.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export function Input({ onSubmit, disabled = false }: InputProps) {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      if (value.trim()) {
        onSubmit(value);
        setValue('');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
    }
  });

  return (
    <Box>
      <Text color="cyan">{'> '}</Text>
      <Text>{value}</Text>
      {!disabled && <Text color="gray">▌</Text>}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/ui/components/Input.tsx
```

Proposed message: `feat(ui): add Input component with ink useInput`

---

## Task 14: UI — `ToolCall`

**Files:**
- Create: `src/ui/components/ToolCall.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

export interface ToolCallProps {
  name: string;
  args?: unknown;
  status: 'pending' | 'complete';
  result?: string;
}

export function ToolCall({ name, status, result }: ToolCallProps) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="yellow">⚡ </Text>
        <Text bold>{name}</Text>
        <Text> </Text>
        {status === 'pending' ? (
          <Text color="cyan">
            <InkSpinner type="dots" />
          </Text>
        ) : (
          <Text color="green">✓</Text>
        )}
      </Box>
      {status === 'complete' && result && (
        <Box marginLeft={2}>
          <Text dimColor>
            → {result.slice(0, 100)}
            {result.length > 100 ? '...' : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/ui/components/ToolCall.tsx
```

Proposed message: `feat(ui): add ToolCall component`

---

## Task 15: UI — `ToolApproval`

**Files:**
- Create: `src/ui/components/ToolApproval.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface ToolApprovalProps {
  toolName: string;
  args: unknown;
  onResolve: (approved: boolean) => void;
}

const MAX_PREVIEW_LINES = 5;

function formatArgs(args: unknown): { preview: string; extraLines: number } {
  const formatted = JSON.stringify(args, null, 2);
  const lines = formatted.split('\n');
  if (lines.length <= MAX_PREVIEW_LINES) {
    return { preview: formatted, extraLines: 0 };
  }
  return {
    preview: lines.slice(0, MAX_PREVIEW_LINES).join('\n'),
    extraLines: lines.length - MAX_PREVIEW_LINES,
  };
}

function getArgsSummary(args: unknown): string {
  if (typeof args !== 'object' || args === null) {
    return String(args);
  }
  const obj = args as Record<string, unknown>;
  const meaningfulKeys = ['path', 'filePath', 'command', 'query', 'code', 'content'];
  for (const key of meaningfulKeys) {
    if (key in obj && typeof obj[key] === 'string') {
      const value = obj[key] as string;
      return value.length > 50 ? value.slice(0, 50) + '...' : value;
    }
  }
  const keys = Object.keys(obj);
  if (keys.length > 0 && typeof obj[keys[0]] === 'string') {
    const value = obj[keys[0]] as string;
    return value.length > 50 ? value.slice(0, 50) + '...' : value;
  }
  return '';
}

export function ToolApproval({ toolName, args, onResolve }: ToolApprovalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const options = ['Yes', 'No'];

  useInput(
    (_input, key) => {
      if (key.upArrow || key.downArrow) {
        setSelectedIndex((prev) => (prev === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        onResolve(selectedIndex === 0);
      }
    },
    { isActive: true },
  );

  const argsSummary = getArgsSummary(args);
  const { preview, extraLines } = formatArgs(args);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box>
        <Text bold color="yellow">Tool Approval Required</Text>
      </Box>
      <Box marginTop={1}>
        <Text bold>{toolName}</Text>
        {argsSummary && <Text dimColor> ({argsSummary})</Text>}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{preview}</Text>
        {extraLines > 0 && <Text dimColor>... +{extraLines} more lines</Text>}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {options.map((option, index) => (
          <Text key={option} color={selectedIndex === index ? 'cyan' : undefined}>
            {selectedIndex === index ? '› ' : '  '}
            {option}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/ui/components/ToolApproval.tsx
```

Proposed message: `feat(ui): add ToolApproval y/n prompt`

---

## Task 16: UI — `TokenUsage`

**Files:**
- Create: `src/ui/components/TokenUsage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { TokenUsageInfo } from '../../types.js';

interface TokenUsageProps {
  usage: TokenUsageInfo | null;
}

export function TokenUsage({ usage }: TokenUsageProps) {
  if (!usage) {
    return null;
  }

  const thresholdPercent = Math.round(usage.threshold * 100);
  const usagePercent = usage.percentage.toFixed(1);

  let color: 'green' | 'yellow' | 'red' = 'green';
  if (usage.percentage >= usage.threshold * 100) {
    color = 'red';
  } else if (usage.percentage >= usage.threshold * 100 * 0.75) {
    color = 'yellow';
  }

  return (
    <Box>
      <Text dimColor>
        Tokens:{' '}
        <Text color={color}>{usagePercent}%</Text>
        <Text dimColor> (threshold: {thresholdPercent}%)</Text>
      </Text>
    </Box>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Propose commit**

```bash
git add src/ui/components/TokenUsage.tsx
```

Proposed message: `feat(ui): add TokenUsage indicator`

---

## Task 17: UI composition — `App.tsx` + `ui/index.tsx`

**Files:**
- Create: `src/ui/App.tsx`
- Create: `src/ui/index.tsx`

- [ ] **Step 1: Create `App.tsx`**

```tsx
import React, { useState, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import type { ModelMessage } from 'ai';
import { runAgent } from '../agent/run.js';
import { MessageList, type Message } from './components/MessageList.js';
import { ToolCall, type ToolCallProps } from './components/ToolCall.js';
import { Spinner } from './components/Spinner.js';
import { Input } from './components/Input.js';
import { ToolApproval } from './components/ToolApproval.js';
import { TokenUsage } from './components/TokenUsage.js';
import type { ToolApprovalRequest, TokenUsageInfo } from '../types.js';

interface ActiveToolCall extends ToolCallProps {
  id: string;
}

export function App() {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationHistory, setConversationHistory] = useState<
    ModelMessage[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([]);
  const [pendingApproval, setPendingApproval] =
    useState<ToolApprovalRequest | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageInfo | null>(null);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (
        userInput.toLowerCase() === 'exit' ||
        userInput.toLowerCase() === 'quit'
      ) {
        exit();
        return;
      }

      setMessages((prev) => [...prev, { role: 'user', content: userInput }]);
      setIsLoading(true);
      setStreamingText('');
      setActiveToolCalls([]);

      try {
        const newHistory = await runAgent(userInput, conversationHistory, {
          onToken: (token) => {
            setStreamingText((prev) => prev + token);
          },
          onToolCallStart: (name, args) => {
            setActiveToolCalls((prev) => [
              ...prev,
              {
                id: `${name}-${Date.now()}`,
                name,
                args,
                status: 'pending',
              },
            ]);
          },
          onToolCallEnd: (name, result) => {
            setActiveToolCalls((prev) =>
              prev.map((tc) =>
                tc.name === name && tc.status === 'pending'
                  ? { ...tc, status: 'complete', result }
                  : tc,
              ),
            );
          },
          onComplete: (response) => {
            if (response) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: response },
              ]);
            }
            setStreamingText('');
            setActiveToolCalls([]);
          },
          onToolApproval: (name, args) => {
            return new Promise<boolean>((resolve) => {
              setPendingApproval({ toolName: name, args, resolve });
            });
          },
          onTokenUsage: (usage) => {
            setTokenUsage(usage);
          },
        });

        setConversationHistory(newHistory);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${errorMessage}` },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationHistory, exit],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">yules-ai</Text>
        <Text dimColor> (type "exit" to quit)</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <MessageList messages={messages} />

        {streamingText && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="green" bold>› Assistant</Text>
            <Box marginLeft={2}>
              <Text>{streamingText}</Text>
              <Text color="gray">▌</Text>
            </Box>
          </Box>
        )}

        {activeToolCalls.length > 0 && !pendingApproval && (
          <Box flexDirection="column" marginTop={1}>
            {activeToolCalls.map((tc) => (
              <ToolCall
                key={tc.id}
                name={tc.name}
                args={tc.args}
                status={tc.status}
                result={tc.result}
              />
            ))}
          </Box>
        )}

        {isLoading &&
          !streamingText &&
          activeToolCalls.length === 0 &&
          !pendingApproval && (
            <Box marginTop={1}>
              <Spinner />
            </Box>
          )}

        {pendingApproval && (
          <ToolApproval
            toolName={pendingApproval.toolName}
            args={pendingApproval.args}
            onResolve={(approved) => {
              pendingApproval.resolve(approved);
              setPendingApproval(null);
            }}
          />
        )}
      </Box>

      {!pendingApproval && (
        <Input onSubmit={handleSubmit} disabled={isLoading} />
      )}

      <TokenUsage usage={tokenUsage} />
    </Box>
  );
}
```

- [ ] **Step 2: Create `ui/index.tsx` barrel**

```tsx
export { App } from './App.js';
export { MessageList, type Message } from './components/MessageList.js';
export { ToolCall, type ToolCallProps } from './components/ToolCall.js';
export { Spinner } from './components/Spinner.js';
export { Input } from './components/Input.js';
```

- [ ] **Step 3: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 4: Propose commit**

```bash
git add src/ui/App.tsx src/ui/index.tsx
```

Proposed message: `feat(ui): compose App with streaming, tool calls, approval, and token usage`

---

## Task 18: Wire `cli.ts` to render Ink `<App/>`

**Files:**
- Modify (restore): `src/cli.ts`

- [ ] **Step 1: Replace `cli.ts`** with the final implementation:

```ts
#!/usr/bin/env node
import React from 'react';
import { config } from 'dotenv';
import { render } from 'ink';
import { App } from './ui/index.js';

config({ quiet: true });

const key = process.env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error(
    'yules-ai: OPENAI_API_KEY is missing or empty. Create a .env file in your current working directory with OPENAI_API_KEY set (this CLI loads .env from cwd).',
  );
  process.exit(1);
}

render(React.createElement(App));
```

- [ ] **Step 2: Build**

```bash
npm run check
```

Expected: pass.

- [ ] **Step 3: Sanity-launch (header render only)**

From a directory with a valid `.env` containing `OPENAI_API_KEY`:

```bash
node dist/cli.js
```

Expected: Ink renders the `yules-ai (type "exit" to quit)` header, a cursor blinks at the input line. Type `exit` and press Enter — the process terminates with exit code 0.

Do **not** spend the API budget doing a full chat yet; Task 19 is the full verification.

- [ ] **Step 4: Propose commit**

```bash
git add src/cli.ts
```

Proposed message: `feat(cli): render ink App on startup`

---

## Task 19: Manual verification and cleanup

No files are modified in this task; it exists to execute the spec's **Verification (manual)** checklist and to surface any bugs that require a follow-up task.

Preconditions: valid `.env` with `OPENAI_API_KEY` in the directory you run from.

- [ ] **Step 1: Full `npm run check`**

```bash
npm run check
```

Expected: build, lint, format all exit 0.

- [ ] **Step 2: Basic chat**

```bash
node dist/cli.js
```

Type: `Say hi in five words.`

Expected:
- Header renders once at top.
- Tokens stream into an assistant block with a trailing `▌` cursor.
- On completion, the streamed text commits into `MessageList` (labeled `› Assistant`).
- `Tokens: <pct>%` row appears/updates at the bottom.

- [ ] **Step 3: Read-only tool (auto-approved)**

In the same session, send: `list the files in src`.

Expected:
- A `⚡ listFiles` card appears with a spinner, **no approval panel**, flips to `✓` with a dim one-line preview.
- Assistant continues and summarizes.

- [ ] **Step 4: Destructive tool (approval prompt)**

Prepare a throwaway directory before running. Then send: `create a file at /tmp/yules-smoke.txt with content "hello"`.

Expected:
- A `Tool Approval Required` panel replaces the input line, showing `writeFile` with the path summary.
- Up/down arrows move the `›` cursor between `Yes` and `No`.
- Picking `Yes` + Enter executes the tool (`⚡ writeFile ✓`); assistant continues.
- Run `cat /tmp/yules-smoke.txt` in another terminal — it prints `hello`.

- [ ] **Step 5: Tool rejection**

Send another destructive request (e.g. `run "rm /tmp/yules-smoke.txt"`). At the approval panel, pick `No`.

Expected:
- Approval panel disappears, input re-enables.
- No execution happens (`/tmp/yules-smoke.txt` still exists).
- Assistant acknowledges or asks what else to do on the next turn.

- [ ] **Step 6: Multi-turn history**

Send 3 more turns. Confirm transcript grows, previous tool results remain visible, token percentage grows.

- [ ] **Step 7: Exit paths**

- Type `exit` and press Enter → process terminates with exit code 0.
- Relaunch and press Ctrl+C → process terminates with exit code 0.

- [ ] **Step 8: Missing env failure**

From a directory with no `.env`:

```bash
unset OPENAI_API_KEY
cd /tmp && node /absolute/path/to/yules-ai/dist/cli.js
```

Expected: stderr line starting with `yules-ai: OPENAI_API_KEY is missing…`, exit code 1, no Ink render.

- [ ] **Step 9: Final build**

```bash
npm run check
```

Expected: clean pass.

- [ ] **Step 10: Propose end-of-feature commit (if anything changed)**

If the verification run required no code changes, there is nothing to commit. If you had to fix something, stage those changes and propose a commit with an appropriate `fix(...)` message.

---

## Appendix A: Spec coverage map

| Spec section | Task(s) |
|---|---|
| Goal 1 (Ink-driven CLI) | 17, 18 |
| Goal 2 (callback-based agent API) | 10 |
| Goal 3 (tool support) | 6, 7, 8, 9 |
| Goal 4 (approval flow) | 9, 15, 10 (agent gate), 17 (App wiring) |
| Goal 5 (context management) | 3, 4, 16 (UI), 10 (turn loop gate) |
| Goal 6 (packaging unchanged) | 1, 18 |
| File layout | 2, 3, 4, 5, 6, 7, 8, 9, 11–17, 18 |
| Build & runtime | 1 |
| Agent API contract + types | 2 |
| Agent turn loop | 10 |
| Tools table | 6, 7, 8 |
| Tool registry + `requiresApproval` | 9 |
| `executeTool` | 9 |
| `modelLimits` / `tokenEstimator` | 3 |
| `compactConversation` | 4 |
| `SYSTEM_PROMPT` (unchanged) | n/a (explicit non-change) |
| `filterCompatibleMessages` | 5 |
| UI — component tree | 11, 12, 13, 14, 15, 16, 17 |
| UI — App state + data flow | 17 |
| Error handling (env, stream, tool, rejection, Ctrl+C) | 10, 17, 18, 19 |
| Verification | 19 |

## Appendix B: Files created vs modified

**Created (19):**
- `src/types.ts`
- `src/agent/executeTool.ts`
- `src/agent/context/modelLimits.ts`
- `src/agent/context/tokenEstimator.ts`
- `src/agent/context/compaction.ts`
- `src/agent/context/index.ts`
- `src/agent/system/filterMessages.ts`
- `src/agent/tools/file.ts`
- `src/agent/tools/shell.ts`
- `src/agent/tools/webSearch.ts`
- `src/agent/tools/index.ts`
- `src/ui/App.tsx`
- `src/ui/index.tsx`
- `src/ui/components/Spinner.tsx`
- `src/ui/components/MessageList.tsx`
- `src/ui/components/Input.tsx`
- `src/ui/components/ToolCall.tsx`
- `src/ui/components/ToolApproval.tsx`
- `src/ui/components/TokenUsage.tsx`

**Modified (4):**
- `package.json`
- `tsconfig.json`
- `src/cli.ts` (parked in Task 10, restored in Task 18)
- `src/agent/run.ts` (rewritten in Task 10)

**Unchanged:**
- `src/agent/system/prompt.ts`

---

*End of plan.*
