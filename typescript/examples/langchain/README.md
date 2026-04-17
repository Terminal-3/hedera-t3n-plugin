# Hedera T3N Plugin - LangChain Examples

This directory mirrors the upstream Hedera Agent Kit LangChain examples and
adapts them to `hederaT3nPlugin`.

The guided T3N surface in these examples is intentionally limited to the two
public plugin methods behind:

- `AUTH_AGENT_CONTEXT` (`auth_agent_context`)
- `PRIVATE_DATA_PROCESSING` (`private_data_processing`)

## Included examples

- `tool-calling-agent.ts`: the canonical tool-calling example, loading the same T3N Guided Actions tool set through explicit plugin configuration as the current Next.js panel
- `structured-chat-agent.ts`: structured-chat agent with that same Guided Actions-compatible tool set
- `return-bytes-tool-calling-agent.ts`: mixed setup showing T3N plugin tools
  alongside a core Hedera transfer tool in `RETURN_BYTES` mode

## Setup

```bash
pnpm install
cp .env.example .env
```

Populate:

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
repo-local `file:../../..` dependency stays in sync with the example.

## Run

```bash
pnpm langchain:tool-calling-agent
pnpm langchain:structured-chat-agent
pnpm langchain:return-bytes-tool-calling-agent
```

The `return-bytes` example intentionally mixes one core Hedera transfer tool
with `hederaT3nPlugin`, because the T3N plugin tools themselves do not emit raw
transaction bytes.
