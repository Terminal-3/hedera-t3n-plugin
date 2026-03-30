import type { Context } from "hedera-agent-kit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getUserDidTool } from "../../src/tools/get-user-did.js";
import { addTrackedUserDid, resetTrackedUserDidsForTests } from "../../src/utils/user-did-store.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof getUserDidTool>["execute"]>[0];

const buildTool = () => getUserDidTool(context);
const originalHederaNetwork = process.env.HEDERA_NETWORK;

describe("GET_USER_DID tool", () => {
  beforeEach(() => {
    resetTrackedUserDidsForTests();
    process.env.HEDERA_NETWORK = originalHederaNetwork;
  });

  afterEach(() => {
    resetTrackedUserDidsForTests();
    if (originalHederaNetwork === undefined) {
      delete process.env.HEDERA_NETWORK;
    } else {
      process.env.HEDERA_NETWORK = originalHederaNetwork;
    }
  });

  it("returns all tracked user DIDs when no filters are provided", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Loan applicant");
    addTrackedUserDid("did:t3n:a:user-2", "Primary borrower");

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.humanMessage).toBe("Found 2 stored user DIDs.");
    expect(result.raw).toMatchObject({
      success: true,
      userDids: [
        {
          did: "did:t3n:a:user-1",
          remark: "Loan applicant",
          timestamp: expect.any(String),
        },
        {
          did: "did:t3n:a:user-2",
          remark: "Primary borrower",
          timestamp: expect.any(String),
        },
      ],
    });
  });

  it("supports exact matching by userDid", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Loan applicant");
    addTrackedUserDid("did:t3n:a:user-2", "Primary borrower");

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:user-2",
    });

    expect(result.humanMessage).toBe("Found 1 stored user DID.");
    expect(result.raw).toMatchObject({
      success: true,
      userDids: [
        {
          did: "did:t3n:a:user-2",
          remark: "Primary borrower",
          timestamp: expect.any(String),
        },
      ],
    });
  });

  it("supports case-insensitive partial matching by remark", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Loan applicant");
    addTrackedUserDid("did:t3n:a:user-2", "Primary borrower");

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      remark: "loan",
    });

    expect(result.humanMessage).toBe("Found 1 stored user DID.");
    expect(result.raw).toMatchObject({
      success: true,
      userDids: [
        {
          did: "did:t3n:a:user-1",
          remark: "Loan applicant",
          timestamp: expect.any(String),
        },
      ],
    });
  });

  it("intersects userDid and remark filters when both are provided", async () => {
    addTrackedUserDid("did:t3n:a:user-1", "Loan applicant");
    addTrackedUserDid("did:t3n:a:user-2", "Loan applicant backup");

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:user-2",
      remark: "backup",
    });

    expect(result.humanMessage).toBe("Found 1 stored user DID.");
    expect(result.raw).toMatchObject({
      success: true,
      userDids: [
        {
          did: "did:t3n:a:user-2",
          remark: "Loan applicant backup",
          timestamp: expect.any(String),
        },
      ],
    });
  });

  it("returns lookup instructions when no stored user DIDs exist", async () => {
    process.env.HEDERA_NETWORK = "testnet";

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {});

    expect(result.humanMessage).toBe("No stored user DIDs found.");
    expect(result.raw).toMatchObject({
      success: true,
      userDids: [],
      instructions: {
        findUserDid: "https://staging.trinity.terminal3.io/profile",
        registerUserDid: "https://staging.trinity.terminal3.io/onboarding",
        note: expect.stringContaining("No stored user DIDs were found."),
      },
    });
  });

  it("rejects empty optional filters when provided", async () => {
    const tool = buildTool();

    const emptyDidResult = await tool.execute(mockClient, context, {
      userDid: "   ",
    });
    expect(emptyDidResult.raw).toEqual({
      success: false,
      error: "INVALID_USER_DID_FILTER",
    });
    expect(emptyDidResult.humanMessage).toBe(
      "The optional `userDid` filter cannot be empty."
    );

    const emptyRemarkResult = await tool.execute(mockClient, context, {
      remark: "   ",
    });
    expect(emptyRemarkResult.raw).toEqual({
      success: false,
      error: "INVALID_REMARK_FILTER",
    });
    expect(emptyRemarkResult.humanMessage).toBe(
      "The optional `remark` filter cannot be empty."
    );
  });

  it("rejects extra parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:user-1",
      note: "unexpected",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_PARAMETERS",
    });
    expect(result.humanMessage).toBe(
      "Invalid parameters. Provide optional `userDid` and `remark` string values only."
    );
  });
});
