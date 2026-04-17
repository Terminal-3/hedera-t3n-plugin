# Tests

This package keeps three test layers so contributors can run the right scope for the job.

## Definitions

- Unit tests: fast, isolated logic tests in `tests/unit`
- Integration tests: deterministic filesystem, tool, CLI, and helper behavior in `tests/integration`
- E2E tests: live Groq, OpenRouter, or Ollama plus the contracted public plugin flows in `tests/e2e`

## Running Tests

- Run commands from this package root, or use `pnpm --dir hedera/hedera-t3n-plugin-private ...` from the monorepo root.
- `pnpm test`: unit + integration.
- `pnpm test:integration`: integration only.
- `pnpm test:e2e`: default e2e flow covers `AUTH_AGENT_CONTEXT` and `PRIVATE_DATA_PROCESSING` only.
- `pnpm test:e2e -- --local-ccf`: opt-in preset that keeps `HEDERA_NETWORK=testnet` and auto-selects the local CCF leader when endpoint overrides are unset.
- `pnpm test:e2e -- --agent-card-gateway-url=https://...`: enables registration-dependent setup for public agent-card flows.
- `pnpm test:e2e -- --ipfs-pinata`: enables live `ipfs-submit-agent-card-pinata` upload during e2e setup.

## E2E Prerequisites

- Either `GROQ_API_KEY` (optionally `GROQ_MODEL`), `OPENROUTER_API_KEY` (optionally `OPENROUTER_MODEL`), or Ollama running locally with a tool-capable model
- `.env` values set for your selected LLM plus `HEDERA_ACCOUNT_ID` and `HEDERA_PRIVATE_KEY`
- optional Pinata credentials for `--ipfs-pinata`

If the selected LLM or Hedera prerequisites are missing, the e2e suite is skipped so CI without that provider still passes.

## Environment Variables

- `HEDERA_IDENTITY_REGISTRY_ADDRESS`: optional override for the live Hedera ERC-8004 registry contract address
- `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`: required for e2e agent setup and live registration-dependent phases
- `GROQ_API_KEY`, `GROQ_MODEL`: optional Groq path for e2e tool-calling tests
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`: optional OpenRouter path for e2e tool-calling tests
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`: optional Ollama path for e2e tool-calling tests
- `AGENT_IDENTITY_CONFIG_PATH`: identity file location used by the two public workflows
- `HEDERA_NETWORK`: controls the T3N environment (`local`, `testnet`, `mainnet`)
- `T3N_LOCAL_BACKEND`: optional local-only backend selector (`mock` or `ccf`)
- `T3N_API_URL`, `T3N_RUNTIME_API_URL`: optional explicit endpoint overrides
- `T3N_AGENT_REGISTRY_SCRIPT_VERSION`, `T3N_USER_SCRIPT_VERSION`: optional explicit script-version overrides when a target cluster cannot resolve `/api/contracts/current`
- `T3N_ML_KEM_PUBLIC_KEY_FILE`, `T3N_ML_KEM_PUBLIC_KEY`: optional live-local overrides for the current cluster ML-KEM public key

## Identity File Lifecycle (Tests)

1. Generate an identity file via `pnpm create-identity` or `createIdentity(...)` in test helpers.
2. Optionally host a public `agent_card.json` and pass its URL to `pnpm test:e2e -- --agent-card-gateway-url=https://...`, or upload it during e2e with `pnpm test:e2e -- --ipfs-pinata`.
3. The E2E suite exercises `AUTH_AGENT_CONTEXT` and `PRIVATE_DATA_PROCESSING` as the only public plugin tools.
4. Set `AGENT_IDENTITY_CONFIG_PATH` to the file path for manual tool runs; the e2e suite manages temp identity paths itself.
5. Clean up temp identity directories after tests complete.
