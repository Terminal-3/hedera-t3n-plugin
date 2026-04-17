# Hedera Agent Kit - Terminal 3 Network (T3N) Plugin

A plugin for [Hedera Agent Kit JS](https://github.com/hashgraph/hedera-agent-kit-js) that provides access to [Terminal 3 Network (T3N)](https://docs.terminal3.io/t3n/) to enable identity verification, authentication, and last mile-delivery or selective disclosure of private and sensitive information for AI-driven applications, ensuring compliant and auditable interactions.

## Overview

This plugin enables `AI agents` to interact with [Terminal 3 Network (T3N)](https://docs.terminal3.io/t3n/), a decentralized network for user data and AI agent governance. The plugin provides the following tools:

- PRIVATE_DATA_PROCESSING
- KYC

## Installation

`npm install @terminal3/hedera-t3n-plugin @hashgraph/hedera-agent-kit @hashgraph/hedera-agent-kit-langchain @hiero-ledger/sdk`

## Prerequisite

Before your AI agent can access [T3N](https://docs.terminal3.io/t3n/), you must create its identity and register it in both T3N and the Hedera ERC-8004 identity registry via CLI.

### AI agent identity creation

Create an AI agent identity (`did:t3n`) via a Hedera wallet.

1. Run the identity creation CLI:

   ```bash
   npx hedera-t3n-plugin create-identity --env mainnet
   ```

2. The CLI will:
   - generate a `secp256k1` keypair
   - derive the Hedera EVM-compatible wallet address
   - derive the canonical `did:t3n:<full-hex-eth-address-without-0x>` identifier
   - write the identity credentials to a local JSON file
   - create a local `agent_card.json` scaffold

3. Capture the generated identity details, including:
   - `did:t3n`
   - Hedera wallet / EVM-compatible address
   - identity config path
   - local `agent_card.json` path

4. Host the generated `agent_card.json` at a public HTTP(S) URL before registration. This repository includes a script that helps you upload it to IPFS via Pinata:

   ```bash
   npx hedera-t3n-plugin ipfs-submit-agent-card-pinata
   ```

   Set Pinata credentials in `.env.secret.pinata` (see `.env.secret.pinata.example`) or pass `--jwt`, `--api-key`, and `--api-secret` to the command. Ensure `AGENT_IDENTITY_CONFIG_PATH` points at your identity file (or pass `--path`). The CLI prints a gateway URL you can use as the public `agentURI` when registering.

### AI agent registration

Register an agent in both T3N and Hedera ERC-8004 identity registry.

1. Ensure the following prerequisites are met:
   - identity was created with `create-identity`
   - the configured Hedera account is funded with HBAR for gas
   - the `agent_card.json` is hosted at a public HTTP(S) `agentURI` and returns valid JSON

2. Run the registration CLI:

   ```bash
   npx hedera-t3n-plugin register-agent-erc8004 --agent-uri <public-agent-uri>
   ```

3. The CLI will:
   - load the local identity config
   - validate the public `agentURI`
   - authenticate with the T3N node
   - register the agent on the T3N agent registry
   - register the same canonical `did:t3n` and `agentURI` in Hedera ERC-8004
   - persist registration metadata back to the identity file

## Tools

### PRIVATE_DATA_PROCESSING

Privately process user private data without agent seeing the user data.

Currently, it only supports private checks to verify whether requested user profile fields exist on T3N, without revealing any profile values to the agent. Additional capabilities will be added soon.

**Input**

- `userDid`: target user `did:t3n`
- `fields`: list of friendly field names to check

**What it does**

- authenticates agent context when needed
- maps friendly field names to profile selectors
- returns only field existence and downstream data-availability context

**Returns**

- `fieldExistence`: boolean existence flags per requested field
- `missingFields`: requested fields that are not present
- `unsupportedFields`: requested fields not supported
- `guidance`: onboarding/profile URLs and next steps for missing fields

**Privacy property**

- the agent never receives raw user profile values

### KYC

[Coming soon] Direct the client (i.e., AI agent developer or end users) to conduct KYC and generate a KYC smart verifiable credential (SVC) / presentation (VP).

## Environment Variables

### Required for CLI

- `AGENT_IDENTITY_CONFIG_PATH`: path to the local agent identity JSON used by CLI flows and private data processing workflows
- `HEDERA_ACCOUNT_ID`: Hedera account ID used for ERC-8004 registration signing
- `HEDERA_PRIVATE_KEY`: Hedera private key used for ERC-8004 registration signing
- `HEDERA_IDENTITY_REGISTRY_ADDRESS`: Hedera ERC-8004 identity registry contract address

### Required for Autonomous Mode

- `HEDERA_NETWORK`: network tier (`local`, `testnet`, or `mainnet`; defaults to `testnet`)
- `HEDERA_IDENTITY_REGISTRY_ADDRESS`: optional override for the Hedera ERC-8004 identity registry contract address
- `HEDERA_ACCOUNT_ID`: Hedera account ID
- `HEDERA_PRIVATE_KEY`: ECDSA private key (`0x...` format)

### Optional

For additional repo-local development, test, and demo configuration options, see `.env.example`.
