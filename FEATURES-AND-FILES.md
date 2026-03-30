# Hedera T3N Plugin — Features and Related Files

This document maps each feature area to the files that implement or support it in `hedera/hedera-t3n-plugin`.

**Lines (feature):** Approximate number of lines in that file that are on the execution path or directly support the feature (not total file size). Shared files are counted per feature; section totals may double-count shared code.

---

## 1. CLI tool to create identity

**Purpose:** Create an agent identity from the command line (keypair, DIDs, T3N registration, write credentials to file).

| File | Lines (feature) | Role |
|------|----------------:|------|
| `src/cli/create-identity.ts` | 124 | CLI entrypoint: argument handling, overwrite prompts, calls `createIdentity`, writes file |
| `src/cli/identity-args.ts` | 113 | CLI argument parsing (`--env`, `--path`), output target resolution |
| `src/createIdentity.ts` | 141 | Core workflow: keypair, DID derivation, T3N registration, storage |
| `src/utils/env.ts` | ~45 | `getAgentIdentityConfigPath`, `loadDotenvSafe` and helpers used by CLI |
| `src/utils/storage.ts` | 155 | `storeCredentials` — writes identity JSON to disk |
| `src/utils/crypto.ts` | 61 | Keypair generation, `did:key` derivation |
| `src/utils/hedera.ts` | 17 | Hedera wallet address derivation |
| `src/utils/t3n.ts` | 412 | T3N environment and `did:t3n` registration |
| `src/utils/agent-identity-config.ts` | ~2 | Hint strings referencing `pnpm create-identity` (CLI does not call this module) |
| `package.json` | 1 | Script `"create-identity": "tsx src/cli/create-identity.ts"` |
| **Total** | **~1,070** | |

---

## 2. Core plugin of Hedera SDK

**Purpose:** Hedera Agent Kit plugin that exposes identity validation, self-registration lookup, ERC-8004 registration, and public API.

| File | Lines (feature) | Role |
|------|----------------:|------|
| `src/plugin.ts` | 27 | Plugin definition: `hederaT3nPlugin`, tools factory, re-exports `createIdentity` and types |
| `src/index.ts` | 19 | Public API: re-exports plugin, `createIdentity`, `formatCreateIdentityMessage`, types |
| `src/tools/has-agent-identity-config.ts` | 78 | Tool implementation: validates identity config from `AGENT_IDENTITY_CONFIG_PATH` |
| `src/tools/check-agent-registration-status.ts` | 137 | Tool implementation: checks current agent registration state on T3N + Hedera |
| `src/tools/fetch-agent-registration-record.ts` | 146 | Tool implementation: fetches current agent registration records from T3N + Hedera |
| `src/utils/agent-identity-config.ts` | 134 | Read/validate identity config file, resolve path |
| `src/utils/agent-registration.ts` | 265 | Shared self-registration read/normalization logic for T3N + Hedera |
| `src/utils/tool-result.ts` | 36 | Tool result shape and `buildErrorResult` |
| `src/utils/validation.ts` | 104 | Credential/identity validation used by tool and storage |
| `src/registerAgentErc8004.ts` | 165 | Dual-registration flow plus persistence of optional T3N/Hedera registration metadata |
| `src/utils/hedera.ts` | 178 | Hedera read/verify helpers including read-by-agentId |
| `src/createIdentity.ts` | 141 | Core identity creation (exported by plugin) |
| `package.json` | ~15 | `main`, `exports`, `peerDependencies` for plugin entry |
| **Total** | **~1,115** | |

---

## 3. Ollama e2e test

**Purpose:** End-to-end test: Ollama LLM → agent → `HAS_AGENT_IDENTITY_CONFIG` tool with real/mock identity and Hedera testnet.

| File | Lines (feature) | Role |
|------|----------------:|------|
| `tests/e2e/e2e-ollama-tool.e2e.ts` | 286 | Main e2e: Ollama health check, missing file, create identity, tool invocation, invalid config |
| `tests/e2e/helpers/agent-setup.ts` | 73 | `createOllamaAgent` — build agent with plugin and Ollama |
| `tests/e2e/helpers/llm-health-check.ts` | 67 | `checkOllamaHealth` — Ollama reachable + model available |
| `tests/e2e/helpers/test-identity.ts` | 26 | `createTestIdentityFile`, `cleanupIdentityFile` (uses `createIdentity`) |
| `tests/e2e/helpers/tool-invocation.ts` | 120 | `invokeHasAgentIdentityConfig` — trigger and parse tool result |
| `tests/helpers/env.ts` | 25 | `captureEnv`, `restoreEnv` for e2e env isolation |
| `vitest.e2e.config.ts` | 28 | Vitest config for e2e (e.g. test match, timeout) |
| `package.json` | 1 | Script `"test:e2e": ...` |
| **Total** | **~627** | |

---

## 4. Unit test

**Purpose:** Fast, isolated tests for pure logic; no network or real filesystem.

| File | Lines (feature) | Role |
|------|----------------:|------|
| `tests/unit/crypto.test.ts` | 30 | Keypair, `did:key` derivation |
| `tests/unit/env.test.ts` | 124 | Env/path helpers (e.g. `getAgentIdentityConfigPath`) |
| `tests/unit/hedera.test.ts` | 24 | Hedera address derivation |
| `tests/unit/storage.test.ts` | 120 | `storeCredentials` behavior (e.g. with temp dirs) |
| `tests/unit/validation.test.ts` | 109 | Credential/identity validation |
| `tests/helpers/temp-files.ts` | 28 | Temp dir/file helpers for unit/integration |
| `tests/helpers/test-utils.ts` | 15 | Shared test utilities |
| `vitest.config.ts` | 18 | Vitest config for unit (and integration) |
| `package.json` | 1 | Script `"test": "HEDERA_NETWORK=local vitest run"` |
| **Total** | **~470** | |

---

## 5. Integration test

**Purpose:** Tests that use filesystem and env; no external LLM or live Hedera; deterministic for CI.

| File | Lines (feature) | Role |
|------|----------------:|------|
| `tests/integration/create-identity.cli.test.ts` | 86 | CLI argument parsing and output target resolution |
| `tests/integration/has-agent-identity-config.tool.test.ts` | 144 | Tool behavior: valid/missing/invalid identity file, messages |
| `tests/integration/t3n.test.ts` | 73 | T3N client/env behavior (e.g. local vs testnet) |
| `tests/helpers/env.ts` | 25 | Env capture/restore |
| `tests/helpers/temp-files.ts` | 28 | Temp paths for identity files |
| `tests/helpers/test-utils.ts` | 15 | Shared helpers |
| `vitest.config.ts` | 18 | Includes integration tests |
| `package.json` | 1 | Script `"test:integration": ...` |
| **Total** | **~390** | |

---

## 6. General README.md

**Purpose:** Main user-facing docs: features, scripts, quick-start, env, usage, project docs.

| File | Lines (feature) | Role |
|------|----------------:|------|
| `README.md` | 331 | Features, scripts, 60-second quick-start, env vars, CLI usage, identity lifecycle, code usage, troubleshooting, programmatic `createIdentity` |
| `package.json` | 1 | `"files": [..., "README.md", ...]` for npm publish |
| **Total** | **332** | |

---

## 7. Doc for open source project

**Purpose:** Notes and assets for releasing and maintaining the plugin as open source.

| File | Lines (feature) | Role |
|------|----------------:|------|
| `OPEN_SOURCE_NOTES.md` | 8 | Readiness checklist: `.env.example`, T3N endpoints, contribution/release guidelines, dependency/license review |
| `RELEASE_CHECKLIST.md` | 48 | Release steps and checks |
| `LICENSE` | 21 | License (e.g. MIT) |
| `.env.example` | 22 | Example env vars (non-sensitive) for consumers |
| `package.json` | ~4 | `"files": [..., "RELEASE_CHECKLIST.md", "OPEN_SOURCE_NOTES.md", "LICENSE"]` for publish |
| **Total** | **~103** | |

---

## Summary table

| # | Feature | Key files (primary) |
|---|---------|----------------------|
| 1 | CLI tool to create identity | `src/cli/create-identity.ts`, `src/cli/identity-args.ts`, `src/createIdentity.ts` |
| 2 | Core plugin of Hedera SDK | `src/plugin.ts`, `src/index.ts`, `src/tools/has-agent-identity-config.ts` |
| 3 | Ollama e2e test | `tests/e2e/e2e-ollama-tool.e2e.ts`, `tests/e2e/helpers/*` |
| 4 | Unit test | `tests/unit/*.test.ts` |
| 5 | Integration test | `tests/integration/*.test.ts` |
| 6 | General README | `README.md` |
| 7 | Doc for open source | `OPEN_SOURCE_NOTES.md`, `RELEASE_CHECKLIST.md`, `LICENSE`, `.env.example` |

---

## Files under `./src` not listed above

The following files under `./src` do not appear in any feature section above:

| File | Lines | Note |
|------|------:|------|
| `src/utils/environment.ts` | 8 | Environment/network tier type (e.g. `Environment`) shared by createIdentity and config; not called out in feature tables |
