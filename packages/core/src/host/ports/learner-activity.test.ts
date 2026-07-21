import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import type {
  LearnerActivityData,
  LearnerActivityRecord,
  LearnerActivitySnapshot,
} from "@scaffold/contracts";
import type {
  LearnerActivityLoadRequest,
  LearnerActivityPort,
  LearnerActivitySaveRecord,
  LearnerActivitySaveRequest,
} from "./learner-activity";

const record: LearnerActivityRecord = {
  activityKind: "checklist",
  data: { checkedItemIds: ["item-1"] },
  completed: false,
  updatedAt: "2026-07-17T10:00:00Z",
};

const snapshot: LearnerActivitySnapshot = {
  snapshotVersion: 1,
  artifactId: "course-1",
  activities: { "block-1": record },
};

describe("LearnerActivityPort", () => {
  it("uses the exact Contract-owned load and save boundary", async () => {
    const loadRequest: LearnerActivityLoadRequest = { artifactId: "course-1" };
    const saveRequest: LearnerActivitySaveRequest = {
      artifactId: "course-1",
      blockId: "block-1",
      record: {
        activityKind: "checklist",
        data: { checkedItemIds: ["item-1"] },
        completed: false,
      },
    };
    const port: LearnerActivityPort = {
      load: async () => snapshot,
      save: async () => record,
    };

    await expect(port.load(loadRequest)).resolves.toBe(snapshot);
    await expect(port.save(saveRequest)).resolves.toBe(record);
    expectTypeOf(port.load).returns.resolves.toEqualTypeOf<LearnerActivitySnapshot | null>();
    expectTypeOf(port.save).returns.resolves.toEqualTypeOf<LearnerActivityRecord>();
    expectTypeOf<LearnerActivitySaveRecord>().toEqualTypeOf<{
      activityKind: string;
      data: LearnerActivityData;
      completed: boolean;
    }>();
  });

  it("exposes only the exact learner activity type surfaces", () => {
    expectTypeOf<keyof LearnerActivityPort>().toEqualTypeOf<"load" | "save">();
    expectTypeOf<keyof LearnerActivityLoadRequest>().toEqualTypeOf<"artifactId">();
    expectTypeOf<keyof LearnerActivitySaveRequest>().toEqualTypeOf<
      "artifactId" | "blockId" | "record"
    >();
    expectTypeOf<keyof LearnerActivitySaveRecord>().toEqualTypeOf<
      "activityKind" | "data" | "completed"
    >();
    expectTypeOf<LearnerActivityPort>().toEqualTypeOf<{
      load: (request: LearnerActivityLoadRequest) => Promise<LearnerActivitySnapshot | null>;
      save: (request: LearnerActivitySaveRequest) => Promise<LearnerActivityRecord>;
    }>();
    expectTypeOf<LearnerActivityLoadRequest>().toEqualTypeOf<{ artifactId: string }>();
    expectTypeOf<LearnerActivitySaveRequest>().toEqualTypeOf<{
      artifactId: string;
      blockId: string;
      record: LearnerActivitySaveRecord;
    }>();
    expectTypeOf<LearnerActivitySaveRecord>().toEqualTypeOf<{
      activityKind: string;
      data: LearnerActivityData;
      completed: boolean;
    }>();
  });
});
