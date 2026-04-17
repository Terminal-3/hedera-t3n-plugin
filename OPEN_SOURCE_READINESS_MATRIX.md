# Open Source Readiness Matrix

## Public Plugin Contract

| Surface | Status | Notes |
| --- | --- | --- |
| `PRIVATE_DATA_PROCESSING` | Locked | Primary client-facing workflow for privacy-preserving profile-field availability checks. |
| `AUTH_AGENT_CONTEXT` | Locked | Advanced orchestration workflow for identity, auth-session, and registration readiness. |
| `createIdentity(...)` / CLI | Locked | Creates the local identity JSON plus agent-card scaffold. |
| `submitAgentCardToPinata(...)` / CLI | Locked | Uploads the public `agent_card.json` and persists the gateway URL. |
| `registerAgentErc8004(...)` / CLI | Locked | Explicitly writes T3N + Hedera ERC-8004 registration state. |

## Internalized Behaviors

The older atomic tools remain implementation details behind the two public workflows. They are no longer part of the public plugin contract.

## Open-Source Readiness

| Area | Status | Notes |
| --- | --- | --- |
| README compliance | Done | `README.md` reflects the contracted two-tool public surface. |
| Package publishing | Done | `publishConfig.access` is public and package files include runtime docs needed by consumers. |
| Pack smoke test | Done | `scripts/smoke-pack-install.js` validates tarball install, import, CLI wiring, and the two-tool contract. |
| Validation gates | Done | `pnpm validate` runs lint, tests, build, dry-run pack, and smoke install. |
| CI baseline | Done | `.github/workflows/ci.yml` runs the validation suite on pushes and pull requests. |
| Breaking-change communication | Done | Docs now call out the public contract reduction explicitly. |
| Hedera plugin registration follow-up | Pending manual step | After publish, update Hedera Agent Kit docs and README third-party plugin listings. |
