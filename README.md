# yules-ai

Interactive terminal chat CLI built with the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction), the OpenAI provider, and streaming replies (`gpt-5-mini`).

## Requirements

- Node.js 18+ (ESM; project uses `"type": "module"`)
- An [OpenAI API key](https://platform.openai.com/api-keys)

## Setup

```bash
git clone https://github.com/hungtsou/yules-ai.git
cd yules-ai
npm install
```

Create a `.env` file in the directory where you will run the CLI (the tool loads `.env` from the **current working directory**, not from the package install path):

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY to your real key
```

## Run locally

From the repo root (after `npm install`):

```bash
npm start
```

This runs `npm run build` then `node dist/cli.js`.

## Install globally

```bash
npm run build
npm install -g .
```

Then run `yules-ai` from any folder that contains a `.env` with `OPENAI_API_KEY` set:

```bash
cd /path/to/your/project
yules-ai
```

Use **Ctrl+D** (EOF) or **Ctrl+C** to leave the session.

## Environment variables

| Variable         | Required | Description                   |
| ---------------- | -------- | ----------------------------- |
| `OPENAI_API_KEY` | Yes      | OpenAI API key for chat calls |

See `.env.example` for a template.

## Scripts

| Script          | Description                      |
| --------------- | -------------------------------- |
| `npm run build` | Compile TypeScript to `dist/`    |
| `npm start`     | Build (prestart) and run the CLI |
| `npm run lint`  | ESLint on `src/`                 |
| `npm run check` | Build, lint, and Prettier check  |

## License

ISC (see `package.json`).
