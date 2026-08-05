// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { LearningEvent } from "@scaffold/core/ports";

import { createMoodleLearningEventPort } from "./learning-event-port";

afterEach(() => {
  delete window.ScaffoldMoodleAjax;
});

describe("createMoodleLearningEventPort", () => {
  it("hands the canonical event to the version-2 Moodle activity endpoint", async () => {
    const call = vi.fn(async (_methodName: string, _args: Record<string, unknown>) => ({
      success: true,
    }));
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };
    const event: LearningEvent = {
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
    };
    const port = createMoodleLearningEventPort(42, "https://moodle.example");

    expect(port.rootActivityId).toBe("https://moodle.example/mod/scaffold/view.php?id=42");
    await expect(port.accept(event)).resolves.toBeUndefined();
    expect(call).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledWith("mod_scaffold_accept_learning_event", {
      cmid: 42,
      eventjson: JSON.stringify(event),
    });
  });

  it("propagates host acceptance rejection without retrying", async () => {
    const call = vi.fn(async () => {
      throw new Error("Moodle call failed");
    });
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };

    await expect(
      createMoodleLearningEventPort(42, "https://moodle.example").accept({
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
      }),
    ).rejects.toThrow("Moodle call failed");
    expect(call).toHaveBeenCalledOnce();
  });
});
