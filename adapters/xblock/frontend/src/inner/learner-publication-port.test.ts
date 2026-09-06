import { describe, expect, it } from "vite-plus/test";

import type {
  LearnerPublicationPayload,
  LearnerPublicationStatus,
  LearnerPublicationStatusResult,
  LearnerPublishResult,
} from "@scaffold/core/ports";

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

    expect(publicationValue(await port.getStatus())).toBe(initialStatus);
    expect(publicationValue(await port.publish(payload))).toEqual(publishedStatus);
    expect(publicationValue(await port.getStatus())).toEqual(publishedStatus);
    expect(bridge.requests).toEqual([{ type: "publication.publish", payload }]);
  });

  it("returns a typed stale refusal and retains the previous status", async () => {
    const bridge = new PublicationBridge({
      success: false,
      error: "stale-artifact-revision",
    });
    const port = createXBlockLearnerPublicationPort(bridge, initialStatus);

    const result = await port.publish(payload);
    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected stale publication to fail");
    expect(result.error).toMatchObject({
      reason: "stale-artifact-revision",
      artifactId: "usage-v1",
      sourceArtifactRevision: "revision-1",
      cause: expect.any(Error),
    });
    expect(publicationValue(await port.getStatus())).toBe(initialStatus);
  });

  it.each([
    { error: "authoring permission required", reason: "forbidden" },
    { error: "invalid-publication: learner content is invalid", reason: "invalid-payload" },
    { error: "publication-write-failed", reason: "write-aborted" },
  ] as const)("classifies $reason at the XBlock boundary", async ({ error, reason }) => {
    const port = createXBlockLearnerPublicationPort(
      new PublicationBridge({ success: false, error }),
      initialStatus,
    );

    const result = await port.publish(payload);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error(`expected ${reason} publication failure`);
    expect(result.error).toMatchObject({
      reason,
      artifactId: "usage-v1",
      cause: expect.any(Error),
    });
  });

  it.each([
    ["unknown response", "temporary host failure"],
    ["publication-like unknown response", "publication storage unavailable"],
    ["empty response", ""],
    ["non-string response", { reason: "publication-write-failed" }],
  ])("keeps %s observable", async (_label, error) => {
    const port = createXBlockLearnerPublicationPort(
      new PublicationBridge({ success: false, error }),
      initialStatus,
    );

    await expect(port.publish(payload)).rejects.toMatchObject({
      message: expect.stringMatching(/publication refusal/),
      cause: expect.anything(),
    });
  });
});

function publicationValue(
  result: LearnerPublicationStatusResult | LearnerPublishResult,
): LearnerPublicationStatus {
  if (result.isErr()) throw new Error("expected publication operation to succeed");
  return result.value;
}
