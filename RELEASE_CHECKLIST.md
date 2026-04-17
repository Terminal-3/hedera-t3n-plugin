# Release Checklist

Use this checklist before publishing a new public release of `@terminal3/hedera-t3n-plugin`.

## Pre-Release

1. Confirm the README, readiness matrix, and migration notes match the shipped tool surface.
2. Verify `package.json` metadata (`version`, `exports`, `files`, `engines`, `publishConfig.access`).
3. Confirm `.env.example` and `.env.secret.pinata.example` are current and contain placeholders only.
4. Review `OPEN_SOURCE_READINESS_MATRIX.md` and close any non-manual items.

## Validation

```bash
pnpm install
pnpm validate
```

Optional live verification when credentials and infrastructure are available:

```bash
pnpm test:e2e -- --ipfs-pinata
```

## Security and Packaging

1. Ensure no secrets, generated identities, or local `.env` files are tracked.
2. Confirm `npm pack --dry-run` only includes the intended runtime assets and release docs.
3. Verify the tarball smoke-install still imports the package and exposes the CLI.

## Publish

```bash
pnpm release
```

That command runs the validation suite, publishes the package with public access, and creates the local release tag.

After publish succeeds:

```bash
git push origin hedera-t3n-plugin-v<version>
```

## Post-Publish

1. Publish release notes that call out the public npm install path and preserved runtime features.
2. Update Hedera Agent Kit third-party plugin listings if needed.
3. Verify the npm page and install command work from a clean consumer environment.
