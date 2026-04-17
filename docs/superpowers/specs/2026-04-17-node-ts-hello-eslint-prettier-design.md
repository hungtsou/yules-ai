# Node.js + TypeScript Hello World with ESLint and Prettier

## Context

The `yules-ai` repository currently contains only a root `package.json` with `"type": "module"`. There is no `src/` tree, no TypeScript configuration, and no lint or format tooling yet.

## Goals

1. Add a minimal TypeScript entrypoint at `src/index.ts` that prints a hello-world message via `console.log` and contains no other application logic.
2. Compile TypeScript with `tsc` into `dist/` and run the emitted JavaScript with Node (`node dist/index.js`).
3. Align the TypeScript module settings with the existing ESM package (`"type": "module"`): use `module` and `moduleResolution` values appropriate for Node’s native ESM resolution (e.g. `NodeNext` / `NodeNext`).
4. Enable **ESLint** with **type-aware** TypeScript rules using the **`typescript-eslint`** project (flat config, `eslint.config.js`), and apply **`eslint-config-prettier`** last so ESLint does not conflict with Prettier.
5. Add **Prettier** as a separate formatter (`format` / `format:check` scripts), not embedded in ESLint via `eslint-plugin-prettier`.

## Non-goals

- Application logic beyond the single `console.log` hello message.
- Automated tests, Husky, lint-staged, or CI workflow files (unless added in a later change).
- Path aliases or bundlers.

## Architecture

- **Build:** `src/**/*.ts` → `tsc` → `dist/**/*.js` (with `rootDir` `src` and `outDir` `dist`).
- **Run:** `node dist/index.js` after a successful build.
- **Lint:** ESLint 9+ flat config; extend `@eslint/js` recommended, `typescript-eslint` **recommended type-checked** rules with **`projectService: true`** (or the current equivalent in the installed `typescript-eslint` version) so the linter uses the same program as `tsconfig.json` without manually listing every file.
- **Format:** Prettier reads project defaults from a small root config file; `.prettierignore` excludes `node_modules`, `dist`, and other generated or vendor paths.

## Files and responsibilities

| Path | Responsibility |
|------|----------------|
| `src/index.ts` | Single hello-world `console.log`. |
| `tsconfig.json` | Strict compiler options; `NodeNext`/`NodeNext`; `rootDir` `src`, `outDir` `dist`; settings compatible with `typescript-eslint` type-checking. |
| `package.json` | `dependencies` / `devDependencies` for `typescript`, `@types/node`, `eslint`, `typescript-eslint`, `@eslint/js`, `eslint-config-prettier`, `prettier`, and `globals` if required by the chosen ESLint config; npm scripts for `build`, `start`, `lint`, `lint:fix`, `format`, `format:check`. Optional: `prestart` to run `build` before `start`, or a `check` script combining build, lint, and format check — implement only if the implementation plan lists them. |
| `eslint.config.js` | Flat ESLint config: ignores for `dist`, `node_modules`; language options for TypeScript files; apply `eslint-config-prettier` **after** other configs. |
| `.prettierrc` or `prettier.config.*` | Prettier defaults (minimal, conventional). |
| `.prettierignore` | Exclude `node_modules`, `dist`, and lockfiles as appropriate. |
| `.gitignore` | Ensure `node_modules/` and `dist/` are ignored if not already present. |

## npm scripts (target behavior)

- **`build`:** runs `tsc`.
- **`start`:** runs `node dist/index.js` (assumes `dist` exists; optionally chain via `prestart` = `npm run build`).
- **`lint`:** ESLint over TypeScript sources (and config files if included in the flat config).
- **`lint:fix`:** ESLint with `--fix` where applicable.
- **`format`:** Prettier write for the agreed file glob(s).
- **`format:check`:** Prettier check for CI-style verification.

Exact script strings and whether `prestart` / `check` exist are left to the implementation plan; this spec only requires `build`, `start`, `lint`, `lint:fix`, `format`, and `format:check`.

## Error handling and testing

No runtime error-handling requirements for the hello-world line. No tests in this slice.

## Verification

After implementation, a developer should be able to run `npm install`, `npm run build`, `npm start` and see the hello message; `npm run lint` and `npm run format:check` should succeed on the committed sources.
