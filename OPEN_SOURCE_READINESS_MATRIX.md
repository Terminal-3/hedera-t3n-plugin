# Open Source Readiness Matrix

This matrix tracks the public-release expectations for `@terminal3/hedera-t3n-plugin`.

| Area | Status | Notes |
| --- | --- | --- |
| Public repository | Ready | Source lives at `Terminal-3/hedera-t3n-plugin` with MIT license and public README. |
| Public npm package | Ready | Published as `@terminal3/hedera-t3n-plugin@2.0.0` with public access. |
| Plugin README | Ready | Covers installation, usage, functionality, CLI workflows, programmatic APIs, env vars, and development commands. |
| Package metadata | Ready | `package.json` points to the public repository, issues URL, homepage, and public publish config. |
| Hedera Agent Kit compatibility | Ready | Declares `hedera-agent-kit` and `@hashgraph/sdk` as required peer dependencies. |
| Plugin exports | Ready | Package exports the plugin, identity helper, registration helper, Pinata upload helper, and CLI entrypoint. |
| Tool surface documentation | Ready | README documents the available tool names and parameter expectations. |
| Validation coverage | Ready | Unit, integration, and opt-in e2e layers are documented under `tests/README.md`. |
| Packaged artifacts | Ready | `pnpm run pack:dry-run` verifies the tarball contents before release. |
| Submission docs | Ready | This repo now includes release notes, readiness notes, and a release checklist for maintainers. |

## Known Manual Follow-Ups

- If the public README changes materially after `2.0.0`, publish a new npm version so the npm package page matches the repository README.
- After opening the Hedera Agent Kit listing PR, keep the listed tested version aligned with the latest public npm release.
- Optional: submit a separate ElizaOS adapter-plugin update if you want the plugin enabled there by default.
