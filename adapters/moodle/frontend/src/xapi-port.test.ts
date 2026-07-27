// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { XapiStatementTemplate } from "@scaffold/core/ports";

import { createMoodleXapiPort } from "./xapi-port";

afterEach(() => {
  delete window.ScaffoldMoodleAjax;
});

describe("createMoodleXapiPort", () => {
  it("hands the Core template to the trusted Moodle activity endpoint", async () => {
    const call = vi.fn(async (_methodName: string, _args: Record<string, unknown>) => ({
      success: true,
    }));
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };
    const statement = {
      id: "00000000-0000-4000-8000-000000000001",
      timestamp: "2026-07-27T12:00:00.000Z",
      verb: {
        id: "http://adlnet.gov/expapi/verbs/initialized",
        display: { en: "initialized" },
      },
      object: {
        objectType: "Activity",
        id: "https://moodle.example/mod/scaffold/view.php?id=42",
      },
    } as XapiStatementTemplate;
    const port = createMoodleXapiPort(42, "https://moodle.example");

    expect(port.activityId).toBe("https://moodle.example/mod/scaffold/view.php?id=42");
    await expect(port.send(statement)).resolves.toBeUndefined();
    expect(call).toHaveBeenCalledWith("mod_scaffold_accept_xapi_statement", {
      cmid: 42,
      statementjson: JSON.stringify(statement),
    });
  });
});
