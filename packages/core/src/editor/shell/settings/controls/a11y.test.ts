import { describe, expect, it } from "vite-plus/test";

import { settingsFieldA11yIds, settingsFieldControlId, settingsFieldDomId } from "./a11y";

describe("settings field a11y helpers", () => {
  it("builds stable control ids from settings field names", () => {
    expect(settingsFieldControlId("maxAttempts")).toBe("block-config-maxAttempts");
    expect(settingsFieldControlId("encoding.x.columnId")).toBe("block-config-encoding-x-columnId");
  });

  it("sanitizes explicit field ids", () => {
    expect(settingsFieldDomId("chart type")).toBe("chart-type");
    expect(settingsFieldDomId("")).toBe("settings-field");
  });

  it("composes help and error ids for aria-describedby", () => {
    expect(
      settingsFieldA11yIds("embed-url", {
        hasError: true,
        hasHelp: true,
      }),
    ).toEqual({
      id: "embed-url",
      helpId: "embed-url-help",
      errorId: "embed-url-error",
      describedBy: "embed-url-help embed-url-error",
    });
  });

  it("omits aria-describedby when there is no related text", () => {
    expect(settingsFieldA11yIds("chart-type")).toEqual({
      id: "chart-type",
    });
  });
});
