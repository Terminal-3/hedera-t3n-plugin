# Next.js Example

Repo-local Next.js demo for the Hedera T3N plugin. This package provides:

- status and bootstrap endpoints for local identity readiness
- deterministic guided actions that execute the existing plugin tools directly
- streamed chat powered by the Vercel AI SDK with the same tool set attached

The demo is intentionally constrained to the current public plugin contract:

- `AUTH_AGENT_CONTEXT`
- `PRIVATE_DATA_PROCESSING`

## Run

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The example expects the parent `@terminal3/hedera-t3n-plugin` package to build locally and uses the existing plugin package through a `file:../../..` dependency.
Server-side routes also load the plugin root `.env` and optional `.env.secret.pinata`, so Hedera operator credentials and Pinata secrets can stay in the parent package instead of being duplicated into the demo folder.
Point `AGENT_IDENTITY_CONFIG_PATH` at an identity file under `output/identities/` in the parent plugin package, for example `../../../output/identities/agent_identity.json`.

The demo now supports `DEMO_MODEL_PROVIDER=groq` with `GROQ_API_KEY`, and still supports Ollama/OpenAI-compatible setups.

## Validate

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Each validation command rebuilds the parent plugin package first so the example reads
fresh `dist/` output from the local `file:../../..` dependency.
