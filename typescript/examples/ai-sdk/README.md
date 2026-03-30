# Hedera T3N Plugin - AI SDK Examples

This directory mirrors the upstream Hedera Agent Kit AI SDK examples, but the
plugin story is centered on `hederaT3nPlugin`.

## What is included

- `tool-calling-agent.ts`: AI SDK agent that loads the same Guided Actions tool set used by the current Next.js panel through explicit plugin configuration

## Prerequisites

- Node.js >= 18
- A local Ollama server for the default setup, or OpenAI / another OpenAI-compatible endpoint if you switch providers
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
DEMO_MODEL_PROVIDER=ollama
DEMO_MODEL=qwen2.5
OLLAMA_BASE_URL=http://127.0.0.1:11434
AGENT_IDENTITY_CONFIG_PATH=../../../output/identities/agent_identity.json
```

These CLI examples now follow the current Next.js demo behavior: they default to
local Ollama, use `qwen2.5` by default, and fill any missing secrets from the
plugin root `.env` / `.env.secret.pinata` files when present.

If you want OpenAI instead:

```env
DEMO_MODEL_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## Validate

```bash
pnpm typecheck
```

## Run

```bash
pnpm ai-sdk:tool-calling-agent
```

To prepare a usable identity file for the plugin tools:

```bash
cd ../../..
pnpm create-identity --path ./output/identities/agent_identity.json
```
