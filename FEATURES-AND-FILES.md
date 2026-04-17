# Hedera T3N Plugin — Features and Related Files

This document maps the current public feature surface and supporting workflows to the files that implement them.

## 1. Public plugin tool surface

Purpose: expose the two supported public tools for Hedera Agent Kit consumers.

| File | Role |
| --- | --- |
| `src/plugin.ts` | Declares the plugin and registers the two public tools. |
| `src/index.ts` | Re-exports the plugin and supported programmatic APIs. |
| `src/tools/private-data-processing.ts` | Public tool wrapper for privacy-preserving profile field checks. |
| `src/tools/auth-agent-context.ts` | Public tool wrapper for identity/session/registration readiness. |
| `src/utils/private-data-processing.ts` | Implements the private data processing workflow and output shape. |
| `src/utils/auth-agent-context.ts` | Builds the auth context snapshot used by `AUTH_AGENT_CONTEXT`. |
| `src/utils/tool-result.ts` | Shared success/error tool result helpers. |

## 2. Identity and registration workflows

Purpose: support local identity creation and explicit registration flows used by the plugin and CLI.

| File | Role |
| --- | --- |
| `src/createIdentity.ts` | Core identity creation workflow. |
| `src/registerAgentErc8004.ts` | Explicit Hedera ERC-8004 registration workflow. |
| `src/submitAgentCardPinata.ts` | Uploads agent cards to Pinata/IPFS. |
| `src/utils/agent-identity-config.ts` | Resolves, reads, and validates local identity config files. |
| `src/utils/agent-registration.ts` | Reads and normalizes T3N and Hedera registration state. |
| `src/utils/t3n-session.ts` | Creates and validates T3N auth sessions from local identity state. |
| `src/utils/validation.ts` | Shared validation for identity and credential payloads. |
| `src/utils/hedera.ts` | Hedera-specific helpers used by registration flows. |
| `src/utils/t3n.ts` | T3N environment and API helpers. |

## 3. CLI entry points

Purpose: provide explicit local workflows for identity bootstrap and registration-related operations.

| File | Role |
| --- | --- |
| `src/cli/index.ts` | Main CLI entrypoint. |
| `src/cli/create-identity.ts` | CLI wrapper for identity creation. |
| `src/cli/register-agent-erc8004.ts` | CLI wrapper for ERC-8004 registration. |
| `src/cli/ipfs-submit-agent-card-pinata.ts` | CLI wrapper for Pinata/IPFS upload. |
| `src/cli/init.ts` | Initializes local env example files. |
| `src/cli/identity-args.ts` | Shared CLI argument parsing for identity-path based commands. |

## 4. Tests

Purpose: verify the two-tool contract, CLI behavior, and supporting workflows.

| File | Role |
| --- | --- |
| `tests/unit/plugin.test.ts` | Verifies the plugin exposes the expected public tools. |
| `tests/unit/auth-agent-context-utils.test.ts` | Unit coverage for auth-context result shaping and readiness logic. |
| `tests/integration/auth-agent-context.tool.test.ts` | Integration coverage for `AUTH_AGENT_CONTEXT`, including safe output shape. |
| `tests/integration/private-data-processing.tool.test.ts` | Integration coverage for `PRIVATE_DATA_PROCESSING`. |
| `tests/integration/create-identity.cli.test.ts` | Integration coverage for create-identity CLI behavior. |
| `tests/integration/t3n.test.ts` | Integration coverage for T3N helpers and environment behavior. |
| `tests/e2e/auth-agent-context.e2e.ts` | Live end-to-end coverage for auth-context orchestration flow. |
| `tests/e2e/private-data-processing-positive.e2e.ts` | Live success-path coverage for private data processing. |
| `tests/e2e/private-data-processing-negative.e2e.ts` | Live negative-path coverage for private data processing. |
| `tests/e2e/helpers/*.ts` | Shared e2e helpers for agent setup, env handling, and tool invocation. |
| `tests/helpers/*.ts` | Shared filesystem and env helpers for tests. |

## 5. Consumer and release documentation

Purpose: document installation, usage, release expectations, and packaged assets.

| File | Role |
| --- | --- |
| `README.md` | Main consumer documentation for installation, tool usage, CLI workflows, and migration. |
| `OPEN_SOURCE_NOTES.md` | Open-source release notes and readiness reminders. |
| `OPEN_SOURCE_READINESS_MATRIX.md` | Release-readiness tracking for public packaging. |
| `RELEASE_CHECKLIST.md` | Release verification checklist. |
| `LICENSE` | Package license. |
| `package.json` | Package metadata, exports, scripts, and published file list. |

## Public contract summary

The plugin's public callable tool surface is intentionally limited to:

1. `PRIVATE_DATA_PROCESSING`
2. `AUTH_AGENT_CONTEXT`

Identity creation, Pinata upload, and ERC-8004 registration remain supported through the CLI and programmatic APIs, not as additional public plugin tools.
