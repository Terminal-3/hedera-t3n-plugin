import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runCreateIdentityCommand: vi.fn(),
  runInitCommand: vi.fn(),
  runIpfsSubmitAgentCardPinataCommand: vi.fn(),
  runRegisterAgentErc8004Command: vi.fn(),
}));

vi.mock("../../src/cli/create-identity.js", () => ({
  runCreateIdentityCommand: mocks.runCreateIdentityCommand,
}));

vi.mock("../../src/cli/init.js", () => ({
  runInitCommand: mocks.runInitCommand,
}));

vi.mock("../../src/cli/ipfs-submit-agent-card-pinata.js", () => ({
  runIpfsSubmitAgentCardPinataCommand: mocks.runIpfsSubmitAgentCardPinataCommand,
}));

vi.mock("../../src/cli/register-agent-erc8004.js", () => ({
  runRegisterAgentErc8004Command: mocks.runRegisterAgentErc8004Command,
}));

import { runCli } from "../../src/cli/index.js";

describe("package CLI dispatcher", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes create-identity", async () => {
    await runCli(["create-identity", "--env", "testnet"], { HEDERA_NETWORK: "local" });

    expect(mocks.runCreateIdentityCommand).toHaveBeenCalledWith(
      ["--env", "testnet"],
      { HEDERA_NETWORK: "local" }
    );
  });

  it("routes init", async () => {
    await runCli(["init", "--force"], {});

    expect(mocks.runInitCommand).toHaveBeenCalledWith(["--force"]);
  });

  it("routes ipfs-submit-agent-card-pinata", async () => {
    await runCli(["ipfs-submit-agent-card-pinata", "--jwt", "token"], {});

    expect(mocks.runIpfsSubmitAgentCardPinataCommand).toHaveBeenCalledWith(
      ["--jwt", "token"],
      {}
    );
  });

  it("routes register-agent-erc8004", async () => {
    await runCli(["register-agent-erc8004", "--path", "agent.json"], {});

    expect(mocks.runRegisterAgentErc8004Command).toHaveBeenCalledWith(
      ["--path", "agent.json"],
      {}
    );
  });
});
