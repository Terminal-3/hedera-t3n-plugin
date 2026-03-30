import type { Context } from "hedera-agent-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/agent-registration.js", () => ({
  readCurrentAgentRegistration: vi.fn(),
}));

import { fetchAgentRegistrationRecordTool } from "../../src/tools/fetch-agent-registration-record.js";
import { readCurrentAgentRegistration } from "../../src/utils/agent-registration.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof fetchAgentRegistrationRecordTool>["execute"]>[0];
const readCurrentAgentRegistrationMock = vi.mocked(readCurrentAgentRegistration);

const buildTool = () => fetchAgentRegistrationRecordTool(context);

describe("FETCH_AGENT_REGISTRATION_RECORD tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns sanitized registration records for the current agent", async () => {
    readCurrentAgentRegistrationMock.mockResolvedValue({
      did: "did:t3n:a:test123",
      hederaWallet: "0x" + "1".repeat(40),
      network: "testnet",
      fullyRegistered: true,
      t3n: {
        status: "registered",
        reason: "record_found",
        verified: true,
        record: {
          agent_uri: "https://agent.example/.well-known/agent_card.json",
          registered_at: 10,
          updated_at: 12,
          owner: "0x" + "1".repeat(40),
        },
      },
      hedera: {
        status: "registered",
        reason: "record_found",
        verified: true,
        agentId: "9",
        txHash: "0x" + "2".repeat(64),
        record: {
          agentId: "9",
          owner: "0x" + "1".repeat(40),
          tokenUri: "https://agent.example/.well-known/agent_card.json",
          chainId: 296,
          identityRegistryAddress: "0x" + "3".repeat(40),
        },
      },
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: true,
      did: "did:t3n:a:test123",
      network: "testnet",
      fullyRegistered: true,
      t3n: {
        status: "registered",
        verified: true,
        reason: "record_found",
        record: {
          agentUri: "https://agent.example/.well-known/agent_card.json",
          registeredAt: 10,
          updatedAt: 12,
          owner: "0x" + "1".repeat(40),
        },
      },
      hedera: {
        status: "registered",
        verified: true,
        reason: "record_found",
        record: {
          agentId: "9",
          owner: "0x" + "1".repeat(40),
          tokenUri: "https://agent.example/.well-known/agent_card.json",
          chainId: 296,
          identityRegistryAddress: "0x" + "3".repeat(40),
          txHash: "0x" + "2".repeat(64),
        },
      },
    });
    expect(result.humanMessage).toBe(
      "Fetched the current agent registration records from T3N and Hedera."
    );
  });

  it("returns empty records when nothing has been registered", async () => {
    readCurrentAgentRegistrationMock.mockResolvedValue({
      did: "did:t3n:a:test123",
      hederaWallet: "0x" + "1".repeat(40),
      network: "testnet",
      fullyRegistered: false,
      t3n: {
        status: "not_registered",
        reason: "record_not_found",
        verified: false,
        record: null,
      },
      hedera: {
        status: "unknown",
        reason: "metadata_missing",
        verified: false,
        record: null,
      },
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: true,
      did: "did:t3n:a:test123",
      network: "testnet",
      fullyRegistered: false,
      t3n: {
        status: "not_registered",
        verified: false,
        reason: "record_not_found",
        record: null,
      },
      hedera: {
        status: "unknown",
        verified: false,
        reason: "metadata_missing",
        record: null,
      },
    });
    expect(result.humanMessage).toBe(
      "No registration records were found for the current agent."
    );
  });

  it("sanitizes invalid identity configuration errors", async () => {
    readCurrentAgentRegistrationMock.mockRejectedValue(
      new Error("The file at /tmp/agent.json contains invalid JSON.")
    );

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: false,
      error: "IDENTITY_CONFIG_INVALID",
    });
    expect(result.humanMessage).toBe(
      "Agent identity configuration is invalid. Regenerate or fix the local identity file before retrying."
    );
  });

  it("rejects extra parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      did: "did:t3n:a:someone-else",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_PARAMETERS",
    });
    expect(result.humanMessage).toBe(
      "Invalid parameters. This tool does not accept any parameters."
    );
    expect(readCurrentAgentRegistrationMock).not.toHaveBeenCalled();
  });
});
