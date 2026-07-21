// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createMoodleLearnerActivityPort } from "./learner-activity-port";

afterEach(() => {
  delete window.ScaffoldMoodleAjax;
});

describe("createMoodleLearnerActivityPort", () => {
  it("loads the complete strict snapshot for the exact Moodle activity and artifact", async () => {
    const snapshot = {
      snapshotVersion: 1 as const,
      artifactId: "moodle-artifact",
      activities: {},
    };
    const call = vi.fn(async (_methodName: string, _args: Record<string, unknown>) => ({
      success: true,
      snapshotJson: JSON.stringify(snapshot),
    }));
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };

    const port = createMoodleLearnerActivityPort(42);

    await expect(port.load({ artifactId: "moodle-artifact" })).resolves.toEqual(snapshot);
    expect(call).toHaveBeenCalledWith("mod_scaffold_load_learner_activity", {
      cmid: 42,
      artifactid: "moodle-artifact",
    });
  });

  it("saves the timestamp-free record and returns the authoritative Moodle record", async () => {
    const authoritativeRecord = {
      activityKind: "checklist",
      data: { checked: { "item-1": true } },
      completed: true,
      updatedAt: "2026-07-17T14:15:00Z",
    };
    const call = vi.fn(async (_methodName: string, _args: Record<string, unknown>) => ({
      success: true,
      recordJson: JSON.stringify(authoritativeRecord),
    }));
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };

    const port = createMoodleLearnerActivityPort(42);
    const record = {
      activityKind: "checklist",
      data: { checked: { "item-1": true } },
      completed: true,
    };

    await expect(
      port.save({ artifactId: "moodle-artifact", blockId: "checklist-1", record }),
    ).resolves.toEqual(authoritativeRecord);
    expect(call).toHaveBeenCalledWith("mod_scaffold_save_learner_activity", {
      cmid: 42,
      artifactid: "moodle-artifact",
      blockid: "checklist-1",
      recordjson: JSON.stringify(record),
    });
    const savedArgs = call.mock.calls[0]?.[1];
    expect(savedArgs).toBeDefined();
    expect(JSON.parse(String(savedArgs?.["recordjson"]))).not.toHaveProperty("updatedAt");
  });

  it("rejects malformed, future, and foreign load responses", async () => {
    const invalidSnapshots = [
      "not-json",
      JSON.stringify({ snapshotVersion: 1, artifactId: "moodle-artifact" }),
      JSON.stringify({ snapshotVersion: 2, artifactId: "moodle-artifact", activities: {} }),
      JSON.stringify({ snapshotVersion: 1, artifactId: "foreign-artifact", activities: {} }),
      JSON.stringify({
        snapshotVersion: 1,
        artifactId: "moodle-artifact",
        activities: {},
        assessmentSnapshot: {},
      }),
    ];

    for (const snapshotJson of invalidSnapshots) {
      window.ScaffoldMoodleAjax = {
        call: async <T>() => ({ success: true, snapshotJson }) as T,
      };

      await expect(
        createMoodleLearnerActivityPort(42).load({ artifactId: "moodle-artifact" }),
      ).rejects.toThrow();
    }
  });

  it("rejects malformed and non-authoritative save responses", async () => {
    const invalidRecords = [
      "not-json",
      JSON.stringify({
        activityKind: "checklist",
        data: {},
        completed: false,
        updatedAt: null,
      }),
      JSON.stringify({
        activityKind: "checklist",
        data: {},
        completed: false,
        updatedAt: "2026-07-17T14:15:00Z",
        score: 1,
      }),
    ];

    for (const recordJson of invalidRecords) {
      window.ScaffoldMoodleAjax = {
        call: async <T>() => ({ success: true, recordJson }) as T,
      };

      await expect(
        createMoodleLearnerActivityPort(42).save({
          artifactId: "moodle-artifact",
          blockId: "checklist-1",
          record: { activityKind: "checklist", data: {}, completed: false },
        }),
      ).rejects.toThrow();
    }
  });
});
