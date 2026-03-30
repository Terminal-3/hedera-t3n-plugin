import type { Context } from "hedera-agent-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/agent-registration.js", () => ({
  readCurrentAgentRegistration: vi.fn(),
}));

import { checkAgentRegistrationStatusTool } from "../../src/tools/check-agent-registration-status.js";
import { readCurrentAgentRegistration } from "../../src/utils/agent-registration.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof checkAgentRegistrationStatusTool>["execute"]>[0];
const readCurrentAgentRegistrationMock = vi.mocked(readCurrentAgentRegistration);

const buildTool = () => checkAgentRegistrationStatusTool(context);

describe("CHECK_AGENT_REGISTRATION_STATUS tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns verified success metadata for fully registered agents", async () => {
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
      network: "testnet",
      fullyRegistered: true,
      hasAnyRegistration: true,
      canFetchRecord: true,
      t3nStatus: "registered",
      t3nVerified: true,
      hederaStatus: "registered",
      hederaVerified: true,
    });
    expect(result.humanMessage).toBe(
      "Agent registration is verified on both T3N and Hedera."
    );
  });

  it("returns partial status when Hedera metadata is unavailable", async () => {
    readCurrentAgentRegistrationMock.mockResolvedValue({
      did: "did:t3n:a:test123",
      hederaWallet: "0x" + "1".repeat(40),
      network: "testnet",
      fullyRegistered: false,
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
      network: "testnet",
      fullyRegistered: false,
      hasAnyRegistration: true,
      canFetchRecord: true,
      t3nStatus: "registered",
      t3nVerified: true,
      hederaStatus: "unknown",
      hederaVerified: false,
    });
    expect(result.humanMessage).toBe(
      "Agent registration is present on T3N, but Hedera status could not be confirmed."
    );
  });

  it("sanitizes missing identity configuration errors", async () => {
    readCurrentAgentRegistrationMock.mockRejectedValue(
      new Error("Agent identity configuration path not set. Please run pnpm create-identity.")
    );

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.raw).toEqual({
      success: false,
      error: "IDENTITY_CONFIG_MISSING",
    });
    expect(result.humanMessage).toBe(
      "Agent identity configuration is not available. Run `pnpm create-identity` and set `AGENT_IDENTITY_CONFIG_PATH`, then retry."
    );
  });

  it("rejects extra parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      identityConfigPath: "/tmp/not-allowed.json",
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
