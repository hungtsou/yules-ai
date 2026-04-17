# Node.js + TypeScript Hello World with ESLint and Prettier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal `src/index.ts` hello-world program, compile with `tsc` to `dist/`, run with Node, and wire ESLint (type-aware `typescript-eslint` flat config + `eslint-config-prettier`) and Prettier with npm scripts.

**Architecture:** TypeScript emits ESM-compatible JS under `dist/` using `NodeNext` resolution to match `package.json` `"type": "module"`. ESLint uses flat `eslint.config.js` with `@eslint/js` recommended, `typescript-eslint` `recommendedTypeChecked` + `projectService`, and `eslint-config-prettier` last. Prettier runs separately from ESLint; `.prettierignore` keeps build output and dependencies out of formatting.

**Tech Stack:** Node.js (npm), TypeScript 6.x, ESLint 10.x, `typescript-eslint` 8.x, Prettier 3.x, `@eslint/js`, `eslint-config-prettier`, `@types/node`.

---

## File map

| File | Action | Role |
|------|--------|------|
| `.gitignore` | Create | Ignore `node_modules/`, `dist/`, logs, env files. |
| `tsconfig.json` | Create | Strict compile; `NodeNext`; `rootDir` `src`; `outDir` `dist`; `include` `src`. |
| `src/index.ts` | Create | `console.log` hello world. |
| `package.json` | Modify | Dev deps, scripts (`build`, `start`, `prestart`, `lint`, `lint:fix`, `format`, `format:check`, `check`); set `main` to `dist/index.js`. |
| `eslint.config.js` | Create | Flat config: ignores, type-aware TS, Prettier last. |
| `.prettierrc.json` | Create | Minimal Prettier defaults. |
| `.prettierignore` | Create | Ignore `node_modules`, `dist`, lockfiles. |

Lockfile is created/updated by `npm install` (not hand-edited).

---

### Task 1: Ignore build output and dependencies

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Add `.gitignore`**

```gitignore
node_modules/
dist/
*.log
.env
.env.*
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore node_modules, dist, and env files"
```

---

### Task 2: TypeScript compiler configuration

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Add `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add tsconfig for NodeNext ESM build to dist/"
```

---

### Task 3: Hello-world entrypoint

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Add `src/index.ts`**

```typescript
console.log('Hello, world.');
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: add hello world entrypoint"
```

---

### Task 4: Dependencies and npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace root `package.json` with the following** (preserve `name`, `version`, `description`, `homepage`, `bugs`, `repository`, `license`, `author` if you prefer to keep them; the block below keeps them as in the current repo)

```json
{
  "name": "yules-ai",
  "version": "1.0.0",
  "description": "",
  "homepage": "https://github.com/hungtsou/yules-ai#readme",
  "bugs": {
    "url": "https://github.com/hungtsou/yules-ai/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/hungtsou/yules-ai.git"
  },
  "license": "ISC",
  "author": "",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "prestart": "npm run build",
    "start": "node dist/index.js",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "npm run build && npm run lint && npm run format:check"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^25.6.0",
    "eslint": "^10.2.1",
    "eslint-config-prettier": "^10.1.8",
    "prettier": "^3.8.3",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.58.2"
  }
}
```

- [ ] **Step 2: Install packages**

Run:

```bash
npm install
```

Expected: Exit code `0`; `package-lock.json` created or updated; `node_modules/` populated.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add TypeScript, ESLint, Prettier devDependencies and scripts"
```

---

### Task 5: ESLint flat config (type-aware TypeScript + Prettier compatibility)

**Files:**
- Create: `eslint.config.js`

- [ ] **Step 1: Add `eslint.config.js`**

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  eslintConfigPrettier,
);
```

- [ ] **Step 2: Commit**

```bash
git add eslint.config.js
git commit -m "chore: add ESLint flat config with typescript-eslint and prettier compatibility"
```

---

### Task 6: Prettier configuration and ignore file

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Add `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true
}
```

- [ ] **Step 2: Add `.prettierignore`**

```gitignore
node_modules
dist
package-lock.json
```

- [ ] **Step 3: Commit**

```bash
git add .prettierrc.json .prettierignore
git commit -m "chore: add Prettier config and ignore file"
```

---

### Task 7: End-to-end verification

**Files:**
- None (commands only)

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: Exit code `0`; `dist/index.js` exists.

- [ ] **Step 2: Run start**

```bash
npm start
```

Expected: Exit code `0`; stdout contains `Hello, world.` (with newline).

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: Exit code `0`; no errors for `src/index.ts`.

- [ ] **Step 4: Run format check**

```bash
npm run format:check
```

Expected: Exit code `0`.

- [ ] **Step 5: Run combined check**

```bash
npm run check
```

Expected: Exit code `0`.

- [ ] **Step 6: If Prettier rewrote any files during local experimentation, commit them**

```bash
git status
```

If only line-ending or quote changes appear on tracked files, run `npm run format`, review `git diff`, then:

```bash
git add -A
git commit -m "style: apply prettier formatting"
```

---

## Spec coverage checklist

| Spec requirement | Task(s) |
|------------------|---------|
| `src/index.ts` hello `console.log` | Task 3 |
| `tsc` → `dist/`, Node run | Tasks 2, 4, 7 |
| ESM / `NodeNext` alignment | Tasks 2, 4 |
| ESLint flat + type-aware `typescript-eslint` + `eslint-config-prettier` last | Tasks 4, 5 |
| Prettier separate; ignore `dist` / `node_modules` | Tasks 4, 6 |
| `build`, `start`, `lint`, `lint:fix`, `format`, `format:check` | Task 4 |
| `.gitignore` for `node_modules`, `dist` | Task 1 |
| Verification (install, build, start, lint, format check) | Task 7 |

Optional items from spec (`prestart`, `check`) are included in Task 4 scripts.

---

## Plan self-review

- **Placeholders:** None; all file bodies and commands are concrete.
- **Consistency:** `lint` targets `src` only so type-aware rules apply to `src/index.ts` and `eslint.config.js` is not parsed as TypeScript.
- **Versions:** `typescript-eslint@8.58.2` peers allow `eslint@^10` and `typescript@<6.1.0`; `typescript@^6.0.3` satisfies that range.
