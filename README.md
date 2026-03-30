# Hedera T3N Plugin

## Plugin Name

`@terminal3/hedera-t3n-plugin` was built by Terminal 3 for T3N agent identity workflows. It gives Hedera Agent Kit builders a practical bridge into T3N so agents can create local identities, open authenticated T3N sessions, track user DIDs, inspect profile-field availability, and inspect T3N plus Hedera registration state.

This open-source packaging pass keeps the existing user-DID, profile, session, and registration-inspection capabilities intact. The cleanup removes stale legacy compliance wording and private-package assumptions, not active runtime features.

## T3N Context

T3N is Terminal 3's runtime, identity, and trust layer for building verified application, agent, and user flows. In this plugin's scope, that shows up as T3N sessions, `did:t3n` identities, profile lookups, and agent registration flows.

The purpose of this plugin is not to expose all of T3N. It packages the Hedera Agent Kit path into the parts of T3N that matter for local agent identity, authenticated sessions, profile-aware checks, and registration readback, so app builders do not need to wire that lifecycle themselves. Use it when your Hedera-based agent needs to:

- create and validate a local T3N agent identity
- authenticate into T3N and verify the session is still usable
- work with stored user DIDs before profile checks
- inspect whether an agent is registered across both T3N and Hedera

### Installation

```bash
npm install @terminal3/hedera-t3n-plugin hedera-agent-kit @hashgraph/sdk
```

### Usage

```ts
import { Client, PrivateKey } from "@hashgraph/sdk";
import { AgentMode, HederaLangchainToolkit } from "hedera-agent-kit";
import { hederaT3nPlugin } from "@terminal3/hedera-t3n-plugin";

const client = Client.forTestnet().setOperator(
  process.env.HEDERA_ACCOUNT_ID!,
  PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY!)
);

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: {
    context: {
      mode: AgentMode.AUTONOMOUS,
    },
    plugins: [hederaT3nPlugin],
    tools: [],
  },
});

const tools = toolkit.getTools();
```

Set `AGENT_IDENTITY_CONFIG_PATH` in the host runtime before invoking tools that read the local identity file.

### Functionality

**Hedera T3N Plugin**
_Identity readiness, session auth, user-DID tracking, profile inspection, and registration-readback tools for a locally managed T3N agent identity._

| Tool Name | Description | Usage |
| --- | --- | --- |
| `ADD_USER_DID` | Stores one user DID plus a local remark for later profile checks. | Parameters: `userDid`, `remark`. Replaces any previously stored DID in the current runtime. |
| `CHECK_AGENT_REGISTRATION_STATUS` | Summarizes whether the current agent is registered on T3N and Hedera ERC-8004. | No parameters. Requires `AGENT_IDENTITY_CONFIG_PATH` and a testnet/mainnet identity. |
| `CHECK_MY_PROFILE_FIELDS` | Checks whether requested fields exist for the currently stored user DID without returning values. | Parameters: `fields`. Requires an active T3N session plus a stored user DID. |
| `CHECK_PROFILE_FIELD_EXISTENCE` | Checks whether requested fields exist for another T3N profile without returning values. | Parameters: `fields`, optional `targetDid`. Requires an active T3N session. |
| `CREATE_T3N_AUTH_SESSION` | Creates or reuses an authenticated in-memory T3N session for the current identity. | No parameters. Requires a valid local identity file and reachable T3N endpoints for non-local environments. |
| `FETCH_AGENT_REGISTRATION_RECORD` | Returns the detailed T3N and Hedera registration records for the current agent. | No parameters. Requires `AGENT_IDENTITY_CONFIG_PATH` and a testnet/mainnet identity. |
| `GET_USER_DID` | Reads stored user DIDs from the current runtime. | Optional parameters: `userDid`, `remark`. With no filters it returns every tracked DID. |
| `HAS_AGENT_IDENTITY_CONFIG` | Validates the local identity JSON referenced by `AGENT_IDENTITY_CONFIG_PATH`. | No parameters. Requires `AGENT_IDENTITY_CONFIG_PATH` to point to a readable identity file. |
| `PROFILE_FIELD_MAPPING` | Maps user-friendly profile field names to the T3N JSONPath selectors used for lookup filters. | Parameter: `fields`. Returns supported mappings plus unsupported field names. |
| `VALIDATE_T3N_AUTH_SESSION` | Confirms that the current in-memory T3N session is authenticated and still usable. | No parameters. Call after `CREATE_T3N_AUTH_SESSION`. |

## CLI Workflows

The package ships a `hedera-t3n-plugin` binary.

```bash
hedera-t3n-plugin init
hedera-t3n-plugin create-identity --env testnet --path ./output/identities/agent_identity.json
hedera-t3n-plugin ipfs-submit-agent-card-pinata --path ./output/identities/agent_identity.json --jwt <PINATA_JWT>
hedera-t3n-plugin register-agent-erc8004 --env testnet --path ./output/identities/agent_identity.json --agent-uri https://gateway.pinata.cloud/ipfs/<cid>
```

- `init` creates local `.env` and `.env.secret.pinata` files from the packaged examples.
- `register-agent-erc8004` supports `testnet` and `mainnet` only.
- Registration stays explicit: the plugin exposes registration inspection tools, while publishing the public agent card and writing ERC-8004 state happen through the CLI or programmatic APIs.

## Programmatic APIs

```ts
import {
  createIdentity,
  registerAgentErc8004,
  submitAgentCardToPinata,
} from "@terminal3/hedera-t3n-plugin";

const identity = await createIdentity({
  networkTier: "testnet",
  outputPath: "./output/identities/agent_identity.json",
});

const upload = await submitAgentCardToPinata({
  identityConfigPath: identity.credentials_path,
  jwt: process.env.PINATA_JWT,
});

const registration = await registerAgentErc8004({
  networkTier: "testnet",
  identityConfigPath: identity.credentials_path,
  agentUri: upload.gatewayUrl,
});
```

## Environment

- `HEDERA_NETWORK`: defaults identity creation to `testnet`; supported values are `local`, `testnet`, and `mainnet`
- `AGENT_IDENTITY_CONFIG_PATH`: local identity JSON path used by plugin tools and registration helpers
- `HEDERA_ACCOUNT_ID` / `HEDERA_PRIVATE_KEY`: required for live Hedera registration
- `PINATA_JWT` or `PINATA_API_KEY` + `PINATA_API_SECRET`: required for the Pinata upload helper
- `T3N_API_URL`, `T3N_RUNTIME_API_URL`, `T3N_ML_KEM_PUBLIC_KEY(_FILE)`: optional advanced overrides for local CCF or custom T3N environments
- `T3N_AGENT_REGISTRY_SCRIPT_VERSION`, `T3N_USER_SCRIPT_VERSION`: optional overrides when a target cluster cannot resolve `/api/contracts/current`
- `T3N_LOCAL_BACKEND=ccf`: opt in to a live local CCF backend when `HEDERA_NETWORK=local`

## Development

```bash
pnpm install
pnpm validate
pnpm test:e2e
```

- `pnpm validate` runs lint, unit tests, integration tests, build, `npm pack --dry-run`, and a tarball smoke-install check
- `pnpm test:e2e` covers identity validation, registration inspection, session auth, user-DID tracking, profile-field lookup guards, and delegated self-only checks; live registration phases remain opt-in and may require explicit `T3N_API_URL` / `T3N_RUNTIME_API_URL` overrides when the public endpoint does not expose the agent-registry contract
- additional test guidance lives in `tests/README.md`

## Release Notes

- `2.0.0` is the first public npm/open-source packaging pass for this plugin surface
- existing user-DID, profile, session, and registration-inspection tools remain available
- stale legacy compliance wording and GitHub-Packages-only instructions were removed
- readiness docs: `OPEN_SOURCE_READINESS_MATRIX.md`, `RELEASE_CHECKLIST.md`, `OPEN_SOURCE_NOTES.md`
