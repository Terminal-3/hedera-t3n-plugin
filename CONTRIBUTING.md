# Contributing

Thanks for contributing to `@terminal3/hedera-t3n-plugin`.

## Prerequisites

- Node.js 18+
- pnpm 9+

## Local setup

```bash
pnpm install
pnpm build
```

## Validation commands

- `pnpm lint`
- `pnpm lint:fix`
- `pnpm test`
- `pnpm test:integration`
- `pnpm validate`

Run `pnpm validate` before opening a pull request unless you have a documented reason to run a narrower subset.

## Development guidelines

- Keep changes scoped to one feature or fix per pull request.
- Prefer concise imperative commits; Conventional Commit style is encouraged.
- Add or update tests when behavior changes.
- Keep public API, CLI behavior, and README examples aligned.
- Follow the repository conventions in `AGENTS.md` for structure, naming, and validation expectations.

## Pull requests

PRs should include:

- a clear description of the problem and solution
- affected areas
- verification commands that were run
- linked ticket or context when available

## Issues

- Use GitHub Issues for bugs, feature requests, and documentation problems.
- Do not open public issues for security vulnerabilities; use the private process in `SECURITY.md` instead.
