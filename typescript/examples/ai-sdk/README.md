# Hedera T3N Plugin - AI SDK Examples

This directory mirrors the upstream Hedera Agent Kit AI SDK examples, but the
plugin story is centered on `hederaT3nPlugin`.

The plugin contract used here is the current two-tool public surface only:

- `AUTH_AGENT_CONTEXT` (`auth_agent_context`)
- `PRIVATE_DATA_PROCESSING` (`private_data_processing`)

## What is included

- `tool-calling-agent.ts`: AI SDK agent that loads the same Guided Actions tool set used by the current Next.js panel through explicit plugin configuration

## Prerequisites

- Node.js >= 18
- A Groq API key for the default setup, or Ollama / OpenAI / another OpenAI-compatible endpoint if you switch providers
- A Hedera account
- A local T3N identity file if you want to exercise identity/session tools

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill in:

```env
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302...
DEMO_MODEL_PROVIDER=groq
DEMO_MODEL=llama-3.3-70b-versatile
GROQ_API_KEY=gsk_...
AGENT_IDENTITY_CONFIG_PATH=../../../output/identities/agent_identity.json
```

These CLI examples now support Groq directly and still fill any missing secrets
from the plugin root `.env` / `.env.secret.pinata` files when present.

If you want Ollama instead:

```env
DEMO_MODEL_PROVIDER=ollama
DEMO_MODEL=gemma4:latest
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

If you want OpenAI instead:

```env
DEMO_MODEL_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## Validate

```bash
pnpm typecheck
```

`typecheck` rebuilds the parent `@terminal3/hedera-t3n-plugin` package first so the
repo-local `file:../../..` dependency resolves against current build artifacts.

## Run

```bash
pnpm ai-sdk:tool-calling-agent
```

To prepare a usable identity file for the plugin tools:

```bash
cd ../../..
pnpm create-identity --path ./output/identities/agent_identity.json
```
