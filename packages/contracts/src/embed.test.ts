import { describe, expect, it } from "vite-plus/test";

import { EmbedAspectRatioSchema, EmbedDataSchema, type EmbedData } from "./embed";

function normalizedIssues(result: ReturnType<typeof EmbedDataSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

describe("embed persisted contract", () => {
  it("preserves enum order and exact defaults", () => {
    expect(EmbedAspectRatioSchema.options).toEqual(["16/9", "4/3", "1/1", "9/16"]);

    const data: EmbedData = EmbedDataSchema.parse({});

    expect(data).toEqual({
      type: "embed",
      url: "",
      provider: "generic",
      aspectRatio: "16/9",
      caption: "",
    });
  });

  it("keeps authored URLs and provider ids permissive", () => {
    expect(
      EmbedDataSchema.parse({
        url: "  javascript:alert(1)  ",
        provider: "future-provider",
        aspectRatio: "9/16",
        caption: "  Caption  ",
        editorSelection: true,
      }),
    ).toEqual({
      type: "embed",
      url: "  javascript:alert(1)  ",
      provider: "future-provider",
      aspectRatio: "9/16",
      caption: "  Caption  ",
    });
  });

  it("preserves normalized type and enum issues", () => {
    expect(normalizedIssues(EmbedDataSchema.safeParse({ url: 4, aspectRatio: "3/2" }))).toEqual([
      {
        code: "invalid_type",
        path: ["url"],
        message: "Expected string, received number",
      },
      {
        code: "invalid_enum_value",
        path: ["aspectRatio"],
        message: "Invalid enum value. Expected '16/9' | '4/3' | '1/1' | '9/16', received '3/2'",
      },
    ]);
  });
});
