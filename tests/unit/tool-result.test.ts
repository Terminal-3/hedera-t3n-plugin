import { describe, expect, it } from "vitest";

import { parseToolOutput } from "../../src/utils/tool-result.js";

describe("parseToolOutput", () => {
  it("parses valid tool result json", () => {
    expect(
      parseToolOutput(JSON.stringify({ raw: { success: true }, humanMessage: "ok" }))
    ).toEqual({
      raw: { success: true },
      humanMessage: "ok",
    });
  });

  it("treats empty output as an error result", () => {
    expect(parseToolOutput("")).toEqual({
      raw: { success: false, error: "" },
      humanMessage: "",
    });
  });

  it("treats error-prefixed output as an error result", () => {
    expect(parseToolOutput("Error: request failed")).toEqual({
      raw: { success: false, error: "Error: request failed" },
      humanMessage: "Error: request failed",
    });
  });

  it("treats malformed json as an error result", () => {
    expect(parseToolOutput("{bad json")).toEqual({
      raw: { success: false, error: "{bad json" },
      humanMessage: "{bad json",
    });
  });
});
