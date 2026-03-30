import type { Context } from "hedera-agent-kit";
import { describe, expect, it } from "vitest";

import { profileFieldMappingTool } from "../../src/tools/profile-field-mapping.js";
import {
  ALLOWED_PROFILE_FIELDS,
  mapFieldName,
} from "../../src/utils/profile-field-mapping.js";

const context: Context = {} as Context;
const mockClient =
  null as unknown as Parameters<ReturnType<typeof profileFieldMappingTool>["execute"]>[0];

const buildTool = () => profileFieldMappingTool(context);

describe("PROFILE_FIELD_MAPPING tool", () => {
  it("maps supported fields and aliases to JSONPath selectors", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: ["first_name", "emailAddress", "nickname"],
    });

    expect(result.humanMessage).toBe("Profile field mapping completed.");
    expect(result.raw).toMatchObject({
      success: true,
      mappedFields: [
        {
          field: "givenName",
          jsonPath: "$.givenName",
          tsonPath: "$.givenName",
        },
        {
          field: "emailAddress",
          jsonPath: "$.email",
          tsonPath: "$.email",
        },
        {
          field: "nickname",
          jsonPath: "$.userName",
          tsonPath: "$.userName",
        },
      ],
      unsupportedFields: [],
    });
  });

  it("separates unsupported fields", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: ["first_name", "favorite_color"],
    });

    expect(result.raw).toMatchObject({
      success: true,
      mappedFields: [
        {
          field: "givenName",
          jsonPath: "$.givenName",
          tsonPath: "$.givenName",
        },
      ],
      unsupportedFields: [
        {
          field: "favorite_color",
          reason: "T3N does not support this field yet",
        },
      ],
    });
  });

  it("returns all supported field names", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: [],
    });

    const raw = result.raw as {
      success: boolean;
      allSupportedFields: string[];
    };

    expect(raw.success).toBe(true);
    expect(raw.allSupportedFields).toContain("givenName");
    expect(raw.allSupportedFields).toContain("first_name");
    expect(raw.allSupportedFields).toContain("nickname");
  });

  it("maps every declared allowed profile field", () => {
    for (const field of ALLOWED_PROFILE_FIELDS) {
      const result = mapFieldName(field);
      expect(result.supported).toBe(true);
      expect(result.mapped).toBeTruthy();
    }
  });

  it("rejects invalid parameters", async () => {
    const tool = buildTool();
    const result = await tool.execute(mockClient, context, {
      fields: ["first_name"],
      note: "unexpected",
    });

    expect(result.raw).toEqual({
      success: false,
      error: "INVALID_PARAMETERS",
    });
    expect(result.humanMessage).toBe(
      "Invalid parameters. Provide a `fields` array of strings only."
    );
  });
});
