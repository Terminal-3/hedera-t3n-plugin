# Tests

This package keeps three test layers so contributors can run the right scope for the job.

## Definitions

- Unit tests: fast, isolated logic tests in `tests/unit`
- Integration tests: deterministic filesystem, tool, CLI, and helper behavior in `tests/integration`
- E2E tests: live Ollama plus T3N/Hedera flows in `tests/e2e`

## Running Tests

- Run commands from `hedera/hedera-t3n-plugin` unless you use `pnpm --dir hedera/hedera-t3n-plugin ...` from the repo root.
- `pnpm test`: unit + integration (uses `HEDERA_NETWORK=local` for faster local/mock mode by default).
- `pnpm test:integration`: integration only (uses `HEDERA_NETWORK=testnet` for staging behavior).
- `pnpm test:e2e`: default e2e flow covers identity validation, session auth, user-DID tracking, profile mapping/guards, registration inspection, and delegated self-only checks. Live registration phases remain opt-in.
- `pnpm test:e2e -- --agent-card-gateway-url=https://...`: full e2e flow with a caller-provided public agent-card URL.
- `pnpm test:e2e -- --ipfs-pinata`: full e2e flow with live `ipfs-submit-agent-card-pinata` upload.

If the current public T3N endpoint does not expose the agent-registry contract version, Phase F still runs but Phases G-K are skipped with guidance to use explicit `T3N_API_URL` / `T3N_RUNTIME_API_URL` overrides.

`register-agent-erc8004` itself does not support `HEDERA_NETWORK=local`; local remains valid for identity creation and fast test execution only.

## E2E Prerequisites

- Ollama running locally
- required model pulled (example: `ollama pull qwen2.5`)
- `.env` values set for `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `HEDERA_ACCOUNT_ID`, and `HEDERA_PRIVATE_KEY`
- optional Pinata credentials available locally for `--ipfs-pinata`

If Ollama or Hedera prerequisites are missing, the e2e suite is skipped so CI without Ollama still passes.

## Environment Variables

- `HEDERA_IDENTITY_REGISTRY_ADDRESS`: optional override for the live Hedera ERC-8004 registry contract address
- `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`: required for e2e agent setup and live registration phases
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`: required for e2e tool-calling tests
- `AGENT_IDENTITY_CONFIG_PATH`: identity file location used by tool validation phases
- `HEDERA_NETWORK`: controls the T3N environment (`local`, `testnet`, `mainnet`)
- `T3N_LOCAL_BACKEND`: optional local-only backend selector (`mock` or `ccf`)
- `T3N_API_URL`, `T3N_RUNTIME_API_URL`: optional explicit endpoint overrides, primarily for live local CCF targeting
- `T3N_AGENT_REGISTRY_SCRIPT_VERSION`, `T3N_USER_SCRIPT_VERSION`: optional explicit script-version overrides when a target cluster cannot resolve `/api/contracts/current`
- `T3N_ML_KEM_PUBLIC_KEY_FILE`, `T3N_ML_KEM_PUBLIC_KEY`: optional live-local overrides for the current cluster ML-KEM public key
- `HEDERA_E2E_LOCAL_CCF_DEFAULTS`: optional boolean (`1|true|yes`) to opt in to local CCF preset defaults in `tests/e2e/run-e2e.ts`
- `HEDERA_E2E_LOCAL_CCF_API_URL`, `HEDERA_E2E_LOCAL_CCF_RUNTIME_API_URL`: optional preset defaults used only when local CCF defaults are enabled
- `HEDERA_E2E_LOCAL_CCF_KEY_FILE_CANDIDATES`: optional comma-separated key-file candidate paths used by the local CCF preset
- `HEDERA_E2E_IPFS_GATEWAY_READY_TIMEOUT_MS`, `HEDERA_E2E_IPFS_GATEWAY_RETRY_INTERVAL_MS`, `HEDERA_E2E_IPFS_GATEWAY_FETCH_TIMEOUT_MS`: optional Pinata gateway readiness tuning

## Identity File Lifecycle (Tests)

1. Generate an identity file via `pnpm create-identity` or `createIdentity(...)` in test helpers.
2. Host a public `agent_card.json` and pass its URL to `pnpm test:e2e -- --agent-card-gateway-url=https://...`, or upload it during e2e with `pnpm test:e2e -- --ipfs-pinata`.
3. The E2E suite exercises `HAS_AGENT_IDENTITY_CONFIG`, session creation/validation, user-DID tracking, profile-field lookup guards, optional live registration, registration readback, and delegated self-only checks.
4. Set `AGENT_IDENTITY_CONFIG_PATH` to the file path for manual tool runs; the e2e suite manages temp identity paths itself.
5. Clean up temp identity directories after tests complete.

## Troubleshooting

- If the e2e test reports that the model did not call the tool, try a different Ollama model known for tool use (for example, `qwen2.5`).
- If you see `model not found`, run `ollama pull <model>` and retry.
- Integration tests should not require network access when run with `pnpm test`. For tests that need network access, use `pnpm test:integration` or `pnpm test:e2e`.
