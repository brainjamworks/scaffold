import { describe, expect, it } from "vite-plus/test";

import type { LearnerPublicationPayload } from "@scaffold/core/ports";

import { createXBlockLearnerPublicationPort } from "./learner-publication-port";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

const initialStatus = {
  currentArtifactRevision: "revision-1",
  publishedArtifactRevision: null,
  publishedAt: null,
};

const payload: LearnerPublicationPayload = {
  sourceArtifactRevision: "revision-1",
  artifact: {
    id: "usage-v1",
    title: "Published title",
    mode: "page",
    requiresScaffoldPlus: false,
  },
  learnerContent: { type: "doc", content: [] },
  assessmentTargets: [],
  assessmentGroups: [],
};

class PublicationBridge implements XBlockInnerBridge {
  readonly requests: Array<{ type: string; payload: unknown }> = [];

  constructor(private readonly response: unknown) {}

  destroy(): void {}
  requestHostScroll(): void {}
  sendReady(): void {}
  reportHeight(): void {}
  reportDirty(): void {}
  reportFatalError(): void {}

  request<TResult = unknown>(
    type: "publication.publish",
    requestPayload: unknown,
  ): Promise<TResult> {
    this.requests.push({ type, payload: requestPayload });
    return Promise.resolve(this.response as TResult);
  }
}

describe("createXBlockLearnerPublicationPort", () => {
  it("publishes without saving and adopts the authoritative status", async () => {
    const publishedStatus = {
      currentArtifactRevision: "revision-1",
      publishedArtifactRevision: "revision-1",
      publishedAt: "2026-08-10T10:00:00Z",
    };
    const bridge = new PublicationBridge({
      success: true,
      publicationStatus: publishedStatus,
    });
    const port = createXBlockLearnerPublicationPort(bridge, initialStatus);

    await expect(port.getStatus()).resolves.toBe(initialStatus);
    await expect(port.publish(payload)).resolves.toEqual(publishedStatus);
    await expect(port.getStatus()).resolves.toEqual(publishedStatus);
    expect(bridge.requests).toEqual([{ type: "publication.publish", payload }]);
  });

  it("returns a typed stale refusal and retains the previous status", async () => {
    const bridge = new PublicationBridge({
      success: false,
      error: "stale-artifact-revision",
    });
    const port = createXBlockLearnerPublicationPort(bridge, initialStatus);

    await expect(port.publish(payload)).rejects.toMatchObject({
      code: "stale-artifact-revision",
    });
    await expect(port.getStatus()).resolves.toBe(initialStatus);
  });
});
