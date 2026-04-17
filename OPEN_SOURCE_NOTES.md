# Open Source Notes

## What Changed In 2.0.0

- preserved the existing plugin runtime surface, including user-DID and profile-field tools
- switched package publishing defaults from GitHub Packages-only metadata to public npm distribution
- removed stale legacy KYC wording from release docs and readiness notes
- added validation gates for lint, tests, build, pack, and tarball smoke-install checks

## Migration Guidance

If you are upgrading from an internal or GitHub-Packages-based install:

1. Replace GitHub Packages auth and scoped-registry setup with the public npm install command.
2. Keep existing tool allowlists; no active runtime tools were removed in this release.
3. Keep registration as an explicit CLI or SDK action via `registerAgentErc8004(...)`.
4. Update any local docs or prompts that still describe the user-DID/profile flows as legacy KYC features.

## Publish And Register Playbook

1. Run `pnpm validate`.
2. Publish with `pnpm release`.
3. Push the generated release tag.
4. Open the follow-up docs updates needed by Hedera Agent Kit:
   - add the plugin to `docs/PLUGINS.md`
   - add the same listing to the Hedera Agent Kit root README third-party plugins section
5. Share the README and npm package URL when requesting plugin review or listing updates.
