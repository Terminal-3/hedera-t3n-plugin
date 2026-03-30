import type { Context } from "hedera-agent-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/t3n-session.js", () => ({
  getValidatedT3nSessionState: vi.fn(),
}));

import { addUserDidTool } from "../../src/tools/add-user-did.js";
import { getValidatedT3nSessionState } from "../../src/utils/t3n-session.js";
import {
  getAllTrackedUserDids,
  getTrackedUserDidByDid,
  resetTrackedUserDidsForTests,
} from "../../src/utils/user-did-store.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof addUserDidTool>["execute"]>[0];
const getValidatedT3nSessionStateMock = vi.mocked(getValidatedT3nSessionState);

const buildTool = () => addUserDidTool(context);

describe("ADD_USER_DID tool", () => {
  beforeEach(() => {
    resetTrackedUserDidsForTests();
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: false,
      reason: "no_session",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetTrackedUserDidsForTests();
  });

  it("stores a user DID and remark successfully", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:test-user",
      remark: "Loan applicant",
    });

    expect(result.raw).toEqual({
      success: true,
      userDid: "did:t3n:a:test-user",
      remark: "Loan applicant",
    });
    expect(result.humanMessage).toBe("User DID stored successfully.");
    expect(getTrackedUserDidByDid("did:t3n:a:test-user")).toHaveLength(1);
  });

  it("trims whitespace before storing values", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "  did:t3n:a:test-user  ",
      remark: "  Loan applicant  ",
    });

    expect(result.raw).toEqual({
      success: true,
      userDid: "did:t3n:a:test-user",
      remark: "Loan applicant",
    });
  });

  it("replaces the previously stored DID when re-run", async () => {
    const tool = buildTool();

    await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:first-user",
      remark: "First user",
    });

    const result = await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:second-user",
      remark: "Second user",
    });

    expect(result.raw).toEqual({
      success: true,
      userDid: "did:t3n:a:second-user",
      remark: "Second user",
    });
    expect(getAllTrackedUserDids()).toHaveLength(1);
    expect(getTrackedUserDidByDid("did:t3n:a:first-user")).toHaveLength(0);
    expect(getTrackedUserDidByDid("did:t3n:a:second-user")).toHaveLength(1);
  });

  it("rejects an empty userDid", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "   ",
      remark: "Loan applicant",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_USER_DID",
    });
    expect(result.humanMessage).toBe("The `userDid` value cannot be empty.");
  });

  it("rejects an empty remark", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:test-user",
      remark: "   ",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_REMARK",
    });
    expect(result.humanMessage).toBe("The `remark` value cannot be empty.");
  });

  it("rejects using the authenticated agent DID as a user DID", async () => {
    getValidatedT3nSessionStateMock.mockReturnValue({
      isValid: true,
      client: {} as never,
      did: "did:t3n:a:test-agent",
      networkTier: "testnet",
      baseUrl: "https://cn-api.sg.staging.t3n.terminal3.io",
      identityPath: "/tmp/agent_identity.json",
    });

    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:test-agent",
      remark: "Should fail",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "AGENT_DID_NOT_ALLOWED",
    });
    expect(result.humanMessage).toBe(
      "The provided user DID matches the authenticated agent DID. Store a separate user DID instead."
    );
  });

  it("rejects extra parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      userDid: "did:t3n:a:test-user",
      remark: "Loan applicant",
      note: "unexpected",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_PARAMETERS",
    });
    expect(result.humanMessage).toBe(
      "Invalid parameters. Provide required `userDid` and `remark` string values."
    );
  });
});
