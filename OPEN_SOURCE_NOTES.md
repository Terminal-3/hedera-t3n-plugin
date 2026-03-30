# Open Source Notes

`@terminal3/hedera-t3n-plugin` is the public Hedera Agent Kit plugin package for T3N agent identity workflows.

## Scope

- local agent identity creation
- authenticated T3N session bootstrapping and validation
- user-DID tracking for later profile checks
- profile-field existence checks without exposing profile values
- T3N plus Hedera agent-registration inspection
- explicit CLI and programmatic helpers for agent-card upload and ERC-8004 registration

## Intentional Boundaries

- The plugin tools focus on readiness checks, session management, and registration readback.
- Live publication of the agent card and ERC-8004 writes stay explicit through the CLI or programmatic APIs instead of hidden behind autonomous tool execution.
- Local `HEDERA_NETWORK=local` support is intended for identity creation and fast test flows; live registration remains testnet/mainnet only.

## Public Package Expectations

- Requires host applications to provide `hedera-agent-kit` and `@hashgraph/sdk`.
- Requires `AGENT_IDENTITY_CONFIG_PATH` for tools that read the local identity file.
- Requires extra credentials only for the flows that truly need them, such as Hedera registration or Pinata upload.
- Keeps runtime configuration overrideable through environment variables for local CCF, staging, and production-like testing.

## Submission Notes

- The Hedera Agent Kit submission requires listing the plugin in both `README.md` and `docs/PLUGINS.md` of the upstream `hedera-agent-kit-js` repo.
- The plugin listing should reference the public source repository, npm package URL, and the tested public package version.
