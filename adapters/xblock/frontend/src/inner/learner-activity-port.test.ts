import type { LearnerActivityPort } from "@scaffold/core/ports";
import { describe, expect, it } from "vite-plus/test";

import type { XBlockBridgeRequestType } from "../bridge/protocol";
import { createXBlockLearnerActivityPort } from "./learner-activity-port";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

const snapshot = {
  snapshotVersion: 1 as const,
  artifactId: "artifact-1",
  activities: {
    "block-1": {
      activityKind: "checklist",
      data: { checkedItemIds: ["item-1"] },
      completed: false,
      updatedAt: "2026-07-17T12:30:45+00:00",
    },
  },
};

const authoritativeRecord = {
  activityKind: "checklist",
  data: { checkedItemIds: ["item-1"] },
  completed: true,
  updatedAt: "2026-07-17T12:35:00+00:00",
};

class RecordingBridge implements XBlockInnerBridge {
  constructor(
    private readonly respond: (type: XBlockBridgeRequestType, payload: unknown) => unknown,
  ) {}

  readonly requests: Array<{ type: XBlockBridgeRequestType; payload: unknown }> = [];

  destroy(): void {}

  async request<TResult = unknown, TPayload = unknown>(
    type: XBlockBridgeRequestType,
    payload: TPayload,
  ): Promise<TResult> {
    this.requests.push({ type, payload });
    return (await this.respond(type, payload)) as TResult;
  }

  sendReady(): void {}
  reportHeight(): void {}
  reportDirty(): void {}
  reportFatalError(): void {}
}

describe("createXBlockLearnerActivityPort", () => {
  it("loads null when the host has no persisted snapshot", async () => {
    const bridge = new RecordingBridge(() => null);
    const port: LearnerActivityPort = createXBlockLearnerActivityPort(bridge);

    await expect(port.load({ artifactId: "artifact-1" })).resolves.toBeNull();
    expect(bridge.requests).toEqual([
      {
        type: "learnerActivity.load",
        payload: { artifactId: "artifact-1" },
      },
    ]);
  });

  it("parses a complete strict snapshot from the host", async () => {
    const bridge = new RecordingBridge(() => snapshot);
    const port = createXBlockLearnerActivityPort(bridge);

    await expect(port.load({ artifactId: "artifact-1" })).resolves.toEqual(snapshot);
  });

  it("rejects malformed future and foreign load responses", async () => {
    const invalidResponses = [
      [],
      { ...snapshot, provider: "xblock" },
      { ...snapshot, snapshotVersion: 2 },
      { ...snapshot, artifactId: "artifact-2" },
    ];

    for (const response of invalidResponses) {
      const port = createXBlockLearnerActivityPort(new RecordingBridge(() => response));
      await expect(port.load({ artifactId: "artifact-1" })).rejects.toThrow();
    }
  });

  it("propagates rejected host loads", async () => {
    const port = createXBlockLearnerActivityPort(
      new RecordingBridge(() => Promise.reject(new Error("load denied"))),
    );

    await expect(port.load({ artifactId: "artifact-1" })).rejects.toThrow("load denied");
  });

  it("saves the exact port request without a client timestamp", async () => {
    const bridge = new RecordingBridge(() => authoritativeRecord);
    const port = createXBlockLearnerActivityPort(bridge);
    const request = {
      artifactId: "artifact-1",
      blockId: "block-1",
      record: {
        activityKind: "checklist",
        data: { checkedItemIds: ["item-1"] },
        completed: true,
      },
    };

    await expect(port.save(request)).resolves.toEqual(authoritativeRecord);
    expect(bridge.requests).toEqual([
      {
        type: "learnerActivity.save",
        payload: request,
      },
    ]);
    expect(bridge.requests[0]?.payload).not.toHaveProperty("record.updatedAt");
  });

  it("rejects malformed and non-authoritative save responses", async () => {
    const invalidResponses = [
      null,
      { ...authoritativeRecord, score: 1 },
      { ...authoritativeRecord, updatedAt: null },
      { ...authoritativeRecord, updatedAt: "2026-07-17T12:35:00" },
    ];

    for (const response of invalidResponses) {
      const port = createXBlockLearnerActivityPort(new RecordingBridge(() => response));
      await expect(
        port.save({
          artifactId: "artifact-1",
          blockId: "block-1",
          record: {
            activityKind: "checklist",
            data: {},
            completed: false,
          },
        }),
      ).rejects.toThrow();
    }
  });
});
