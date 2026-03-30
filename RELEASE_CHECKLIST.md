# Release Checklist

Use this checklist before publishing a new version of `@terminal3/hedera-t3n-plugin` or updating its public submission docs.

## Repo And Docs

- [ ] Confirm `README.md` matches the current plugin exports, CLI commands, and environment requirements.
- [ ] Confirm `OPEN_SOURCE_NOTES.md` and `OPEN_SOURCE_READINESS_MATRIX.md` still reflect the current package scope.
- [ ] Confirm links to the GitHub repo, npm package, and issue tracker are correct.

## Validation

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm run pack:dry-run`
- [ ] `pnpm run pack:smoke-install`
- [ ] Run any additional targeted integration or e2e coverage needed for changed areas.

## Publish

- [ ] Verify `package.json` version matches the intended release.
- [ ] Review `npm view @terminal3/hedera-t3n-plugin version` to avoid accidental duplicate publishes.
- [ ] Publish from a clean working tree with the expected npm account.
- [ ] Re-check the npm package page after publish for README and metadata correctness.

## Submission Follow-Up

- [ ] Update the tested version mentioned in any Hedera Agent Kit listing PR.
- [ ] Keep the upstream PR description aligned with the released npm version and repository README.
- [ ] Optionally open any related ecosystem follow-up PRs, such as ElizaOS plugin registration, as separate changes.
