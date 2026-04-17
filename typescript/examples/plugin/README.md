# Hedera T3N Plugin Example

This example mirrors the upstream Hedera Agent Kit `plugin` example, but the
showcase is `hedera-t3n-plugin` instead of a toy plugin.

It demonstrates two things:

- how to import and reuse `hederaT3nPlugin`
- how to compose it with your own local plugin tool without forking the package

The base plugin exposes only the contracted public tools:

- `AUTH_AGENT_CONTEXT`
- `PRIVATE_DATA_PROCESSING`

## Files

- `example-plugin.ts`: defines `composedT3nPlugin`, which appends a local
  guidance tool to the built-in T3N plugin tools

## Install

```bash
pnpm install
```

## Validate

```bash
pnpm typecheck
```

`typecheck` rebuilds the parent `@terminal3/hedera-t3n-plugin` package first so the
local `file:../../..` dependency resolves against fresh `dist/` output.

## Run

```bash
pnpm showcase
```

The showcase script prints the tool methods exposed by `hederaT3nPlugin` and by
the composed plugin variant so you can see exactly what gets added.
